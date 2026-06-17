'use strict'

const mongoose = require('mongoose')
const MarketWeek = require('../models/MarketWeek')
const { bootstrapFarmerPayments } = require('../modules/bootstrapFarmerPayments')
const { transitionWeekState } = require('../modules/stateMachine/transitionExecutor')
const { validateTransitionGate } = require('../modules/stateMachine/transitionGateValidators')
const { aggregateWeeklySummary } = require('../modules/weeklySummaryAggregator')
const {
  AppError,
  MarketWeekNotFoundError,
  TransitionGateBlocked
} = require('../lib/errors')

const WEEK_STATES = [
  'setup',
  'open',
  'locked',
  'delivery',
  'market_day',
  'reconciliation',
  'closed'
]

const integerPaiseSchema = {
  type: 'integer',
  minimum: 0
}

/**
 * @param {Date|string} value
 * @returns {string|null}
 */
function toIsoString (value) {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

/**
 * @param {object} week
 * @param {{ includeBalances?: boolean }} [opts]
 */
function toWeekListItem (week, { includeBalances = true } = {}) {
  const item = {
    weekId: week.week_id,
    marketDate: toIsoString(week.market_date),
    state: week.state,
    closedAt: week.closed_at ? toIsoString(week.closed_at) : null
  }
  if (includeBalances) {
    item.openingBalanceCash = week.opening_balance_cash
    item.openingBalanceBank = week.opening_balance_bank
  }
  return item
}

/**
 * @param {object} week
 * @param {{ includeBalances?: boolean }} [opts]
 */
function toWeekDetail (week, opts = {}) {
  return {
    ...toWeekListItem(week, opts),
    stateHistory: (week.state_history ?? []).map(entry => ({
      fromState: entry.from_state,
      toState: entry.to_state,
      changedAt: toIsoString(entry.changed_at),
      changedBy: entry.changed_by,
      ...(entry.note != null && entry.note !== '' ? { note: entry.note } : {})
    })),
    createdAt: toIsoString(week.created_at),
    createdBy: week.created_by
  }
}

/**
 * @param {string} marketDateStr
 * @returns {{ weekId: string, marketDate: Date }}
 */
function parseMarketDate (marketDateStr) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(marketDateStr))
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    const marketDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    return { weekId: `wk-${y}-${m}-${d}`, marketDate }
  }

  const marketDate = new Date(marketDateStr)
  if (Number.isNaN(marketDate.getTime())) {
    throw new AppError('VALIDATION_ERROR', 400, 'marketDate must be a valid ISO-8601 date', {
      marketDate: marketDateStr
    })
  }
  const isoDay = marketDate.toISOString().slice(0, 10)
  return { weekId: `wk-${isoDay}`, marketDate: new Date(`${isoDay}T00:00:00.000Z`) }
}

/**
 * @param {object} summary
 */
function toClosedTransitionSummary (summary) {
  return {
    summaryId: summary.summary_id,
    weekId: summary.week_id,
    closingBalanceCash: summary.closing_balance_cash,
    closingBalanceBank: summary.closing_balance_bank
  }
}

async function weeksRoutes (fastify) {
  fastify.get('/weeks', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: WEEK_STATES },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 52 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { state } = request.query
    const limit = request.query.limit ?? 52
    const offset = request.query.offset ?? 0

    const filter = {}
    if (state) filter.state = state

    const [weeks, total] = await Promise.all([
      MarketWeek.find(filter)
        .sort({ market_date: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      MarketWeek.countDocuments(filter)
    ])

    return {
      weeks: weeks.map(toWeekListItem),
      total
    }
  })

  fastify.post('/weeks', {
    schema: {
      body: {
        type: 'object',
        required: ['marketDate', 'openingBalanceCash', 'openingBalanceBank'],
        additionalProperties: false,
        properties: {
          marketDate: { type: 'string', format: 'date' },
          openingBalanceCash: integerPaiseSchema,
          openingBalanceBank: integerPaiseSchema
        }
      }
    }
  }, async (request, reply) => {
    const { marketDate: marketDateInput, openingBalanceCash, openingBalanceBank } = request.body
    const { weekId, marketDate } = parseMarketDate(marketDateInput)

    const existing = await MarketWeek.findOne({ market_date: marketDate }).lean()
    if (existing) {
      throw new AppError(
        'DUPLICATE_MARKET_DATE',
        409,
        `A market week already exists for ${marketDateInput}`,
        { marketDate: marketDateInput }
      )
    }

    try {
      const week = await MarketWeek.create({
        week_id: weekId,
        market_date: marketDate,
        state: 'setup',
        opening_balance_cash: openingBalanceCash,
        opening_balance_bank: openingBalanceBank,
        state_history: [],
        created_by: request.user.uid
      })

      return reply.code(201).send(toWeekDetail(week.toObject()))
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(
          'DUPLICATE_MARKET_DATE',
          409,
          `A market week already exists for ${marketDateInput}`,
          { marketDate: marketDateInput }
        )
      }
      throw err
    }
  })

  fastify.get('/weeks/:weekId', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: {
          weekId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const week = await MarketWeek.findOne({ week_id: request.params.weekId }).lean()
    if (!week) {
      throw new MarketWeekNotFoundError(
        `Market week not found: ${request.params.weekId}`,
        { weekId: request.params.weekId }
      )
    }
    const includeBalances = request.user.role !== 'volunteer'
    return toWeekDetail(week, { includeBalances })
  })

  fastify.patch('/weeks/:weekId/state', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: {
          weekId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['targetState'],
        additionalProperties: false,
        properties: {
          targetState: { type: 'string', enum: WEEK_STATES },
          note: { type: 'string', maxLength: 500 }
        }
      }
    }
  }, async (request) => {
    const { weekId } = request.params
    const { targetState, note } = request.body

    const week = await MarketWeek.findOne({ week_id: weekId }).lean()
    if (!week) {
      throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
    }

    const currentState = week.state
    const operatorId = request.user.uid

    fastify.assertValidTransition(currentState, targetState)

    const gateResult = await validateTransitionGate(currentState, targetState, weekId)
    if (!gateResult.ok) {
      throw new TransitionGateBlocked(
        `Transition to ${targetState} blocked`,
        { weekId, currentState, targetState, blockers: gateResult.blockers }
      )
    }

    if (targetState === 'closed') {
      const session = await mongoose.startSession()
      try {
        let summaryDoc
        await session.withTransaction(async () => {
          summaryDoc = await aggregateWeeklySummary({
            weekId,
            operatorId,
            session
          })
          await transitionWeekState({
            weekId,
            fromState: currentState,
            toState: targetState,
            operatorId,
            note,
            session
          })
        })

        return {
          ok: true,
          weekId,
          previousState: currentState,
          newState: targetState,
          summary: toClosedTransitionSummary(summaryDoc)
        }
      } finally {
        await session.endSession()
      }
    }

    const { week: updatedWeek, previousState, newState } = await transitionWeekState({
      weekId,
      fromState: currentState,
      toState: targetState,
      operatorId,
      note
    })

    if (newState === 'reconciliation') {
      try {
        await bootstrapFarmerPayments(weekId, request.user.uid)
      } catch (err) {
        request.log.error(
          { err, weekId },
          'bootstrapFarmerPayments failed — manual recovery required'
        )
      }
    }

    return {
      ok: true,
      weekId,
      previousState,
      newState,
      week: {
        weekId: updatedWeek.week_id,
        state: updatedWeek.state,
        marketDate: toIsoString(updatedWeek.market_date)
      }
    }
  })
}

module.exports = weeksRoutes
