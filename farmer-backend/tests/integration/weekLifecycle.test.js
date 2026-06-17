'use strict'

/**
 * End-to-end lifecycle regression test.
 *
 * Walks a single market week through all seven states in order:
 *   setup → open → locked → delivery → market_day → reconciliation → closed
 *
 * Every state transition is exercised via real HTTP calls against the Fastify
 * test app. Gate conditions are tested both positively (passing) and negatively
 * (blocking when pre-conditions are not met).
 */

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

// ---------------------------------------------------------------------------
// Fixed identifiers
// weekId is deterministic: parseMarketDate('2026-07-05') → 'wk-2026-07-05'
// ---------------------------------------------------------------------------
const WEEK_DATE = '2026-07-05'
const WEEK_ID = 'wk-2026-07-05'

const TOMATO_ID = 'prod-tomato-lc2'
const BEANS_ID = 'prod-beans-lc2'

const CUSTOMER_ID = 'cust-main-lc2'
const CUSTOMER2_ID = 'cust-gate-lc2'

const OUT_FARMER_ID = 'farmer-out-lc2'
const LOCAL_FARMER_ID = 'farmer-loc-lc2'

const ASSIGNMENT_ID = 'assign-lc2-001'

// ---------------------------------------------------------------------------
// Financial constants (all integers, paise)
// ---------------------------------------------------------------------------
const OPENING_CASH = 500000
const OPENING_BANK = 1000000

const TOMATO_PRICE = 6000 // 6000 paise = ₹60/kg
const BEANS_PRICE = 8000 // 8000 paise = ₹80/kg

const TOPUP_MAIN = 20000 // main customer cash top-up
const ORDER_TOMATO_QTY = 2 // 2 kg
const ORDER_BEANS_QTY = 0.5 // 0.5 kg
// (2 × 6000) + (0.5 × 8000) = 12000 + 4000 = 16000
const ORDER_VALUE = Math.round(ORDER_TOMATO_QTY * TOMATO_PRICE) +
  Math.round(ORDER_BEANS_QTY * BEANS_PRICE)

const WALKIN_QTY = 1
const WALKIN_UNIT_PRICE = 6000 // ₹60/kg
const WALKIN_AMOUNT = WALKIN_QTY * WALKIN_UNIT_PRICE // 6000

// Outstation farmer (OUT_FARMER_ID) is assigned TOMATO_ID at 6000 paise/kg.
// Delivered 2.5 kg → amountDue = Math.round(2.5 × 6000) = 15000 paise.
const OUT_FARMER_AMOUNT_DUE = 15000 // 2.5 kg Tomato × 6000 paise/kg
const OUT_FARMER_PAID = 15000 // full payment = amountDue

const LOCAL_FARMER_PAYMENT_CASH = 3000

// cash: opening + topup + walkin − outstation − local
const CLOSING_CASH =
  OPENING_CASH +
  TOPUP_MAIN +
  WALKIN_AMOUNT -
  OUT_FARMER_PAID -
  LOCAL_FARMER_PAYMENT_CASH // 500000 + 20000 + 6000 − 15000 − 3000 = 508000

const CLOSING_BANK = OPENING_BANK // no bank-channel transactions

// ---------------------------------------------------------------------------
// State captured during the test run (set by individual assertions below)
// ---------------------------------------------------------------------------
/** @type {string} */
let orderId

/** @type {string} */
let inboundId

/** @type {string} */
let autoPaymentId

// ---------------------------------------------------------------------------
// Seed / cleanup helpers
// ---------------------------------------------------------------------------
async function seedFixtures () {
  const now = new Date()

  await ProductCatalogue.collection.insertMany([
    {
      product_id: TOMATO_ID,
      name_en: 'Tomato',
      name_ta: 'thakkali',
      default_unit: 'kg',
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    },
    {
      product_id: BEANS_ID,
      name_en: 'Beans',
      name_ta: 'beans',
      default_unit: 'kg',
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    }
  ])

  await Customer.collection.insertMany([
    {
      customer_id: CUSTOMER_ID,
      name: 'Test Customer',
      phone: '+919999900001',
      wallet_balance: 0,
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    },
    {
      customer_id: CUSTOMER2_ID,
      name: 'Gate Test Customer',
      phone: '+919999900002',
      wallet_balance: 0,
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    }
  ])

  await Farmer.collection.insertMany([
    {
      farmer_id: OUT_FARMER_ID,
      name: 'Test Farmer',
      phone: '+919999900003',
      location: 'Gudalur',
      farmer_type: 'outstation',
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    },
    {
      farmer_id: LOCAL_FARMER_ID,
      name: 'Local Farmer One',
      phone: '+919999900004',
      location: 'Ooty',
      farmer_type: 'local',
      active: true,
      created_at: now,
      created_by: OPERATOR_UID
    }
  ])

  // farmer_payments records are auto-generated by the system when the week
  // enters reconciliation state — one record per outstation farmer that has a
  // farmer_order_assignment with delivered_qty > 0 for this week.
  // No direct seed here; the GET /farmerpayments assertion in Step 8 verifies
  // auto-generation and captures the payment_id for subsequent PATCH calls.
}

async function cleanupFixtures () {
  const db = mongoose.connection.db
  const weekFilter = { week_id: WEEK_ID }

  await db.collection('weekly_summaries').deleteMany(weekFilter)
  await db.collection('wallet_transactions').deleteMany({
    $or: [weekFilter, { customer_id: CUSTOMER_ID }, { customer_id: CUSTOMER2_ID }]
  })
  await db.collection('customer_orders').deleteMany(weekFilter)
  await db.collection('walkin_sales').deleteMany(weekFilter)
  await db.collection('farmer_payments').deleteMany(weekFilter)
  await db.collection('farmer_order_assignments').deleteMany(weekFilter)
  await db.collection('local_farmer_inbound').deleteMany(weekFilter)
  await db.collection('weekly_produce_items').deleteMany(weekFilter)
  await db.collection('market_weeks').deleteMany({ week_id: WEEK_ID })
  await db.collection('customers').deleteMany({
    customer_id: { $in: [CUSTOMER_ID, CUSTOMER2_ID] }
  })
  await db.collection('farmers').deleteMany({
    farmer_id: { $in: [OUT_FARMER_ID, LOCAL_FARMER_ID] }
  })
  await db.collection('product_catalogue').deleteMany({
    product_id: { $in: [TOMATO_ID, BEANS_ID] }
  })
}

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------
describe('Full week lifecycle — setup → closed', () => {
  beforeAll(async () => {
    setPreserveCollectionsBetweenTests(true)
    await cleanupFixtures()
    await seedFixtures()
  })

  afterAll(async () => {
    await cleanupFixtures()
    setPreserveCollectionsBetweenTests(false)
  })

  // ─── Step 1 · Create week ─────────────────────────────────────────────────

  it('POST /weeks — creates week, enters setup state', async () => {
    const res = await http()
      .post('/api/v1/weeks')
      .set(authHeaders())
      .send({
        marketDate: WEEK_DATE,
        openingBalanceCash: OPENING_CASH,
        openingBalanceBank: OPENING_BANK
      })

    expect(res.status).toBe(201)
    expect(res.body.weekId).toBe(WEEK_ID)
    expect(res.body.state).toBe('setup')
    expect(res.body.openingBalanceCash).toBe(OPENING_CASH)
    expect(res.body.openingBalanceBank).toBe(OPENING_BANK)
    expect(res.body.stateHistory).toHaveLength(0)
  })

  it('setup gate — rejects order creation (create_order not permitted in setup)', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [{ productId: TOMATO_ID, orderedQty: 1, unit: 'kg' }]
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('setup → open gate — rejects publish when produce list is empty', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'open' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TRANSITION_GATE_FAILED')
    expect(res.body.details.blockers[0].type).toBe('NO_PRODUCE_ITEMS')
  })

  // ─── Step 2 · Add produce items ───────────────────────────────────────────

  it('adds Tomato at 6000 paise/kg', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({ productId: TOMATO_ID, unit: 'kg', pricePerUnit: TOMATO_PRICE, displayOrder: 1 })

    expect(res.status).toBe(201)
    expect(res.body.productId).toBe(TOMATO_ID)
    expect(res.body.pricePerUnit).toBe(TOMATO_PRICE)
  })

  it('adds Beans at 8000 paise/kg', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({ productId: BEANS_ID, unit: 'kg', pricePerUnit: BEANS_PRICE, displayOrder: 2 })

    expect(res.status).toBe(201)
    expect(res.body.productId).toBe(BEANS_ID)
    expect(res.body.pricePerUnit).toBe(BEANS_PRICE)
  })

  // ─── Step 3 · Publish week ────────────────────────────────────────────────

  it('PATCH state → open — setup → open', async () => {
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

  it('transition gate — rejects backward transition open → setup', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'setup' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })

  it('transition gate — rejects skip-forward transition open → delivery', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'delivery' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })

  // ─── Step 4 · Wallet top-up, orders, and lock-gate test ───────────────────

  it('tops up main customer wallet — 20000 paise cash', async () => {
    const res = await http()
      .post(`/api/v1/customers/${CUSTOMER_ID}/wallet/topup`)
      .set(authHeaders())
      .send({
        amount: TOPUP_MAIN,
        channel: 'cash',
        referenceNote: 'advance payment',
        weekId: WEEK_ID
      })

    expect(res.status).toBe(200)
    expect(res.body.walletBalance).toBe(TOPUP_MAIN)

    const cust = await Customer.findOne({ customer_id: CUSTOMER_ID }).lean()
    expect(cust.wallet_balance).toBe(TOPUP_MAIN)

    const topUpTxn = await WalletTransaction.findOne({
      customer_id: CUSTOMER_ID,
      week_id: WEEK_ID,
      type: 'top_up',
      amount: TOPUP_MAIN,
      channel: 'cash'
    }).lean()
    expect(topUpTxn).not.toBeNull()
  })

  it('creates confirmed order for main customer — 2 kg tomato + 0.5 kg beans = 16000 paise', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [
          { productId: TOMATO_ID, orderedQty: ORDER_TOMATO_QTY, unit: 'kg' },
          { productId: BEANS_ID, orderedQty: ORDER_BEANS_QTY, unit: 'kg' }
        ]
      })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('confirmed')
    expect(res.body.orderValue).toBe(ORDER_VALUE) // 16000
    expect(res.body.walletDebited).toBe(ORDER_VALUE)
    orderId = res.body.orderId
    expect(orderId).toBeDefined()

    const cust = await Customer.findOne({ customer_id: CUSTOMER_ID }).lean()
    expect(cust.wallet_balance).toBe(TOPUP_MAIN - ORDER_VALUE) // 4000
  })

  it('creates pending_payment order for zero-wallet second customer', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER2_ID,
        lineItems: [{ productId: TOMATO_ID, orderedQty: 1, unit: 'kg' }]
      })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending_payment')
    expect(res.body.orderValue).toBe(TOMATO_PRICE) // 6000
    expect(res.body.walletDebited).toBe(0)
  })

  it('open → locked gate — blocked while pending_payment order exists', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'locked' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TRANSITION_GATE_FAILED')

    const blockerTypes = res.body.details.blockers.map(b => b.type)
    expect(blockerTypes).toContain('PENDING_PAYMENT_ORDER')
  })

  it('cancels the pending_payment order to clear the gate blocker', async () => {
    const pending = await CustomerOrder.findOne({
      week_id: WEEK_ID,
      customer_id: CUSTOMER2_ID,
      status: 'pending_payment'
    }).lean()
    expect(pending).not.toBeNull()

    const res = await http()
      .delete(`/api/v1/weeks/${WEEK_ID}/orders/${pending.order_id}`)
      .set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')

    const remaining = await CustomerOrder.countDocuments({
      week_id: WEEK_ID,
      status: 'pending_payment'
    })
    expect(remaining).toBe(0)
  })

  // ─── Step 5 · Lock orders ─────────────────────────────────────────────────

  it('PATCH state → locked — open → locked (gate now clear)', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'locked' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('locked')

    const week = await MarketWeek.findOne({ week_id: WEEK_ID }).lean()
    expect(week.state).toBe('locked')
  })

  it('locked gate — rejects order creation in locked state', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [{ productId: TOMATO_ID, orderedQty: 1, unit: 'kg' }]
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('sets farmer assignment in locked state', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/delivery/${ASSIGNMENT_ID}`)
      .set(authHeaders())
      .send({
        farmerId: OUT_FARMER_ID,
        productId: TOMATO_ID,
        preorderQty: ORDER_TOMATO_QTY,
        bufferQty: 0.2,
        assignedQty: 2.2
      })

    expect(res.status).toBe(200)

    const assignment = await FarmerOrderAssignment.findOne({
      assignment_id: ASSIGNMENT_ID,
      week_id: WEEK_ID
    }).lean()
    expect(assignment).not.toBeNull()
    expect(assignment.farmer_id).toBe(OUT_FARMER_ID)
    expect(assignment.product_id).toBe(TOMATO_ID)
    expect(assignment.buffer_pct).toBeNull()
    expect(assignment.buffer_qty).toBe(0.2)
    expect(assignment.outgoing_qty).toBe(2.2)
  })

  // ─── Step 6 · Delivery ────────────────────────────────────────────────────

  it('PATCH state → delivery — locked → delivery', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'delivery' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('delivery')
  })

  it('records delivered quantity (2.5 kg) against farmer assignment', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/delivery/${ASSIGNMENT_ID}`)
      .set(authHeaders())
      .send({ deliveredQty: 2.5 })

    expect(res.status).toBe(200)

    const assignment = await FarmerOrderAssignment.findOne({
      assignment_id: ASSIGNMENT_ID,
      week_id: WEEK_ID
    }).lean()
    expect(assignment.delivered_qty).toBe(2.5)
  })

  it('marks order as packed in delivery state', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/orders/${orderId}/packed`)
      .set(authHeaders())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('packed')
  })

  it('delivery gate — rejects walk-in sale (record_walkin_sale not permitted in delivery)', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/walkin`)
      .set(authHeaders())
      .send({
        productId: TOMATO_ID,
        inventorySource: 'outstation',
        qty: 1,
        unit: 'kg',
        pricePerUnit: TOMATO_PRICE,
        channel: 'cash'
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  // ─── Step 7 · Market day ──────────────────────────────────────────────────

  it('PATCH state → market_day — delivery → market_day', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'market_day' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('market_day')
  })

  it('dispatches packed order in market_day state', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/orders/${orderId}/dispatched`)
      .set(authHeaders())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('dispatched')
  })

  it('records local farmer inbound (5 kg beans) in market_day state', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/localfarmer-inbound`)
      .set(authHeaders())
      .send({
        farmerId: LOCAL_FARMER_ID,
        productId: BEANS_ID,
        inboundQty: 5,
        unit: 'kg',
        pricePerUnit: 4000
      })

    expect(res.status).toBe(201)
    inboundId = res.body.inboundId
    expect(inboundId).toBeDefined()
    expect(res.body.farmerId).toBe(LOCAL_FARMER_ID)
  })

  it('records walk-in sale — 1 kg tomato at 6000 paise (cash)', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/walkin`)
      .set(authHeaders())
      .send({
        productId: TOMATO_ID,
        inventorySource: 'outstation',
        qty: WALKIN_QTY,
        unit: 'kg',
        pricePerUnit: WALKIN_UNIT_PRICE,
        channel: 'cash'
      })

    expect(res.status).toBe(201)
    expect(res.body.amountCollected).toBe(WALKIN_AMOUNT) // 6000
    expect(res.body.channel).toBe('cash')
    expect(res.body.weekId).toBe(WEEK_ID)
  })

  it('market_day gate — rejects order creation (create_order not permitted in market_day)', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [{ productId: TOMATO_ID, orderedQty: 1, unit: 'kg' }]
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  // ─── Step 8 · Reconciliation ──────────────────────────────────────────────

  it('PATCH state → reconciliation — market_day → reconciliation', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'reconciliation' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('reconciliation')

    // Fix 1: farmer_payments are auto-generated on reconciliation entry —
    // one record per outstation farmer with a delivered assignment for this week.
    const fpRes = await http()
      .get(`/api/v1/weeks/${WEEK_ID}/farmerpayments`)
      .set(authHeaders())

    expect(fpRes.status).toBe(200)
    expect(fpRes.body.payments).toHaveLength(1)

    const fp = fpRes.body.payments[0]
    expect(fp.farmerId).toBe(OUT_FARMER_ID)
    expect(fp.status).toBe('unpaid')
    expect(fp.amountDue).toBeGreaterThan(0)
    // Assignment: TOMATO_ID, 2.5 kg delivered at 6000 paise/kg → 15000 paise
    expect(fp.amountDue).toBe(OUT_FARMER_AMOUNT_DUE)
    autoPaymentId = fp.paymentId
  })

  it('marks outstation farmer payment as paid (cash)', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/farmerpayments/${autoPaymentId}`)
      .set(authHeaders())
      .send({ status: 'paid', amountPaid: OUT_FARMER_PAID, channel: 'cash' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('paid')
    expect(res.body.amountPaid).toBe(OUT_FARMER_PAID)
    expect(res.body.outstanding).toBe(0)

    const payment = await FarmerPayment.findOne({ payment_id: autoPaymentId }).lean()
    expect(payment.status).toBe('paid')
    expect(payment.amount_paid).toBe(OUT_FARMER_PAID)
    expect(payment.outstanding).toBe(0)
  })

  it('reconciliation → closed gate — blocked before local farmer payment is recorded', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'closed' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TRANSITION_GATE_FAILED')

    const blockerTypes = res.body.details.blockers.map(b => b.type)
    expect(blockerTypes).toContain('LOCAL_FARMER_PAYMENT_INCOMPLETE')
  })

  it('records local farmer payment (3000 paise cash)', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/localfarmer-inbound/${inboundId}/payment`)
      .set(authHeaders())
      .send({ paymentAmountCash: LOCAL_FARMER_PAYMENT_CASH, paymentAmountBank: 0 })

    expect(res.status).toBe(200)

    const inbound = await LocalFarmerInbound.findOne({ inbound_id: inboundId }).lean()
    expect(inbound.payment_amount_cash).toBe(LOCAL_FARMER_PAYMENT_CASH)
    expect(inbound.payment_amount_bank).toBe(0)
  })

  // ─── Step 9 · Close week ──────────────────────────────────────────────────

  it('closes week — reconciliation → closed — summary generated inline', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'closed', note: 'Lifecycle regression test close' })

    expect(res.status).toBe(200)
    expect(res.body.newState).toBe('closed')

    expect(res.body.summary).toBeDefined()
    expect(res.body.summary.weekId).toBe(WEEK_ID)
    expect(res.body.summary.closingBalanceCash).toBe(CLOSING_CASH)
    expect(res.body.summary.closingBalanceBank).toBe(CLOSING_BANK)

    const week = await MarketWeek.findOne({ week_id: WEEK_ID }).lean()
    expect(week.state).toBe('closed')
    expect(week.closed_at).toBeInstanceOf(Date)

    // Fix 5: the inline close summary and GET /summary must be consistent.
    // (The legacy close endpoint exposes only closingBalance fields inline;
    //  the full breakdown lives in GET /summary — verify they match.)
    const summaryGetRes = await http()
      .get(`/api/v1/weeks/${WEEK_ID}/summary`)
      .set(authHeaders())
    expect(summaryGetRes.status).toBe(200)
    const sg = summaryGetRes.body
    expect(sg.closingBalanceCash).toBe(res.body.summary.closingBalanceCash)
    expect(sg.closingBalanceBank).toBe(res.body.summary.closingBalanceBank)

    // Fix 3: closing balance formula — wallet adjustments are excluded.
    // closingBalanceCash = openingCash + preorderCash + marketDayReceiptsCash + walkinCash
    //                     − outstationFarmerPaidCash − localFarmerPaidCash
    // wallet_adjustments_credits and wallet_adjustments_debits are NOT in this formula.
    const expectedClosingCash =
      sg.openingBalanceCash          // 500000
      + sg.preorderReceiptsCash      // 20000  (top-up was cash)
      + sg.marketDayReceiptsCash     // 0      (no balance payments in this test)
      + sg.walkinReceiptsCash        // 6000   (walk-in sale Step 7)
      - sg.outstationFarmerPaidCash  // 15000  (2.5 kg Tomato × 6000 paise/kg, paid cash)
      - sg.localFarmerPaidCash       // 3000   (local farmer payment Step 8)

    expect(sg.closingBalanceCash).toBe(expectedClosingCash)

    // Explicit check: wallet adjustments would give a wrong closing value if included.
    // No wallet adjustments were triggered in this test; the conditional guard is here
    // for future coverage when adjustment transactions are introduced.
    const withAdjustments =
      expectedClosingCash
      + sg.walletAdjustmentsCredits
      - sg.walletAdjustmentsDebits

    if (sg.walletAdjustmentsCredits !== 0 || sg.walletAdjustmentsDebits !== 0) {
      expect(sg.closingBalanceCash).not.toBe(withAdjustments)
    }
  })

  it('terminal gate — rejects any state transition from closed', async () => {
    const res = await http()
      .patch(`/api/v1/weeks/${WEEK_ID}/state`)
      .set(authHeaders())
      .send({ targetState: 'setup' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })

  // ─── Summary GET ──────────────────────────────────────────────────────────

  it('GET /weeks/:weekId/summary — returns correct financial values', async () => {
    const res = await http()
      .get(`/api/v1/weeks/${WEEK_ID}/summary`)
      .set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body.openingBalanceCash).toBe(OPENING_CASH)
    expect(res.body.walkinReceiptsCash).toBe(WALKIN_AMOUNT) // 6000
    expect(res.body.closingBalanceCash).toBe(CLOSING_CASH)
    expect(res.body.closingBalanceBank).toBe(CLOSING_BANK)
  })

  // ─── Post-lifecycle cross-cutting assertions ──────────────────────────────

  it('state_history — exactly 6 entries, all strictly forward in order', async () => {
    const res = await http()
      .get(`/api/v1/weeks/${WEEK_ID}`)
      .set(authHeaders())

    expect(res.status).toBe(200)

    const history = res.body.stateHistory
    expect(history).toHaveLength(6)

    const SEQUENCE = [
      { fromState: 'setup', toState: 'open' },
      { fromState: 'open', toState: 'locked' },
      { fromState: 'locked', toState: 'delivery' },
      { fromState: 'delivery', toState: 'market_day' },
      { fromState: 'market_day', toState: 'reconciliation' },
      { fromState: 'reconciliation', toState: 'closed' }
    ]

    const STATE_ORDER = [
      'setup', 'open', 'locked', 'delivery', 'market_day', 'reconciliation', 'closed'
    ]

    history.forEach((entry, i) => {
      expect(entry.fromState).toBe(SEQUENCE[i].fromState)
      expect(entry.toState).toBe(SEQUENCE[i].toState)

      // Every transition advances exactly one step forward
      const fromIdx = STATE_ORDER.indexOf(entry.fromState)
      const toIdx = STATE_ORDER.indexOf(entry.toState)
      expect(toIdx).toBe(fromIdx + 1)
    })

    // Fix 4: every history entry must carry the actor UID and timestamp
    for (const entry of history) {
      expect(typeof entry.changedBy).toBe('string')
      expect(entry.changedBy.length).toBeGreaterThan(0) // Firebase UID — must never be empty
      expect(entry.changedAt).toBeTruthy()              // Timestamp — must be present
    }
  })

  it('wallet ledger — 1 top_up (+20000) + 1 order_debit (−16000), balance = 4000', async () => {
    const res = await http()
      .get(`/api/v1/customers/${CUSTOMER_ID}/wallet`)
      .set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body.walletBalance).toBe(TOPUP_MAIN - ORDER_VALUE) // 4000

    const txns = res.body.transactions

    const topUpTxn = txns.find(t => t.type === 'top_up')
    expect(topUpTxn).toBeDefined()
    expect(topUpTxn.amount).toBe(TOPUP_MAIN) // 20000

    const debitTxn = txns.find(t => t.type === 'order_debit')
    expect(debitTxn).toBeDefined()
    expect(debitTxn.amount).toBe(ORDER_VALUE) // 16000

    // Fix 6: running balance chain — every row's runningBalance must be the cumulative
    // sum after applying its credit/debit; the last row must equal the current balance.
    const sorted = [...txns].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    let expectedRunning = 0
    for (const txn of sorted) {
      if (txn.type === 'top_up' || txn.type === 'balance_payment' || txn.type === 'price_diff_credit') {
        expectedRunning += txn.amount
      } else if (txn.type === 'order_debit' || txn.type === 'price_diff_debit') {
        expectedRunning -= txn.amount
      }
      expect(txn.runningBalance).toBe(expectedRunning)
      expect(Number.isInteger(txn.runningBalance)).toBe(true) // must be integer paise
    }
    // Final entry's running balance must equal the live wallet balance
    expect(sorted[sorted.length - 1].runningBalance).toBe(res.body.walletBalance)
  })

  it('closed week — rejects produce item addition', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/produce`)
      .set(authHeaders())
      .send({ productId: TOMATO_ID, unit: 'kg', pricePerUnit: 5000, displayOrder: 3 })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('closed week — rejects walk-in sale', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/walkin`)
      .set(authHeaders())
      .send({
        productId: TOMATO_ID,
        inventorySource: 'outstation',
        qty: 1,
        unit: 'kg',
        pricePerUnit: TOMATO_PRICE,
        channel: 'cash'
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('closed week — rejects order creation', async () => {
    const res = await http()
      .post(`/api/v1/weeks/${WEEK_ID}/orders`)
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        lineItems: [{ productId: TOMATO_ID, orderedQty: 1, unit: 'kg' }]
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACTION_NOT_PERMITTED_IN_STATE')
  })

  it('weekly_summaries document — all financial fields match known values', async () => {
    const summary = await WeeklySummary.findOne({ week_id: WEEK_ID }).lean()
    expect(summary).not.toBeNull()

    expect(summary.opening_balance_cash).toBe(OPENING_CASH)
    expect(summary.opening_balance_bank).toBe(OPENING_BANK)
    expect(summary.preorder_receipts_cash).toBe(TOPUP_MAIN) // 20000
    expect(summary.preorder_receipts_bank).toBe(0)
    expect(summary.market_day_receipts_cash).toBe(0)
    expect(summary.market_day_receipts_bank).toBe(0)
    expect(summary.walkin_receipts_cash).toBe(WALKIN_AMOUNT) // 6000
    expect(summary.walkin_receipts_bank).toBe(0)
    expect(summary.wallet_adjustments_credits).toBe(0)
    expect(summary.wallet_adjustments_debits).toBe(0)
    expect(summary.outstation_farmer_paid_cash).toBe(OUT_FARMER_PAID) // 15000
    expect(summary.outstation_farmer_paid_bank).toBe(0)
    expect(summary.local_farmer_paid_cash).toBe(LOCAL_FARMER_PAYMENT_CASH) // 3000
    expect(summary.local_farmer_paid_bank).toBe(0)
    expect(summary.outstanding_farmer_liabilities).toBe(0)
    expect(summary.outstanding_customer_dues).toBe(0)
    expect(summary.closing_balance_cash).toBe(CLOSING_CASH) // 508000
    expect(summary.closing_balance_bank).toBe(CLOSING_BANK) // 1000000
  })
})
