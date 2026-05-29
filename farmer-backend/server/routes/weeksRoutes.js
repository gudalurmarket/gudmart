'use strict'

const MarketWeek = require('../models/MarketWeek')
const { transitionWeekState } = require('../modules/stateMachine/transitionExecutor')
const { validateTransitionGate } = require('../modules/stateMachine/transitionGateValidators')
const { generateWeeklySummary } = require('../modules/weeklySummary/aggregateSummary')
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
 */
function toWeekListItem (week) {
  return {
    weekId: week.week_id,
    marketDate: toIsoString(week.market_date),
    state: week.state,
    openingBalanceCash: week.opening_balance_cash,
    openingBalanceBank: week.opening_balance_bank,
    closedAt: week.closed_at ? toIsoString(week.closed_at) : null
  }
}

/**
 * @param {object} week
 */
function toWeekDetail (week) {
  return {
    ...toWeekListItem(week),
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
    return toWeekDetail(week)
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
  }, async (request, reply) => {
    const { weekId } = request.params
    const { targetState, note } = request.body

    const week = await MarketWeek.findOne({ week_id: weekId }).lean()
    if (!week) {
      throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
    }

    const currentState = week.state

    fastify.assertValidTransition(currentState, targetState)

    const gateResult = await validateTransitionGate(currentState, targetState, weekId)
    if (!gateResult.ok) {
      throw new TransitionGateBlocked(
        `Transition to ${targetState} blocked`,
        { weekId, currentState, targetState, blockers: gateResult.blockers }
      )
    }

    const operatorId = request.user.uid

    if (targetState === 'closed') {
      const session = fastify.mongo.client.startSession()
      try {
        let summaryResult
        await session.withTransaction(async () => {
          await transitionWeekState({
            weekId,
            fromState: currentState,
            toState: targetState,
            operatorId,
            note,
            session
          })

          summaryResult = await generateWeeklySummary(
            weekId,
            fastify.db,
            session,
            request.user.uid
          )
        })

        return reply.send({
          ok: true,
          weekId,
          previousState: currentState,
          newState: 'closed',
          summary: {
            summaryId: summaryResult.summary_id,
            weekId: summaryResult.week_id,
            closingBalanceCash: summaryResult.closing_balance_cash,
            closingBalanceBank: summaryResult.closing_balance_bank,
            generatedAt: toIsoString(summaryResult.generated_at)
          }
        })
      } catch (err) {
        throw err
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
