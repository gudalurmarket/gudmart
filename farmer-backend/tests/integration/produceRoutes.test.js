'use strict'

require('./helpers/setup')

const mongoose = require('mongoose')
const MarketWeek = require('../../server/models/MarketWeek')
const ProductCatalogue = require('../../server/models/ProductCatalogue')
const WeeklyProduceItem = require('../../server/models/WeeklyProduceItem')
const Customer = require('../../server/models/Customer')
const CustomerOrder = require('../../server/models/CustomerOrder')
const WalletTransaction = require('../../server/models/WalletTransaction')
const { http, authHeaders, OPERATOR_UID } = require('./helpers/setup')

const WEEK_ID = 'wk-test-001'
const PRODUCE_ITEM_ID = 'pi-001'
const PRODUCT_ID = 'prod-tomato'

/**
 * @param {import('mongodb').Db} db
 * @param {object} [opts]
 * @param {string} [opts.weekState]
 * @param {boolean} [opts.includeProduceItem]
 * @param {boolean} [opts.includeOrders]
 */
async function seedFixtures (db, opts = {}) {
  const weekState = opts.weekState ?? 'open'
  const includeProduceItem = opts.includeProduceItem !== false
  const includeOrders = opts.includeOrders === true

  await MarketWeek.collection.insertOne({
    week_id: WEEK_ID,
    state: weekState,
    market_date: new Date('2026-06-07'),
    opening_balance_cash: 0,
    opening_balance_bank: 0,
    closed_at: null,
    state_history: [],
    created_at: new Date(),
    created_by: OPERATOR_UID
  })

  await ProductCatalogue.collection.insertOne({
    product_id: PRODUCT_ID,
    name_en: 'Tomato',
    name_ta: 'thakkali',
    default_unit: 'kg',
    active: true,
    created_at: new Date(),
    created_by: OPERATOR_UID
  })

  if (includeProduceItem) {
    await WeeklyProduceItem.collection.insertOne({
      produce_item_id: PRODUCE_ITEM_ID,
      week_id: WEEK_ID,
      product_id: PRODUCT_ID,
      unit: 'kg',
      price_per_unit: 5000,
      display_order: 1,
      active: true,
      created_at: new Date(),
      created_by: OPERATOR_UID
    })
  }

  await Customer.collection.insertMany([
    {
      customer_id: 'cust-a',
      name: 'Anitha',
      phone: '+919900000001',
      wallet_balance: includeOrders ? 10000 : 20000,
      active: true,
      created_at: new Date(),
      created_by: OPERATOR_UID
    },
    {
      customer_id: 'cust-b',
      name: 'Banu',
      phone: '+919900000002',
      wallet_balance: includeOrders ? 100 : 5100,
      active: true,
      created_at: new Date(),
      created_by: OPERATOR_UID
    }
  ])

  if (!includeOrders) {
    return { weekId: WEEK_ID, produceItemId: PRODUCE_ITEM_ID }
  }

  await CustomerOrder.collection.insertMany([
    {
      order_id: 'ord-a',
      week_id: WEEK_ID,
      customer_id: 'cust-a',
      status: 'confirmed',
      fcfs_timestamp: new Date(),
      order_value: 10000,
      wallet_debited: 10000,
      wallet_txn_id: 'txn-a',
      balance_due: 0,
      balance_cleared: false,
      line_items: [{
        line_item_id: 'li-a1',
        product_id: PRODUCT_ID,
        ordered_qty: 2,
        unit: 'kg',
        price_per_unit: 5000,
        line_value: 10000,
        delivered_qty: 0,
        difference_confirmed: false
      }],
      created_at: new Date(),
      created_by: OPERATOR_UID
    },
    {
      order_id: 'ord-b',
      week_id: WEEK_ID,
      customer_id: 'cust-b',
      status: 'confirmed',
      fcfs_timestamp: new Date(),
      order_value: 5000,
      wallet_debited: 5000,
      wallet_txn_id: 'txn-b',
      balance_due: 0,
      balance_cleared: false,
      line_items: [{
        line_item_id: 'li-b1',
        product_id: PRODUCT_ID,
        ordered_qty: 1,
        unit: 'kg',
        price_per_unit: 5000,
        line_value: 5000,
        delivered_qty: 0,
        difference_confirmed: false
      }],
      created_at: new Date(),
      created_by: OPERATOR_UID
    }
  ])

  await WalletTransaction.collection.insertMany([
    {
      txn_id: 'txn-a',
      customer_id: 'cust-a',
      week_id: WEEK_ID,
      type: 'order_debit',
      amount: 10000,
      channel: 'system',
      reference_note: 'fixture:ord-a',
      running_balance: 10000,
      created_at: new Date(),
      created_by: OPERATOR_UID
    },
    {
      txn_id: 'txn-b',
      customer_id: 'cust-b',
      week_id: WEEK_ID,
      type: 'order_debit',
      amount: 5000,
      channel: 'system',
      reference_note: 'fixture:ord-b',
      running_balance: 100,
      created_at: new Date(),
      created_by: OPERATOR_UID
    }
  ])

  return { weekId: WEEK_ID, produceItemId: PRODUCE_ITEM_ID }
}

async function cleanupFixtures () {
  const db = mongoose.connection.db
  await db.collection('wallet_transactions').deleteMany({
    $or: [
      { week_id: WEEK_ID },
      { customer_id: { $in: ['cust-a', 'cust-b'] } }
    ]
  })
  await db.collection('customer_orders').deleteMany({ week_id: WEEK_ID })
  await db.collection('weekly_produce_items').deleteMany({ week_id: WEEK_ID })
  await db.collection('customers').deleteMany({ customer_id: { $in: ['cust-a', 'cust-b'] } })
  await db.collection('product_catalogue').deleteMany({ product_id: PRODUCT_ID })
  await db.collection('market_weeks').deleteMany({ week_id: WEEK_ID })
}

function expectAffectedOrder (body, orderId, newStatus) {
  expect(body.affectedOrders).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ orderId, newStatus })
    ])
  )
}

describe('GET /api/v1/weeks/:weekId/produce', () => {
  beforeEach(async () => {
    await seedFixtures(mongoose.connection.db, { includeOrders: false })
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('returns produce items for the week sorted by display_order', async () => {
    const res = await http()
      .get(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({
      produceItemId: PRODUCE_ITEM_ID,
      pricePerUnit: 5000,
      displayOrder: 1
    })
  })

  it('excludes soft-deleted items in open state', async () => {
    await WeeklyProduceItem.updateOne(
      { produce_item_id: PRODUCE_ITEM_ID },
      { $set: { active: false } }
    )

    const res = await http()
      .get(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(0)
  })
})

describe('POST /api/v1/weeks/:weekId/produce', () => {
  beforeEach(async () => {
    await seedFixtures(mongoose.connection.db, {
      weekState: 'open',
      includeProduceItem: false,
      includeOrders: false
    })
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('adds a produce item in setup state — success', async () => {
    await cleanupFixtures()
    await seedFixtures(mongoose.connection.db, {
      weekState: 'setup',
      includeProduceItem: false,
      includeOrders: false
    })

    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({
        productId: PRODUCT_ID,
        unit: 'kg',
        pricePerUnit: 4000,
        displayOrder: 1
      })

    expect(res.status).toBe(201)
    expect(res.body.produceItemId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(res.body.pricePerUnit).toBe(4000)
  })

  it('adds a produce item in open state — success', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({
        productId: PRODUCT_ID,
        unit: 'kg',
        pricePerUnit: 4000,
        displayOrder: 1
      })

    expect(res.status).toBe(201)
    expect(res.body.pricePerUnit).toBe(4000)
  })

  it('rejects duplicate (week_id, product_id)', async () => {
    const body = {
      productId: PRODUCT_ID,
      unit: 'kg',
      pricePerUnit: 4000,
      displayOrder: 1
    }

    const first = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send(body)
    expect(first.status).toBe(201)

    const second = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send(body)

    expect(second.status).toBe(409)
    expect(second.body.code).toBe('DUPLICATE_PRODUCE_ITEM')
  })

  it('rejects in locked state — 409 ActionNotAllowedError', async () => {
    await cleanupFixtures()
    await seedFixtures(mongoose.connection.db, {
      weekState: 'locked',
      includeProduceItem: false,
      includeOrders: false
    })

    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({
        productId: PRODUCT_ID,
        unit: 'kg',
        pricePerUnit: 4000,
        displayOrder: 1
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })
})

describe('PATCH /api/v1/weeks/:weekId/produce/:itemId — price increase, wallet covers', () => {
  beforeEach(async () => {
    await seedFixtures(mongoose.connection.db, { includeOrders: true })
    await Customer.updateOne(
      { customer_id: 'cust-b' },
      { $set: { wallet_balance: 20000 } }
    )
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('Branch A — price increase, customerA wallet covers delta', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/produce/${PRODUCE_ITEM_ID}`)
      .set(authHeaders())
      .send({ pricePerUnit: 6000 })

    expect(res.status).toBe(200)
    expect(res.body.pricePerUnit).toBe(6000)
    expectAffectedOrder(res.body, 'ord-a', 'confirmed')

    const orderA = await CustomerOrder.findOne({ order_id: 'ord-a' }).lean()
    expect(orderA.status).toBe('confirmed')
    expect(orderA.order_value).toBe(12000)
    expect(orderA.wallet_debited).toBe(12000)

    const customerA = await Customer.findOne({ customer_id: 'cust-a' }).lean()
    expect(customerA.wallet_balance).toBe(8000)

    const deltaDebit = await WalletTransaction.findOne({
      customer_id: 'cust-a',
      week_id: WEEK_ID,
      type: 'order_debit',
      amount: 2000
    }).lean()
    expect(deltaDebit).not.toBeNull()
  })
})

describe('PATCH — price increase, wallet does NOT cover (Branch B)', () => {
  beforeEach(async () => {
    await seedFixtures(mongoose.connection.db, { includeOrders: true })
    await Customer.updateOne(
      { customer_id: 'cust-b' },
      { $set: { wallet_balance: 100 } }
    )
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('Branch B — price increase, customerB wallet shortfall → pending_payment', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/produce/${PRODUCE_ITEM_ID}`)
      .set(authHeaders())
      .send({ pricePerUnit: 6000 })

    expect(res.status).toBe(200)
    expectAffectedOrder(res.body, 'ord-b', 'pending_payment')

    const orderB = await CustomerOrder.findOne({ order_id: 'ord-b' }).lean()
    expect(orderB.status).toBe('pending_payment')
    expect(orderB.pending_reason).toBe('Price change — wallet shortfall')
    expect(orderB.wallet_debited).toBe(0)
    expect(orderB.wallet_txn_id).toBeNull()

    const customerB = await Customer.findOne({ customer_id: 'cust-b' }).lean()
    expect(customerB.wallet_balance).toBe(5100)

    const reversal = await WalletTransaction.findOne({
      customer_id: 'cust-b',
      type: 'order_debit_reversal',
      amount: 5000
    }).lean()
    expect(reversal).not.toBeNull()
  })
})

describe('PATCH — price decrease (Branch C)', () => {
  beforeEach(async () => {
    await seedFixtures(mongoose.connection.db, { includeOrders: true })
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('Branch C — price decrease → wallet credited, order stays confirmed', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/produce/${PRODUCE_ITEM_ID}`)
      .set(authHeaders())
      .send({ pricePerUnit: 4000 })

    expect(res.status).toBe(200)
    expectAffectedOrder(res.body, 'ord-a', 'confirmed')

    const orderA = await CustomerOrder.findOne({ order_id: 'ord-a' }).lean()
    expect(orderA.status).toBe('confirmed')
    expect(orderA.order_value).toBe(8000)
    expect(orderA.wallet_debited).toBe(8000)

    const customerA = await Customer.findOne({ customer_id: 'cust-a' }).lean()
    expect(customerA.wallet_balance).toBe(12000)

    const reversal = await WalletTransaction.findOne({
      customer_id: 'cust-a',
      type: 'order_debit_reversal',
      amount: 10000
    }).lean()
    expect(reversal).not.toBeNull()

    const newDebit = await WalletTransaction.findOne({
      customer_id: 'cust-a',
      type: 'order_debit',
      amount: 8000
    }).lean()
    expect(newDebit).not.toBeNull()
  })
})

describe('PATCH — state gate enforcement', () => {
  beforeEach(async () => {
    await seedFixtures(mongoose.connection.db, { includeOrders: false })
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('rejects price edit in locked state — 409', async () => {
    await cleanupFixtures()
    await seedFixtures(mongoose.connection.db, {
      weekState: 'locked',
      includeOrders: false
    })

    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/produce/${PRODUCE_ITEM_ID}`)
      .set(authHeaders())
      .send({ pricePerUnit: 6000 })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('rejects soft-delete (active: false) in open state — 409', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/produce/${PRODUCE_ITEM_ID}`)
      .set(authHeaders())
      .send({ active: false })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('allows soft-delete in setup state — 200', async () => {
    await cleanupFixtures()
    await seedFixtures(mongoose.connection.db, {
      weekState: 'setup',
      includeOrders: false
    })

    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/produce/${PRODUCE_ITEM_ID}`)
      .set(authHeaders())
      .send({ active: false })

    expect(res.status).toBe(200)

    const item = await WeeklyProduceItem.findOne({
      produce_item_id: PRODUCE_ITEM_ID
    }).lean()
    expect(item.active).toBe(false)
  })
})
