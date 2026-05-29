'use strict'

require('./helpers/setup')

const Customer = require('../../server/models/Customer')
const CustomerOrder = require('../../server/models/CustomerOrder')
const WalletTransaction = require('../../server/models/WalletTransaction')
const {
  http,
  authHeaders,
  seedWeek,
  seedCustomer,
  seedProduceItem,
  seedPendingPaymentOrder
} = require('./helpers/setup')

describe('wallet debit and top-up (integration)', () => {
  it('enforces atomic zero-floor debit under concurrent order creation', async () => {
    const { weekId } = await seedWeek('open')
    const { customerId } = await seedCustomer(10000)
    const { productId } = await seedProduceItem(weekId, 8000)

    const orderBody = {
      customerId,
      lineItems: [{ productId, orderedQty: 1, unit: 'kg' }]
    }

    const [first, second] = await Promise.allSettled([
      http()
        .post(`/api/v1/weeks/${weekId}/orders`)
        .set(authHeaders())
        .send(orderBody),
      http()
        .post(`/api/v1/weeks/${weekId}/orders`)
        .set(authHeaders())
        .send(orderBody)
    ])

    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('fulfilled')

    const statuses = [first.value, second.value].map(r => r.body.status)
    expect(statuses.filter(s => s === 'confirmed')).toHaveLength(1)
    expect(statuses.filter(s => s === 'pending_payment')).toHaveLength(1)

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(2000)

    const debitCount = await WalletTransaction.countDocuments({
      customer_id: customerId,
      type: 'order_debit'
    })
    expect(debitCount).toBe(1)
  })

  it('top-up credits wallet and lists coverable pending orders without auto-confirming', async () => {
    const { weekId } = await seedWeek('open')
    const { customerId } = await seedCustomer(0)
    const { orderId } = await seedPendingPaymentOrder({
      weekId,
      customerId,
      orderValue: 20000
    })

    const res = await http()
      .post(`/api/v1/customers/${customerId}/wallet/topup`)
      .set(authHeaders())
      .send({
        amount: 25000,
        channel: 'cash',
        weekId
      })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      walletBalance: 25000
    })
    expect(res.body.pendingOrdersNowCoverable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderId, orderValue: 20000 })
      ])
    )

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(25000)

    const topUp = await WalletTransaction.findOne({
      customer_id: customerId,
      type: 'top_up'
    }).lean()
    expect(topUp).not.toBeNull()
    expect(topUp.amount).toBe(25000)
    expect(topUp.running_balance).toBe(25000)

    const order = await CustomerOrder.findOne({ order_id: orderId }).lean()
    expect(order.status).toBe('pending_payment')
  })

  it('writes running_balance correctly on sequential transactions', async () => {
    const { weekId } = await seedWeek('open')
    const { customerId } = await seedCustomer(0)
    const { productId } = await seedProduceItem(weekId, 10000)

    await http()
      .post(`/api/v1/customers/${customerId}/wallet/topup`)
      .set(authHeaders())
      .send({ amount: 30000, channel: 'cash', weekId })

    await http()
      .post(`/api/v1/weeks/${weekId}/orders`)
      .set(authHeaders())
      .send({
        customerId,
        lineItems: [{ productId, orderedQty: 1, unit: 'kg' }]
      })

    const txns = await WalletTransaction.find({ customer_id: customerId })
      .sort({ created_at: 1 })
      .lean()

    expect(txns).toHaveLength(2)
    expect(txns[0].type).toBe('top_up')
    expect(txns[0].running_balance).toBe(30000)
    expect(txns[1].type).toBe('order_debit')
    expect(txns[1].running_balance).toBe(20000)

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(20000)
  })
})
