'use strict'

require('./helpers/setup')

const Customer = require('../../server/models/Customer')
const WalletTransaction = require('../../server/models/WalletTransaction')
const {
  http,
  authHeaders,
  seedWeek,
  seedCustomer,
  seedProduceItem
} = require('./helpers/setup')

describe('POST /api/v1/weeks/:weekId/orders', () => {
  let weekId
  let customerId
  let productId

  beforeEach(async () => {
    const week = await seedWeek('open')
    weekId = week.weekId
    const customer = await seedCustomer(50000)
    customerId = customer.customerId
    const produce = await seedProduceItem(weekId, 10000)
    productId = produce.productId
  })

  it('returns confirmed order when wallet covers full order value', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${weekId}/orders`)
      .set(authHeaders())
      .send({
        customerId,
        lineItems: [{ productId, orderedQty: 2, unit: 'kg' }]
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      status: 'confirmed',
      orderValue: 20000,
      walletDebited: 20000,
      shortfallAmount: null
    })
    expect(res.body.fcfsTimestamp).toBeDefined()
    expect(new Date(res.body.fcfsTimestamp).toISOString()).toBe(res.body.fcfsTimestamp)

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(30000)

    const txns = await WalletTransaction.find({
      customer_id: customerId,
      type: 'order_debit'
    }).lean()
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(20000)
  })

  it('returns pending_payment when wallet is insufficient', async () => {
    await Customer.updateOne(
      { customer_id: customerId },
      { $set: { wallet_balance: 5000 } }
    )

    const res = await http()
      .post(`/api/v1/weeks/${weekId}/orders`)
      .set(authHeaders())
      .send({
        customerId,
        lineItems: [{ productId, orderedQty: 2, unit: 'kg' }]
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      status: 'pending_payment',
      orderValue: 20000,
      walletDebited: 0,
      shortfallAmount: 15000
    })

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(5000)

    const txnCount = await WalletTransaction.countDocuments({ customer_id: customerId })
    expect(txnCount).toBe(0)
  })

  it('returns 400 when productId is not in weekly produce list', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${weekId}/orders`)
      .set(authHeaders())
      .send({
        customerId,
        lineItems: [{ productId: 'nonexistent-id', orderedQty: 1, unit: 'kg' }]
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PRODUCE_ITEM_NOT_FOUND')
  })
})
