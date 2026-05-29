'use strict'

const { randomUUID } = require('node:crypto')
const fastify = require('fastify')
const MarketWeek = require('../../server/models/MarketWeek')
const {
  stateGuardPreHandler
} = require('../../server/plugins/stateGuard')
const { ActionNotAllowedError } = require('../../server/lib/errors')

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

describe('stateGuard plugin', () => {
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
    await require('../../server/plugins/stateMachineGuard')(app)
    app.addHook('preHandler', stateGuardPreHandler)
    app.post('/weeks/:weekId/orders', {
      config: { action: 'create_order' },
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

  it('allows action when week state permits it', async () => {
    const weekId = await createWeek({ state: 'open' })
    createdWeekIds.push(weekId)

    const res = await app.inject({
      method: 'POST',
      url: `/weeks/${weekId}/orders`
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ marketState: 'open' })
  })

  it('blocks action with ACTION_NOT_PERMITTED_IN_STATE when state does not permit it', async () => {
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

  it('passes through routes without config.action', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })

  it('throws ActionNotAllowedError instance for blocked actions', async () => {
    const weekId = await createWeek({ state: 'closed' })
    createdWeekIds.push(weekId)

    await expect(
      stateGuardPreHandler({
        routeOptions: { config: { action: 'create_order' } },
        params: { weekId }
      })
    ).rejects.toThrow(ActionNotAllowedError)
  })
})
