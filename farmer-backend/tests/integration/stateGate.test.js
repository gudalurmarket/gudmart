'use strict'

require('./helpers/setup')

const MarketWeek = require('../../server/models/MarketWeek')
const CustomerOrder = require('../../server/models/CustomerOrder')
const {
  http,
  authHeaders,
  seedWeek,
  seedCustomer,
  seedProduceItem
} = require('./helpers/setup')

describe('state machine gates (integration)', () => {
  it('blocks create_order in locked state with ACTION_NOT_PERMITTED_IN_STATE', async () => {
    const { weekId } = await seedWeek('locked')
    const { customerId } = await seedCustomer(50000)
    const { productId } = await seedProduceItem(weekId, 10000)

    const res = await http()
      .post(`/api/v1/weeks/${weekId}/orders`)
      .set(authHeaders())
      .send({
        customerId,
        lineItems: [{ productId, orderedQty: 1, unit: 'kg' }]
      })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      code: 'ACTION_NOT_PERMITTED_IN_STATE',
      httpStatus: 409,
      details: {
        currentState: 'locked',
        permittedStates: expect.arrayContaining(['open'])
      }
    })
  })

  it('blocks setup → open when no produce items exist', async () => {
    const { weekId } = await seedWeek('setup')

    const res = await http()
      .patch(`/api/v1/weeks/${weekId}/state`)
      .set(authHeaders())
      .send({ targetState: 'open' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TRANSITION_GATE_FAILED')
    expect(res.body.details.blockers[0].type).toBe('NO_PRODUCE_ITEMS')
  })

  it('open → locked is no longer blocked by a customer with a negative wallet balance', async () => {
    const { weekId } = await seedWeek('open')
    const { customerId } = await seedCustomer(-5000)
    await seedProduceItem(weekId, 10000)
    expect(customerId).toBeDefined()

    const res = await http()
      .patch(`/api/v1/weeks/${weekId}/state`)
      .set(authHeaders())
      .send({ targetState: 'locked' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('locked')
  })

  it('succeeds open → locked', async () => {
    const { weekId } = await seedWeek('open')
    await seedProduceItem(weekId, 10000)

    const res = await http()
      .patch(`/api/v1/weeks/${weekId}/state`)
      .set(authHeaders())
      .send({ targetState: 'locked' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      newState: 'locked'
    })

    const week = await MarketWeek.findOne({ week_id: weekId }).lean()
    expect(week.state).toBe('locked')
    expect(week.state_history).toHaveLength(1)
    expect(week.state_history[0]).toMatchObject({
      from_state: 'open',
      to_state: 'locked'
    })
  })
})
