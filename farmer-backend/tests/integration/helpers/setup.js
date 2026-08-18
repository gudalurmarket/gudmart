'use strict'

const crypto = require('crypto')
const { randomUUID } = require('node:crypto')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const fastify = require('fastify')
const request = require('supertest')
const MarketWeek = require('../../../server/models/MarketWeek')
const Customer = require('../../../server/models/Customer')
const WeeklyProduceItem = require('../../../server/models/WeeklyProduceItem')
const CustomerOrder = require('../../../server/models/CustomerOrder')
const authVerify = require('../../../server/plugins/authVerify')
const stateMachineGuardPlugin = require('../../../server/plugins/stateMachineGuard')
const { stateMachineGuardPreHandler } = require('../../../server/plugins/stateMachineGuard')
const { registerErrorHandler } = require('../../../server/lib/errors')

const TEST_JWT_SECRET = 'integration-test-jwt-secret'
const OPERATOR_UID = 'test-operator-uid'

/** @type {import('fastify').FastifyInstance | null} */
let app = null
/** @type {string | null} */
let operatorToken = null

/**
 * @returns {import('fastify').FastifyInstance}
 */
function buildTestApp () {
  const instance = fastify({ logger: false })

  registerErrorHandler(instance)

  return instance
}

async function registerRoutes (instance) {
  await authVerify(instance)
  await stateMachineGuardPlugin(instance)
  instance.addHook('preHandler', authVerify.verifyAuthPreHandler)
  instance.addHook('preHandler', authVerify.authorizeRolePreHandler)
  instance.addHook('preHandler', stateMachineGuardPreHandler)

  instance.decorate('mongo', { client: mongoose.connection.getClient() })
  instance.decorate('db', mongoose.connection.db)

  instance.decorate('synonymCache', [])
  await instance.register(require('../../../server/routes/webhook'))
  await instance.register(require('../../../server/routes/weeksRoutes'), { prefix: '/api/v1' })
  await instance.register(require('../../../server/routes/produceRoutes'), { prefix: '/api/v1' })
  await instance.register(require('../../../server/routes/customers'), { prefix: '/api/v1' })
  await instance.register(require('../../../server/routes/ordersAndIntake'), { prefix: '/api/v1' })
  await instance.register(require('../../../server/routes/reconciliationAndMore'), { prefix: '/api/v1' })
  await instance.register(require('../../../server/routes/deliveryAndPacking'), { prefix: '/api/v1' })
}

/** When true, global afterEach skips dropAllCollections (sequential lifecycle tests). */
let preserveCollectionsBetweenTests = false

/**
 * @param {boolean} preserve
 */
function setPreserveCollectionsBetweenTests (preserve) {
  preserveCollectionsBetweenTests = preserve
}

/**
 * Signed operator JWT for integration requests.
 * @returns {string}
 */
function seedOperatorToken () {
  return jwt.sign(
    {
      sub: OPERATOR_UID,
      role: 'operator',
      email: 'operator@test'
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

/**
 * @param {string} [state]
 * @returns {Promise<{ weekId: string }>}
 */
async function seedWeek (state = 'open') {
  const weekId = `wk-${randomUUID().slice(0, 8)}`
  const marketDate = new Date(Date.now() + Math.floor(Math.random() * 86400000))

  await MarketWeek.collection.insertOne({
    week_id: weekId,
    market_date: marketDate,
    state,
    opening_balance_cash: 0,
    opening_balance_bank: 0,
    closed_at: null,
    state_history: [],
    created_at: new Date(),
    created_by: OPERATOR_UID
  })

  return { weekId }
}

/**
 * @param {number} [walletBalance]
 * @returns {Promise<{ customerId: string, phone: string }>}
 */
async function seedCustomer (walletBalance = 0) {
  const customerId = `cust-${randomUUID().slice(0, 8)}`
  const phone = `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`

  await Customer.create({
    customer_id: customerId,
    name: 'Integration Test Customer',
    phone,
    wallet_balance: walletBalance,
    active: true,
    created_by: OPERATOR_UID
  })

  return { customerId, phone }
}

/**
 * @param {string} weekId
 * @param {number} [pricePerUnit]
 * @returns {Promise<{ productId: string, pricePerUnit: number }>}
 */
async function seedProduceItem (weekId, pricePerUnit = 10000) {
  const productId = `prod-${randomUUID().slice(0, 8)}`

  await WeeklyProduceItem.create({
    produce_item_id: `pi-${randomUUID()}`,
    week_id: weekId,
    product_id: productId,
    unit: 'kg',
    price_per_unit: pricePerUnit,
    display_order: 0,
    created_by: OPERATOR_UID
  })

  return { productId, pricePerUnit }
}

/**
 * @param {object} opts
 * @param {string} opts.weekId
 * @param {string} opts.customerId
 * @param {string} opts.productId
 * @param {number} opts.orderedQty
 * @param {number} opts.deliveredQty
 * @param {number} opts.pricePerUnit
 * @param {string} [opts.status]
 * @returns {Promise<{ orderId: string, lineItemId: string, diffId: string }>}
 */
async function seedOrderWithLineDiff ({
  weekId,
  customerId,
  productId,
  orderedQty,
  deliveredQty,
  pricePerUnit,
  status = 'confirmed'
}) {
  const lineItemId = `li-${randomUUID().slice(0, 8)}`
  const orderId = `ord-${randomUUID().slice(0, 8)}`
  const lineValue = Math.round(orderedQty * pricePerUnit)

  await CustomerOrder.create({
    order_id: orderId,
    week_id: weekId,
    customer_id: customerId,
    status,
    fcfs_timestamp: new Date(),
    order_value: lineValue,
    wallet_debited: lineValue,
    balance_due: 0,
    balance_cleared: false,
    line_items: [{
      line_item_id: lineItemId,
      product_id: productId,
      ordered_qty: orderedQty,
      delivered_qty: deliveredQty,
      unit: 'kg',
      price_per_unit: pricePerUnit,
      line_value: lineValue,
      difference_confirmed: false
    }],
    created_by: OPERATOR_UID
  })

  return { orderId, lineItemId, diffId: `${orderId}:${lineItemId}` }
}

/**
 * @param {object} opts
 * @param {string} opts.weekId
 * @param {string} opts.customerId
 * @param {number} opts.orderValue
 * @returns {Promise<{ orderId: string }>}
 */
async function seedPendingPaymentOrder ({ weekId, customerId, orderValue }) {
  const orderId = `ord-${randomUUID().slice(0, 8)}`
  const productId = `prod-pending-${randomUUID().slice(0, 6)}`

  await CustomerOrder.create({
    order_id: orderId,
    week_id: weekId,
    customer_id: customerId,
    status: 'pending_payment',
    fcfs_timestamp: new Date(),
    order_value: orderValue,
    wallet_debited: 0,
    balance_due: orderValue,
    balance_cleared: false,
    line_items: [{
      line_item_id: `li-${randomUUID().slice(0, 8)}`,
      product_id: productId,
      ordered_qty: 2,
      delivered_qty: 2,
      unit: 'kg',
      price_per_unit: Math.floor(orderValue / 2),
      line_value: orderValue,
      difference_confirmed: false
    }],
    created_by: OPERATOR_UID
  })

  return { orderId }
}

/**
 * @returns {import('supertest').SuperTest<import('supertest').Test>}
 */
function http () {
  if (!app) {
    throw new Error('Integration app not started — require helpers/setup.js first')
  }
  return request(app.server)
}

/**
 * @returns {{ Authorization: string }}
 */
function authHeaders () {
  return { Authorization: `Bearer ${operatorToken ?? seedOperatorToken()}` }
}

/**
 * @param {object} payload
 * @param {string} [secret]
 * @returns {{ body: Buffer, signature: string }}
 */
function signWhatsAppPayload (payload, secret = process.env.WHATSAPP_APP_SECRET) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const signature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('hex')
  return { body, signature }
}

/**
 * @param {object} opts
 * @param {string} opts.messageId
 * @param {string} opts.from
 * @param {string} [opts.body]
 * @returns {object}
 */
function buildWhatsAppPayload ({ messageId, from, body = '2 kg beans' }) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: messageId,
            from,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body }
          }]
        }
      }]
    }]
  }
}

async function dropAllCollections () {
  const collections = mongoose.connection.collections
  await Promise.all(
    Object.values(collections).map(col => col.deleteMany({}))
  )
}

/**
 * POST /webhook/whatsapp with correct HMAC over the exact raw JSON body.
 * Uses Fastify inject (not supertest) so the signed bytes match verification.
 * @param {object} payload
 * @returns {Promise<import('light-my-request').Response>}
 */
async function postWebhook (payload) {
  if (!app) {
    throw new Error('Integration app not started')
  }
  const { body, signature } = signWhatsAppPayload(payload)
  return app.inject({
    method: 'POST',
    url: '/webhook/whatsapp',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature
    },
    payload: body
  })
}

async function waitForInboundMessage (messageId, { timeoutMs = 3000, intervalMs = 50 } = {}) {
  const InboundMessage = require('../../../server/models/InboundMessage')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const doc = await InboundMessage.findOne({ message_id: messageId }).lean()
    if (doc) return doc
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return null
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  process.env.FIREBASE_TEST_JWT_SECRET = TEST_JWT_SECRET
  process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'test-whatsapp-app-secret'
  process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'test-verify-token'

  const uri = process.env.MONGODB_TEST_URI
  if (!uri) {
    throw new Error('MONGODB_TEST_URI is not set (globalSetup should provide mongodb-memory-server URI)')
  }
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, { dbName: 'farmer-market-test' })
  }

  operatorToken = seedOperatorToken()
  app = buildTestApp()
  await registerRoutes(app)
  await app.ready()
  await app.listen({ port: 0, host: '127.0.0.1' })
})

afterEach(async () => {
  if (!preserveCollectionsBetweenTests) {
    await dropAllCollections()
  }
})

afterAll(async () => {
  if (app) {
    await app.close()
    app = null
  }
})

module.exports = {
  OPERATOR_UID,
  TEST_JWT_SECRET,
  getApp: () => app,
  http,
  authHeaders,
  seedOperatorToken,
  seedWeek,
  seedCustomer,
  seedProduceItem,
  seedOrderWithLineDiff,
  seedPendingPaymentOrder,
  signWhatsAppPayload,
  buildWhatsAppPayload,
  postWebhook,
  waitForInboundMessage,
  dropAllCollections,
  setPreserveCollectionsBetweenTests
}
