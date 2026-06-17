'use strict'

const { randomUUID } = require('node:crypto')
const Customer = require('../models/Customer')
const CustomerOrder = require('../models/CustomerOrder')
const ProductCatalogue = require('../models/ProductCatalogue')
const WalletTransaction = require('../models/WalletTransaction')
const WalletEngine = require('../modules/walletEngine')
const {
  CustomerNotFoundError,
  DuplicatePhoneError
} = require('../lib/errors')

const E164_PHONE_PATTERN = '^\\+[1-9]\\d{1,14}$'

const integerPaiseSchema = {
  type: 'integer',
  minimum: 0
}

const positivePaiseSchema = {
  type: 'integer',
  minimum: 1
}

/**
 * @param {Date|string} value
 * @returns {string}
 */
function toIsoString (value) {
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

/**
 * @param {object} customer
 */
function toCustomerDetail (customer) {
  return {
    customerId: customer.customer_id,
    name: customer.name,
    phone: customer.phone,
    walletBalance: customer.wallet_balance,
    active: customer.active,
    createdAt: toIsoString(customer.created_at),
    createdBy: customer.created_by
  }
}

/**
 * @param {object} customer
 */
function toCustomerListItem (customer) {
  return {
    customerId: customer.customer_id,
    name: customer.name,
    phone: customer.phone,
    walletBalance: customer.wallet_balance,
    active: customer.active
  }
}

/**
 * @param {object} txn
 */
function toWalletTxn (txn) {
  return {
    txnId: txn.txn_id,
    type: txn.type,
    amount: txn.amount,
    channel: txn.channel,
    runningBalance: txn.running_balance,
    weekId: txn.week_id ?? null,
    referenceNote: txn.reference_note ?? null,
    createdAt: toIsoString(txn.created_at)
  }
}

/**
 * @param {string|null|undefined} note
 * @returns {string|null}
 */
function parseOrderIdFromReferenceNote (note) {
  if (!note) return null
  const match = /order_id:([^;\s]+)/.exec(note)
  return match ? match[1] : null
}

/**
 * @param {string|null|undefined} note
 * @returns {string|null}
 */
function parseLineItemIdFromReferenceNote (note) {
  if (!note) return null
  const match = /line_item_id:([^;\s]+)/.exec(note)
  return match ? match[1] : null
}

/**
 * Batch-resolve product names for wallet ledger rows.
 *
 * @param {object[]} transactions — lean WalletTransaction documents (newest first)
 * @returns {Promise<object[]>}
 */
async function enrichWalletTransactions (transactions) {
  const orderIds = new Set()
  const lineItemIds = new Set()

  for (const txn of transactions) {
    const note = txn.reference_note
    if (txn.type === 'order_debit' || txn.type === 'order_debit_reversal') {
      const orderId = parseOrderIdFromReferenceNote(note)
      if (orderId) orderIds.add(orderId)
    } else if (txn.type === 'price_diff_credit' || txn.type === 'price_diff_debit') {
      const lineItemId = parseLineItemIdFromReferenceNote(note)
      if (lineItemId) lineItemIds.add(lineItemId)
    }
  }

  const [ordersByOrderId, ordersWithLineItems] = await Promise.all([
    orderIds.size > 0
      ? CustomerOrder.find({ order_id: { $in: [...orderIds] } })
        .select('order_id line_items')
        .lean()
      : [],
    lineItemIds.size > 0
      ? CustomerOrder.find({ 'line_items.line_item_id': { $in: [...lineItemIds] } })
        .select('line_items')
        .lean()
      : []
  ])

  const lineItemsByOrderId = new Map(
    ordersByOrderId.map(order => [order.order_id, order.line_items ?? []])
  )

  const productIdByLineItemId = new Map()
  const productIds = new Set()

  for (const order of ordersByOrderId) {
    for (const li of order.line_items ?? []) {
      productIds.add(li.product_id)
    }
  }
  for (const order of ordersWithLineItems) {
    for (const li of order.line_items ?? []) {
      if (lineItemIds.has(li.line_item_id)) {
        productIdByLineItemId.set(li.line_item_id, li.product_id)
        productIds.add(li.product_id)
      }
    }
  }

  const products = productIds.size > 0
    ? await ProductCatalogue.find({ product_id: { $in: [...productIds] } })
      .select('product_id name_en')
      .lean()
    : []

  const productNameById = new Map(products.map(p => [p.product_id, p.name_en]))

  return transactions.map(txn => {
    let productNames = []
    if (txn.type === 'order_debit' || txn.type === 'order_debit_reversal') {
      const orderId = parseOrderIdFromReferenceNote(txn.reference_note)
      const lineItems = orderId ? (lineItemsByOrderId.get(orderId) ?? []) : []
      productNames = lineItems.map(
        li => productNameById.get(li.product_id) ?? li.product_id
      )
    } else if (txn.type === 'price_diff_credit' || txn.type === 'price_diff_debit') {
      const lineItemId = parseLineItemIdFromReferenceNote(txn.reference_note)
      const productId = lineItemId ? productIdByLineItemId.get(lineItemId) : null
      if (productId) {
        productNames = [productNameById.get(productId) ?? productId]
      }
    }
    return { ...toWalletTxn(txn), productNames }
  })
}

/**
 * @param {import('mongoose').Error} err
 * @param {string} phone
 */
function rethrowDuplicatePhone (err, phone) {
  if (err?.code === 11000 && /phone/i.test(String(err.message))) {
    throw new DuplicatePhoneError(
      `Phone number already registered: ${phone}`,
      { phone }
    )
  }
}

async function customersRoutes (fastify) {
  fastify.get('/customers', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          active: { type: 'boolean', default: true },
          search: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request) => {
    const active = request.query.active ?? true
    const { search } = request.query

    const filter = { active }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(escaped, 'i')
      filter.$or = [{ name: pattern }, { phone: pattern }]
    }

    const customers = await Customer.find(filter)
      .sort({ name: 1 })
      .lean()

    return {
      customers: customers.map(toCustomerListItem)
    }
  })

  fastify.post('/customers', {
    config: { action: 'register_entity' },
    schema: {
      body: {
        type: 'object',
        required: ['name', 'phone'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          phone: { type: 'string', pattern: E164_PHONE_PATTERN },
          openingWalletBalance: integerPaiseSchema
        }
      }
    }
  }, async (request, reply) => {
    const { name, phone, openingWalletBalance = 0 } = request.body
    const customerId = `cust-${randomUUID()}`
    const operatorId = request.user.uid

    let customer
    try {
      customer = await Customer.create({
        customer_id: customerId,
        name: name.trim(),
        phone: phone.trim(),
        wallet_balance: 0,
        active: true,
        created_by: operatorId
      })
    } catch (err) {
      rethrowDuplicatePhone(err, phone)
      throw err
    }

    if (openingWalletBalance > 0) {
      await WalletEngine.manualAdjustment({
        idempotencyKey: `opening-${customerId}`,
        customerId,
        amount: openingWalletBalance,
        direction: 'credit',
        reason: 'opening balance',
        weekId: null,
        createdBy: operatorId
      })
      customer = await Customer.findOne({ customer_id: customerId }).lean()
    }

    return reply.code(201).send(toCustomerDetail(customer))
  })

  fastify.patch('/customers/:customerId', {
    config: { action: 'register_entity' },
    schema: {
      params: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          phone: { type: 'string', pattern: E164_PHONE_PATTERN },
          active: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    const { customerId } = request.params
    const updates = {}

    if (request.body.name != null) updates.name = request.body.name.trim()
    if (request.body.phone != null) updates.phone = request.body.phone.trim()
    if (request.body.active != null) updates.active = request.body.active

    let customer
    try {
      customer = await Customer.findOneAndUpdate(
        { customer_id: customerId },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean()
    } catch (err) {
      if (request.body.phone != null) {
        rethrowDuplicatePhone(err, request.body.phone)
      }
      throw err
    }

    if (!customer) {
      throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
    }

    return toCustomerDetail(customer)
  })

  fastify.get('/customers/:customerId/wallet', {
    config: { action: 'view_wallet' },
    schema: {
      params: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'string', minLength: 1 }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          weekId: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request) => {
    const { customerId } = request.params
    const { weekId } = request.query

    const customer = await Customer.findOne({ customer_id: customerId })
      .select('customer_id wallet_balance')
      .lean()

    if (!customer) {
      throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
    }

    const txnFilter = { customer_id: customerId }
    if (weekId) txnFilter.week_id = weekId

    const transactions = await WalletTransaction.find(txnFilter)
      .sort({ created_at: -1 })
      .lean()

    return {
      customerId: customer.customer_id,
      walletBalance: customer.wallet_balance,
      transactions: await enrichWalletTransactions(transactions)
    }
  })

  fastify.post('/customers/:customerId/wallet/topup', {
    config: { action: 'wallet_top_up' },
    schema: {
      params: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        required: ['amount', 'channel', 'weekId'],
        additionalProperties: false,
        properties: {
          amount: positivePaiseSchema,
          channel: { type: 'string', enum: ['cash', 'upi'] },
          referenceNote: { type: 'string' },
          weekId: { type: 'string', minLength: 1 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 }
        }
      }
    }
  }, async (request) => {
    const { customerId } = request.params
    const { amount, channel, referenceNote, weekId, idempotencyKey } = request.body

    const exists = await Customer.exists({ customer_id: customerId })
    if (!exists) {
      throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
    }

    const { txnId, newBalance } = await WalletEngine.topUp({
      idempotencyKey: idempotencyKey ?? `txn-${randomUUID()}`,
      customerId,
      amount,
      channel,
      referenceNote,
      weekId,
      createdBy: request.user.uid
    })

    const pendingOrders = await CustomerOrder.find({
      customer_id: customerId,
      status: 'pending_payment'
    })
      .select('order_id order_value')
      .lean()

    const pendingOrdersNowCoverable = pendingOrders
      .filter(order => order.order_value <= newBalance)
      .map(order => ({
        orderId: order.order_id,
        orderValue: order.order_value
      }))

    return {
      ok: true,
      txnId,
      walletBalance: newBalance,
      pendingOrdersNowCoverable
    }
  })
}

module.exports = customersRoutes
