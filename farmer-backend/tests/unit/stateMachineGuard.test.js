'use strict'

const { randomUUID } = require('node:crypto')
const fastify = require('fastify')
const MarketWeek = require('../../server/models/MarketWeek')
const stateMachineGuardPlugin = require('../../server/plugins/stateMachineGuard')
const {
  assertValidTransition,
  enforceActionAllowed,
  stateMachineGuardPreHandler,
  resolveWeekId
} = require('../../server/plugins/stateMachineGuard')
const {
  WEEK_STATES,
  PERMITTED_TRANSITIONS,
  PERMITTED_ACTIONS,
  InvalidStateTransitionError
} = require('../../server/modules/stateMachine')
const {
  ActionNotAllowedError,
  MarketWeekNotFoundError
} = require('../../server/lib/errors')

const OPERATOR_ID = 'firebase-op-001'

async function createWeek ({ weekId, state = 'open' } = {}) {
  const id = weekId ?? `week-${randomUUID()}`
  const marketDate = new Date(Date.now() + Math.floor(Math.random() * 86400000))
  await MarketWeek.collection.insertOne({
    week_id: id,
    market_date: marketDate,
    state,
    opening_balance_cash: 0,
    opening_balance_bank: 0,
    state_history: [],
    created_at: new Date(),
    created_by: OPERATOR_ID
  })
  return id
}

function buildApp () {
  const app = fastify({ logger: false })
  app.setErrorHandler((error, request, reply) => {
    const status = error.httpStatus ?? 500
    reply.code(status).send({
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.message,
      ...(error.details && { details: error.details })
    })
  })
  return app
}

describe('stateMachineGuard — assertValidTransition', () => {
  describe('valid transitions pass', () => {
    for (const [fromState, targets] of Object.entries(PERMITTED_TRANSITIONS)) {
      for (const toState of targets) {
        it(`allows ${fromState} → ${toState}`, () => {
          expect(() => assertValidTransition(fromState, toState)).not.toThrow()
        })
      }
    }
  })

  describe('invalid transitions fail', () => {
    const validPairs = new Set()
    for (const [from, targets] of Object.entries(PERMITTED_TRANSITIONS)) {
      for (const to of targets) {
        validPairs.add(`${from}→${to}`)
      }
    }

    it.each([
      ['setup', 'locked', 'state skip'],
      ['setup', 'delivery', 'state skip'],
      ['open', 'setup', 'backward transition'],
      ['locked', 'open', 'backward transition'],
      ['open', 'open', 'self-transition'],
      ['delivery', 'delivery', 'self-transition'],
      ['closed', 'reconciliation', 'terminal state'],
      ['closed', 'open', 'terminal state'],
      ['reconciliation', 'market_day', 'backward transition']
    ])('rejects %s → %s (%s)', (from, to) => {
      expect(() => assertValidTransition(from, to)).toThrow(InvalidStateTransitionError)
    })

    it('rejects every non-canonical pair in the state ladder', () => {
      for (const from of WEEK_STATES) {
        for (const to of WEEK_STATES) {
          if (validPairs.has(`${from}→${to}`)) continue
          expect(() => assertValidTransition(from, to)).toThrow(InvalidStateTransitionError)
        }
      }
    })

    it('rejects unknown current state', () => {
      expect(() => assertValidTransition('bogus', 'open')).toThrow(
        InvalidStateTransitionError
      )
    })

    it('rejects unknown target state', () => {
      expect(() => assertValidTransition('open', 'bogus')).toThrow(
        InvalidStateTransitionError
      )
    })
  })
})

describe('stateMachineGuard — enforceActionAllowed', () => {
  describe('action gating matches PERMITTED_ACTIONS', () => {
    for (const [action, permittedStates] of Object.entries(PERMITTED_ACTIONS)) {
      describe(action, () => {
        for (const state of WEEK_STATES) {
          const allowed = permittedStates.includes(state)
          const label = allowed ? 'permits' : 'blocks'

          it(`${label} in state "${state}"`, () => {
            if (allowed) {
              expect(() =>
                enforceActionAllowed(action, state, { weekId: 'wk-test' })
              ).not.toThrow()
            } else {
              expect(() =>
                enforceActionAllowed(action, state, { weekId: 'wk-test' })
              ).toThrow(ActionNotAllowedError)

              try {
                enforceActionAllowed(action, state, { weekId: 'wk-test' })
              } catch (err) {
                expect(err.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
                expect(err.httpStatus).toBe(409)
                expect(err.details).toEqual({
                  weekId: 'wk-test',
                  currentState: state,
                  action,
                  permittedStates
                })
              }
            }
          })
        }
      })
    }
  })

  it('throws for unknown action keys', () => {
    expect(() =>
      enforceActionAllowed('not_a_real_action', 'open', { weekId: 'wk-1' })
    ).toThrow('Unknown action: not_a_real_action')
  })
})

describe('stateMachineGuard plugin', () => {
  let app
  const createdWeekIds = []

  afterEach(async () => {
    if (createdWeekIds.length > 0) {
      await MarketWeek.deleteMany({ week_id: { $in: createdWeekIds } })
      createdWeekIds.length = 0
    }
  })

  beforeEach(async () => {
    app = buildApp()
    await stateMachineGuardPlugin(app)
    app.addHook('preHandler', stateMachineGuardPreHandler)
    app.post('/weeks/:weekId/orders', {
      config: { action: 'create_order' },
      handler: async (request) => ({ marketState: request.marketState })
    })
    app.post('/weeks/:weekId/lock', {
      config: { action: 'lock_orders' },
      handler: async (request) => ({ marketState: request.marketState })
    })
    app.post('/weeks/:weekId/deliveries', {
      config: { action: 'record_delivered_qty' },
      handler: async (request) => ({ marketState: request.marketState })
    })
    app.get('/health', {
      handler: async () => ({ ok: true })
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('decorates fastify with transition and action helpers', () => {
    expect(typeof app.assertValidTransition).toBe('function')
    expect(typeof app.enforceActionAllowed).toBe('function')
    expect(typeof app.stateMachineGuard).toBe('function')
  })

  it('delegates assertValidTransition on the fastify instance', () => {
    expect(() => app.assertValidTransition('setup', 'open')).not.toThrow()
    expect(() => app.assertValidTransition('setup', 'locked')).toThrow(
      InvalidStateTransitionError
    )
  })

  it('allows gated action when week state permits it', async () => {
    const weekId = await createWeek({ state: 'open' })
    createdWeekIds.push(weekId)

    const res = await app.inject({
      method: 'POST',
      url: `/weeks/${weekId}/orders`
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ marketState: 'open' })
  })

  it('blocks gated action with ACTION_NOT_PERMITTED_IN_STATE when state does not permit it', async () => {
    const weekId = await createWeek({ state: 'locked' })
    createdWeekIds.push(weekId)

    const res = await app.inject({
      method: 'POST',
      url: `/weeks/${weekId}/orders`
    })

    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.payload)
    expect(body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
    expect(body.details).toMatchObject({
      weekId,
      currentState: 'locked',
      action: 'create_order',
      permittedStates: ['open']
    })
  })

  it('gates lock_orders to open only', async () => {
    const openWeek = await createWeek({ state: 'open' })
    const lockedWeek = await createWeek({ state: 'locked' })
    createdWeekIds.push(openWeek, lockedWeek)

    const allowed = await app.inject({
      method: 'POST',
      url: `/weeks/${openWeek}/lock`
    })
    const blocked = await app.inject({
      method: 'POST',
      url: `/weeks/${lockedWeek}/lock`
    })

    expect(allowed.statusCode).toBe(200)
    expect(blocked.statusCode).toBe(409)
    expect(JSON.parse(blocked.payload).code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('gates record_delivered_qty to delivery only', async () => {
    const weekId = await createWeek({ state: 'market_day' })
    createdWeekIds.push(weekId)

    const res = await app.inject({
      method: 'POST',
      url: `/weeks/${weekId}/deliveries`
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.payload).details.action).toBe('record_delivered_qty')
  })

  it('passes through routes without config.action', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })

  it('returns WEEK_ID_REQUIRED when action is set but weekId is missing', async () => {
    const gatedApp = buildApp()
    await stateMachineGuardPlugin(gatedApp)
    gatedApp.addHook('preHandler', stateMachineGuardPreHandler)
    gatedApp.post('/orders', {
      config: { action: 'create_order' },
      handler: async () => ({ ok: true })
    })
    await gatedApp.ready()

    const res = await gatedApp.inject({ method: 'POST', url: '/orders' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload).code).toBe('WEEK_ID_REQUIRED')

    await gatedApp.close()
  })

  it('returns MARKET_WEEK_NOT_FOUND for unknown weekId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/weeks/week-does-not-exist/orders'
    })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.payload).code).toBe('MARKET_WEEK_NOT_FOUND')
  })

  it('throws ActionNotAllowedError from preHandler for blocked actions', async () => {
    const weekId = await createWeek({ state: 'closed' })
    createdWeekIds.push(weekId)

    await expect(
      stateMachineGuardPreHandler({
        routeOptions: { config: { action: 'create_order' } },
        params: { weekId }
      })
    ).rejects.toThrow(ActionNotAllowedError)
  })

  it('throws MarketWeekNotFoundError from preHandler when week is missing', async () => {
    await expect(
      stateMachineGuardPreHandler({
        routeOptions: { config: { action: 'create_order' } },
        params: { weekId: 'missing-week' }
      })
    ).rejects.toThrow(MarketWeekNotFoundError)
  })
})

describe('stateMachineGuard — resolveWeekId', () => {
  it('reads weekId from params, body, and query', () => {
    expect(resolveWeekId({ params: { weekId: 'p1' } })).toBe('p1')
    expect(resolveWeekId({ params: { week_id: 'p2' } })).toBe('p2')
    expect(resolveWeekId({ body: { weekId: 'b1' } })).toBe('b1')
    expect(resolveWeekId({ body: { week_id: 'b2' } })).toBe('b2')
    expect(resolveWeekId({ query: { weekId: 'q1' } })).toBe('q1')
    expect(resolveWeekId({ query: { week_id: 'q2' } })).toBe('q2')
    expect(resolveWeekId({})).toBeNull()
  })

  it('prefers params over body and query', () => {
    expect(
      resolveWeekId({
        params: { weekId: 'from-params' },
        body: { weekId: 'from-body' },
        query: { weekId: 'from-query' }
      })
    ).toBe('from-params')
  })
})
