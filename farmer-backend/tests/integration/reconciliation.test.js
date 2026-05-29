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
  seedOrderWithLineDiff
} = require('./helpers/setup')

describe('POST /api/v1/weeks/:weekId/reconciliation/:diffId/confirm', () => {
  let weekId
  let customerId
  let productId

  beforeEach(async () => {
    const week = await seedWeek('reconciliation')
    weekId = week.weekId
    const customer = await seedCustomer(50000)
    customerId = customer.customerId
    const produce = await seedProduceItem(weekId, 10000)
    productId = produce.productId
  })

  it('credits wallet on shortfall price difference confirmation', async () => {
    const { diffId } = await seedOrderWithLineDiff({
      weekId,
      customerId,
      productId,
      orderedQty: 3,
      deliveredQty: 2,
      pricePerUnit: 10000
    })

    const res = await http()
      .post(`/api/v1/weeks/${weekId}/reconciliation/${diffId}/confirm`)
      .set(authHeaders())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      differenceConfirmed: true,
      customerDueCreated: false
    })

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(60000)

    const credit = await WalletTransaction.findOne({
      customer_id: customerId,
      type: 'price_diff_credit'
    }).lean()
    expect(credit).not.toBeNull()
    expect(credit.amount).toBe(10000)

    const order = await CustomerOrder.findOne({
      customer_id: customerId,
      week_id: weekId
    }).lean()
    expect(order.line_items[0].difference_confirmed).toBe(true)
  })

  it('debits wallet on overdelivery when balance is sufficient', async () => {
    const { diffId } = await seedOrderWithLineDiff({
      weekId,
      customerId,
      productId,
      orderedQty: 2,
      deliveredQty: 3,
      pricePerUnit: 10000
    })

    const res = await http()
      .post(`/api/v1/weeks/${weekId}/reconciliation/${diffId}/confirm`)
      .set(authHeaders())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      customerDueCreated: false
    })

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(40000)

    const debit = await WalletTransaction.findOne({
      customer_id: customerId,
      type: 'price_diff_debit'
    }).lean()
    expect(debit).not.toBeNull()
    expect(debit.amount).toBe(10000)
  })

  it('debits to zero and creates customer_due when overdelivery exceeds wallet', async () => {
    await Customer.updateOne(
      { customer_id: customerId },
      { $set: { wallet_balance: 10000 } }
    )

    const { diffId } = await seedOrderWithLineDiff({
      weekId,
      customerId,
      productId,
      orderedQty: 2,
      deliveredQty: 5,
      pricePerUnit: 10000
    })

    const res = await http()
      .post(`/api/v1/weeks/${weekId}/reconciliation/${diffId}/confirm`)
      .set(authHeaders())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      customerDueCreated: true
    })

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    expect(customer.wallet_balance).toBe(0)

    const debit = await WalletTransaction.findOne({
      customer_id: customerId,
      type: 'price_diff_debit'
    }).lean()
    expect(debit.amount).toBe(10000)

    const due = await WalletTransaction.findOne({
      customer_id: customerId,
      type: 'customer_due'
    }).lean()
    expect(due).not.toBeNull()
    expect(due.amount).toBe(20000)
  })
})
