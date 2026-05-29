'use strict'

require('./helpers/setup')

const { randomUUID } = require('node:crypto')
const MarketWeek = require('../../server/models/MarketWeek')
const WeeklyProduceItem = require('../../server/models/WeeklyProduceItem')
const { http, authHeaders } = require('./helpers/setup')

/** @returns {string} unique ISO date for marketDate (avoids duplicate index clashes) */
function uniqueMarketDate () {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6)
  const day = String(parseInt(suffix, 16) % 28 + 1).padStart(2, '0')
  return `2099-11-${day}`
}

describe('weeks routes (integration)', () => {
  const createdWeekIds = []

  describe('POST /api/v1/weeks — create week', () => {
    it('creates a market week in setup with opening balances', async () => {
      const marketDate = uniqueMarketDate()
      const expectedWeekId = `wk-${marketDate}`

      const res = await http()
        .post('/api/v1/weeks')
        .set(authHeaders())
        .send({
          marketDate,
          openingBalanceCash: 500_000,
          openingBalanceBank: 1_200_000
        })

      expect(res.status).toBe(201)
      createdWeekIds.push(res.body.weekId)

      expect(res.body).toMatchObject({
        weekId: expectedWeekId,
        state: 'setup',
        openingBalanceCash: 500_000,
        openingBalanceBank: 1_200_000,
        closedAt: null,
        createdBy: 'test-operator-uid'
      })
      expect(res.body.marketDate).toBeDefined()
      expect(res.body.stateHistory).toEqual([])

      const stored = await MarketWeek.findOne({ week_id: res.body.weekId }).lean()
      expect(stored).not.toBeNull()
      expect(stored.state).toBe('setup')
    })
  })

  describe('PATCH /api/v1/weeks/:weekId/state — valid transition', () => {
    it('transitions setup → open when produce gate passes', async () => {
      const marketDate = uniqueMarketDate()

      const createRes = await http()
        .post('/api/v1/weeks')
        .set(authHeaders())
        .send({
          marketDate,
          openingBalanceCash: 0,
          openingBalanceBank: 0
        })
      expect(createRes.status).toBe(201)
      const { weekId } = createRes.body
      createdWeekIds.push(weekId)

      await WeeklyProduceItem.create({
        produce_item_id: `pi-${randomUUID()}`,
        week_id: weekId,
        product_id: 'prod-test-beans',
        unit: 'kg',
        price_per_unit: 8000,
        display_order: 0,
        created_by: 'test-operator-uid'
      })

      const transitionRes = await http()
        .patch(`/api/v1/weeks/${weekId}/state`)
        .set(authHeaders())
        .send({ targetState: 'open', note: 'Publish week' })

      expect(transitionRes.status).toBe(200)
      expect(transitionRes.body).toMatchObject({
        ok: true,
        weekId,
        previousState: 'setup',
        newState: 'open',
        week: {
          weekId,
          state: 'open'
        }
      })

      const stored = await MarketWeek.findOne({ week_id: weekId }).lean()
      expect(stored.state).toBe('open')
      expect(stored.state_history).toHaveLength(1)
      expect(stored.state_history[0]).toMatchObject({
        from_state: 'setup',
        to_state: 'open',
        changed_by: 'test-operator-uid',
        note: 'Publish week'
      })
    })
  })

  describe('PATCH /api/v1/weeks/:weekId/state — invalid transition', () => {
    it('rejects setup → locked with INVALID_TRANSITION', async () => {
      const marketDate = uniqueMarketDate()

      const createRes = await http()
        .post('/api/v1/weeks')
        .set(authHeaders())
        .send({
          marketDate,
          openingBalanceCash: 0,
          openingBalanceBank: 0
        })
      expect(createRes.status).toBe(201)
      const { weekId } = createRes.body
      createdWeekIds.push(weekId)

      const transitionRes = await http()
        .patch(`/api/v1/weeks/${weekId}/state`)
        .set(authHeaders())
        .send({ targetState: 'locked' })

      expect(transitionRes.status).toBe(409)
      expect(transitionRes.body).toMatchObject({
        code: 'INVALID_TRANSITION',
        httpStatus: 409,
        details: {
          currentState: 'setup',
          targetState: 'locked'
        }
      })

      const stored = await MarketWeek.findOne({ week_id: weekId }).lean()
      expect(stored.state).toBe('setup')
      expect(stored.state_history).toHaveLength(0)
    })
  })
})
