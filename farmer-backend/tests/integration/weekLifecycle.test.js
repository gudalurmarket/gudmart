'use strict'

require('./helpers/setup')

const mongoose = require('mongoose')
const MarketWeek = require('../../server/models/MarketWeek')
const ProductCatalogue = require('../../server/models/ProductCatalogue')
const Farmer = require('../../server/models/Farmer')
const Customer = require('../../server/models/Customer')
const FarmerPayment = require('../../server/models/FarmerPayment')
const FarmerOrderAssignment = require('../../server/models/FarmerOrderAssignment')
const CustomerOrder = require('../../server/models/CustomerOrder')
const WalletTransaction = require('../../server/models/WalletTransaction')
const LocalFarmerInbound = require('../../server/models/LocalFarmerInbound')
const WeeklySummary = require('../../server/models/WeeklySummary')
const {
  http,
  authHeaders,
  OPERATOR_UID,
  setPreserveCollectionsBetweenTests
} = require('./helpers/setup')

const WEEK_ID = 'wk-lifecycle-001'
const PRODUCT_ID = 'prod-tomato-lc'
const CUSTOMER_ID = 'cust-anitha-lc'
const OUTSTATION_FARMER_ID = 'farmer-rajan'
const LOCAL_FARMER_ID = 'farmer-local-kumar'
const ASSIGNMENT_ID = 'assign-001'
const PAYMENT_ID = 'fp-lifecycle-001'

// Known financial values (integer paise)
const OPENING_CASH = 50000
const OPENING_BANK = 120000
const TOPUP_CASH = 30000
const ORDER_VALUE = 10000
const WALKIN_CASH = 4500
const OUTSTATION_FARMER_PAID_CASH = 8000
const LOCAL_FARMER_PAID_CASH = 3000

const CLOSING_CASH =
  OPENING_CASH +
  TOPUP_CASH +
  WALKIN_CASH -
  OUTSTATION_FARMER_PAID_CASH -
  LOCAL_FARMER_PAID_CASH

const CLOSING_BANK = OPENING_BANK

const ORDER_LINE = {
  productId: PRODUCT_ID,
  orderedQty: 2,
  unit: 'kg'
}

/** @type {string | undefined} */
let produceItemId
/** @type {string | undefined} */
let orderId
/** @type {string | undefined} */
let inboundId

async function seedLifecycleFixtures () {
  const db = mongoose.connection.db
  const now = new Date()

  await MarketWeek.collection.insertOne({
    week_id: WEEK_ID,
    state: 'setup',
    market_date: new Date('2026-07-05T00:00:00.000Z'),
    opening_balance_cash: OPENING_CASH,
    opening_balance_bank: OPENING_BANK,
    closed_at: null,
    state_history: [],
    created_at: now,
    created_by: OPERATOR_UID
  })

  await ProductCatalogue.collection.insertOne({
    product_id: PRODUCT_ID,
    name_en: 'Tomato',
    name_ta: 'thakkali',
    default_unit: 'kg',
    active: true,
    created_at: now,
    created_by: OPERATOR_UID
  })

  await Farmer.collection.insertMany([
    {
      farmer_id: OUTSTATION_FARMER_ID,
      name: 'Rajan',
      phone: '+919800000001',
      location: 'Gudalur',
      farmer_type: 'outstation',
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    },
    {
      farmer_id: LOCAL_FARMER_ID,
      name: 'Kumar',
      phone: '+919800000002',
      location: 'Ooty',
      farmer_type: 'local',
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    }
  ])

  await Customer.collection.insertOne({
    customer_id: CUSTOMER_ID,
    name: 'Anitha',
    phone: '+919700000001',
    wallet_balance: 0,
    active: true,
    created_at: now,
    created_by: OPERATOR_UID
  })

  await FarmerPayment.collection.insertOne({
    payment_id: PAYMENT_ID,
    week_id: WEEK_ID,
    farmer_id: OUTSTATION_FARMER_ID,
    amount_due: OUTSTATION_FARMER_PAID_CASH,
    status: 'unpaid',
    amount_paid: 0,
    outstanding: OUTSTATION_FARMER_PAID_CASH,
    channel: null,
    recorded_at: now,
    created_at: now,
    created_by: OPERATOR_UID
  })
}

async function cleanupLifecycleFixtures () {
  const db = mongoose.connection.db
  const weekFilter = { week_id: WEEK_ID }

  await db.collection('weekly_summaries').deleteMany(weekFilter)
  await db.collection('wallet_transactions').deleteMany({
    $or: [weekFilter, { customer_id: CUSTOMER_ID }]
  })
  await db.collection('customer_orders').deleteMany(weekFilter)
  await db.collection('walkin_sales').deleteMany(weekFilter)
  await db.collection('farmer_payments').deleteMany(weekFilter)
  await db.collection('farmer_order_assignments').deleteMany(weekFilter)
  await db.collection('local_farmer_inbound').deleteMany(weekFilter)
  await db.collection('weekly_produce_items').deleteMany(weekFilter)
  await db.collection('market_weeks').deleteMany({ week_id: WEEK_ID })
  await db.collection('customers').deleteMany({ customer_id: CUSTOMER_ID })
  await db.collection('farmers').deleteMany({
    farmer_id: { $in: [OUTSTATION_FARMER_ID, LOCAL_FARMER_ID] }
  })
  await db.collection('product_catalogue').deleteMany({ product_id: PRODUCT_ID })
}

describe('Full week lifecycle — setup → closed', () => {
  beforeAll(async () => {
    setPreserveCollectionsBetweenTests(true)
    await cleanupLifecycleFixtures()
    await seedLifecycleFixtures()
  })

  afterAll(async () => {
    await cleanupLifecycleFixtures()
    setPreserveCollectionsBetweenTests(false)
  })

  it('rejects publish with empty produce list — gate blocked', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'open' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TRANSITION_GATE_FAILED')
    expect(res.body.details.blockers[0].type).toBe('NO_PRODUCE_ITEMS')
  })

  it('adds produce item in setup state', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({
        productId: PRODUCT_ID,
        unit: 'kg',
        pricePerUnit: 5000,
        displayOrder: 1
      })

    expect(res.status).toBe(201)
    expect(res.body.pricePerUnit).toBe(5000)
    produceItemId = res.body.produceItemId
    expect(produceItemId).toBeDefined()
  })

  it('rejects a write action blocked in setup (confirm order)', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [ORDER_LINE]
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('publishes week — setup → open', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'open' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('open')

    const week = await MarketWeek.findOne({ week_id: WEEK_ID }).lean()
    expect(week.state).toBe('open')
    expect(week.state_history).toHaveLength(1)
    expect(week.state_history[0].from_state).toBe('setup')
    expect(week.state_history[0].to_state).toBe('open')
  })

  it('records wallet top-up for Anitha (cash)', async () => {
    const res = await http()
      .post(`/api/v1/customers/${CUSTOMER_ID}/wallet/topup`)
      .set(authHeaders())
      .send({
        amount: TOPUP_CASH,
        channel: 'cash',
        referenceNote: 'advance payment',
        weekId: WEEK_ID
      })

    expect(res.status).toBe(200)
    expect(res.body.walletBalance).toBe(TOPUP_CASH)

    const customer = await Customer.findOne({ customer_id: CUSTOMER_ID }).lean()
    expect(customer.wallet_balance).toBe(TOPUP_CASH)

    const topUp = await WalletTransaction.findOne({
      customer_id: CUSTOMER_ID,
      week_id: WEEK_ID,
      type: 'top_up',
      amount: TOPUP_CASH,
      channel: 'cash'
    }).lean()
    expect(topUp).not.toBeNull()
  })

  it('creates confirmed order for Anitha (2kg tomato = 10000 paise)', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [ORDER_LINE]
      })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('confirmed')
    expect(res.body.orderValue).toBe(ORDER_VALUE)
    expect(res.body.walletDebited).toBe(ORDER_VALUE)
    orderId = res.body.orderId

    const customer = await Customer.findOne({ customer_id: CUSTOMER_ID }).lean()
    expect(customer.wallet_balance).toBe(TOPUP_CASH - ORDER_VALUE)
  })

  it('allows lock when no pending_payment orders exist — gate passes', async () => {
    const pending = await CustomerOrder.countDocuments({
      week_id: WEEK_ID,
      status: 'pending_payment'
    })
    expect(pending).toBe(0)

    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'locked' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('locked')

    const week = await MarketWeek.findOne({ week_id: WEEK_ID }).lean()
    expect(week.state).toBe('locked')
  })

  it('rejects order creation in locked state', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [ORDER_LINE]
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('sets farmer assignment in locked state', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/delivery/${ASSIGNMENT_ID}`)
      .set(authHeaders())
      .send({
        farmerId: OUTSTATION_FARMER_ID,
        productId: PRODUCT_ID,
        preorderQty: 2,
        bufferPct: 10,
        bufferQty: 0.2,
        outgoingQty: 2.2
      })

    expect(res.status).toBe(200)

    const assignment = await FarmerOrderAssignment.findOne({
      assignment_id: ASSIGNMENT_ID,
      week_id: WEEK_ID
    }).lean()
    expect(assignment).not.toBeNull()
    expect(assignment.farmer_id).toBe(OUTSTATION_FARMER_ID)
  })

  it('confirms produce arrived — locked → delivery', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'delivery' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('delivery')
  })

  it('records delivered quantity in delivery state', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/delivery/${ASSIGNMENT_ID}`)
      .set(authHeaders())
      .send({ deliveredQty: 2 })

    expect(res.status).toBe(200)

    const assignment = await FarmerOrderAssignment.findOne({
      assignment_id: ASSIGNMENT_ID,
      week_id: WEEK_ID
    }).lean()
    expect(assignment.delivered_qty).toBe(2)
  })

  it('marks order as packed', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/orders/${orderId}/packed`)
      .set(authHeaders())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('packed')
  })

  it('opens market day — delivery → market_day', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'market_day' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('market_day')
  })

  it('records local farmer inbound', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/localfarmer-inbound`)
      .set(authHeaders())
      .send({
        farmerId: LOCAL_FARMER_ID,
        productId: PRODUCT_ID,
        inboundQty: 5,
        unit: 'kg',
        pricePerUnit: 4000
      })

    expect(res.status).toBe(201)
    inboundId = res.body.inboundId
    expect(inboundId).toBeDefined()
  })

  it('records walk-in sale (cash)', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/walkin`)
      .set(authHeaders())
      .send({
        productId: PRODUCT_ID,
        inventorySource: 'outstation',
        qty: 1,
        unit: 'kg',
        pricePerUnit: WALKIN_CASH,
        channel: 'cash'
      })

    expect(res.status).toBe(201)
    expect(res.body.amountCollected).toBe(WALKIN_CASH)
    expect(res.body.channel).toBe('cash')
  })

  it('marks order as dispatched', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/orders/${orderId}/dispatched`)
      .set(authHeaders())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('dispatched')
  })

  it('opens reconciliation — market_day → reconciliation', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'reconciliation' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('reconciliation')
  })

  it('marks outstation farmer payment as paid (cash)', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/farmerpayments/${PAYMENT_ID}`)
      .set(authHeaders())
      .send({
        status: 'paid',
        amountPaid: OUTSTATION_FARMER_PAID_CASH,
        channel: 'cash'
      })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('paid')
    expect(res.body.amountPaid).toBe(OUTSTATION_FARMER_PAID_CASH)
    expect(res.body.outstanding).toBe(0)

    const payment = await FarmerPayment.findOne({ payment_id: PAYMENT_ID }).lean()
    expect(payment.status).toBe('paid')
    expect(payment.amount_paid).toBe(OUTSTATION_FARMER_PAID_CASH)
    expect(payment.outstanding).toBe(0)
  })

  it('records local farmer payment', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/localfarmer-inbound/${inboundId}/payment`)
      .set(authHeaders())
      .send({
        paymentAmountCash: LOCAL_FARMER_PAID_CASH,
        paymentAmountBank: 0
      })

    expect(res.status).toBe(200)

    const inbound = await LocalFarmerInbound.findOne({ inbound_id: inboundId }).lean()
    expect(inbound.payment_amount_cash).toBe(LOCAL_FARMER_PAID_CASH)
    expect(inbound.payment_amount_bank).toBe(0)
  })

  it('closes week — reconciliation → closed — summary generated', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'closed', note: 'Lifecycle test close' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('closed')
    expect(res.body.summary).toBeDefined()
    expect(res.body.summary.weekId).toBe(WEEK_ID)
    expect(res.body.summary.closingBalanceCash).toBe(CLOSING_CASH)
    expect(res.body.summary.closingBalanceBank).toBe(CLOSING_BANK)

    const week = await MarketWeek.findOne({ week_id: WEEK_ID }).lean()
    expect(week.state).toBe('closed')
    expect(week.closed_at).toBeInstanceOf(Date)
  })

  it('final assertion — weekly_summaries document matches known values', async () => {
    const summary = await WeeklySummary.findOne({ week_id: WEEK_ID }).lean()
    expect(summary).not.toBeNull()

    expect(summary.opening_balance_cash).toBe(OPENING_CASH)
    expect(summary.opening_balance_bank).toBe(OPENING_BANK)
    expect(summary.preorder_receipts_cash).toBe(TOPUP_CASH)
    expect(summary.preorder_receipts_bank).toBe(0)
    expect(summary.market_day_receipts_cash).toBe(0)
    expect(summary.market_day_receipts_bank).toBe(0)
    expect(summary.walkin_receipts_cash).toBe(WALKIN_CASH)
    expect(summary.walkin_receipts_bank).toBe(0)
    expect(summary.wallet_adjustments_credits).toBe(0)
    expect(summary.wallet_adjustments_debits).toBe(0)
    expect(summary.outstation_farmer_paid_cash).toBe(OUTSTATION_FARMER_PAID_CASH)
    expect(summary.outstation_farmer_paid_bank).toBe(0)
    expect(summary.local_farmer_paid_cash).toBe(LOCAL_FARMER_PAID_CASH)
    expect(summary.local_farmer_paid_bank).toBe(0)
    expect(summary.outstanding_farmer_liabilities).toBe(0)
    expect(summary.outstanding_customer_dues).toBe(0)
    expect(summary.closing_balance_cash).toBe(CLOSING_CASH)
    expect(summary.closing_balance_bank).toBe(CLOSING_BANK)
  })

  it('rejects any write after closed — state gate', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({
        productId: PRODUCT_ID,
        unit: 'kg',
        pricePerUnit: 5000,
        displayOrder: 2
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('rejects further state transition from closed', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'setup' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })
})
