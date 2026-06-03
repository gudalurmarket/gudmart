'use strict'

const { randomUUID } = require('node:crypto')
const InboundMessage = require('../models/InboundMessage')
const CustomerOrder = require('../models/CustomerOrder')
const Customer = require('../models/Customer')
const WeeklyProduceItem = require('../models/WeeklyProduceItem')
const WalletEngine = require('../modules/walletEngine')
const {
  AppError,
  CustomerNotFoundError,
  DuplicateMessageError,
  OrderNotFoundError,
  WalletInsufficientError
} = require('../lib/errors')

const ORDER_UNITS = ['kg', 'piece', 'bunch', '100g']
const QUEUE_STATUSES = ['pending', 'approved', 'rejected']
const ORDER_STATUSES = [
  'pending_payment',
  'confirmed',
  'cancelled',
  'packed',
  'dispatched',
  'delivered'
]

const lineItemInputSchema = {
  type: 'object',
  required: ['productId', 'orderedQty', 'unit'],
  additionalProperties: false,
  properties: {
    productId: { type: 'string', minLength: 1 },
    orderedQty: { type: 'number', exclusiveMinimum: 0 },
    unit: { type: 'string', enum: ORDER_UNITS }
  }
}

/**
 * @param {Date|string} value
 * @returns {string}
 */
function toIsoString (value) {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/**
 * @param {number} orderedQty
 * @param {number} pricePerUnit
 * @returns {number}
 */
function computeLineValuePaise (orderedQty, pricePerUnit) {
  const lineValue = Math.round(orderedQty * pricePerUnit)
  if (!Number.isInteger(lineValue) || lineValue < 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Line value must be a non-negative integer (paise)',
      { orderedQty, pricePerUnit }
    )
  }
  return lineValue
}

/**
 * @param {string} weekId
 * @param {Array<{ productId: string, orderedQty: number, unit: string }>} lineItemsInput
 * @returns {Promise<{ embedded: object[], orderValue: number, byProductId: Map<string, object> }>}
 */
async function buildLineItemsFromInput (weekId, lineItemsInput) {
  const productIds = [...new Set(lineItemsInput.map(li => li.productId))]
  const produceRows = await WeeklyProduceItem.find({
    week_id: weekId,
    product_id: { $in: productIds }
  }).lean()

  const byProductId = new Map(produceRows.map(row => [row.product_id, row]))

  const embedded = []
  let orderValue = 0

  for (const li of lineItemsInput) {
    const produce = byProductId.get(li.productId)
    if (!produce) {
      throw new AppError(
        'PRODUCE_ITEM_NOT_FOUND',
        400,
        `Product not found in week produce list: ${li.productId}`,
        { weekId, productId: li.productId }
      )
    }
    const lineValue = computeLineValuePaise(li.orderedQty, produce.price_per_unit)
    orderValue += lineValue
    embedded.push({
      line_item_id: `li-${randomUUID()}`,
      product_id: li.productId,
      ordered_qty: li.orderedQty,
      delivered_qty: li.orderedQty,
      unit: li.unit,
      price_per_unit: produce.price_per_unit,
      line_value: lineValue,
      difference_confirmed: false
    })
  }

  return { embedded, orderValue, byProductId }
}

/**
 * @param {object} order — lean CustomerOrder or camelCase legacy document
 * @returns {number}
 */
function resolveOrderValuePaise (order) {
  const direct = order.order_value ?? order.orderValue
  if (Number.isInteger(direct) && direct >= 0) return direct

  const lineItems = order.line_items ?? order.lineItems ?? []
  let sum = 0
  for (const li of lineItems) {
    const lineValue = li.line_value ?? li.lineValue
    if (Number.isInteger(lineValue) && lineValue >= 0) {
      sum += lineValue
      continue
    }
    const qty = li.ordered_qty ?? li.orderedQty
    const price = li.price_per_unit ?? li.pricePerUnit
    if (Number.isFinite(qty) && Number.isInteger(price) && price >= 0) {
      sum += computeLineValuePaise(qty, price)
    }
  }
  return sum
}

/**
 * @param {object} order
 * @param {object} [customer]
 */
function toOrderResponse (order, customer = null) {
  return {
    orderId: order.order_id ?? order.orderId,
    weekId: order.week_id ?? order.weekId,
    customerId: order.customer_id ?? order.customerId,
    customerName: customer?.name ?? order.customer_name ?? order.customerName ?? null,
    customerPhone: customer?.phone ?? order.customer_phone ?? order.customerPhone ?? null,
    walletBalance:
      customer != null && Number.isInteger(customer.wallet_balance)
        ? customer.wallet_balance
        : (order.wallet_balance ?? order.walletBalance ?? null),
    status: order.status,
    fcfsTimestamp: toIsoString(order.fcfs_timestamp ?? order.fcfsTimestamp),
    orderValue: resolveOrderValuePaise(order),
    walletDebited: order.wallet_debited,
    balanceDue: order.balance_due,
    balanceCleared: order.balance_cleared,
    notes: order.notes ?? null,
    lineItems: (order.line_items ?? []).map(li => ({
      lineItemId: li.line_item_id,
      productId: li.product_id,
      orderedQty: li.ordered_qty,
      deliveredQty: li.delivered_qty,
      unit: li.unit,
      pricePerUnit: li.price_per_unit,
      lineValue: li.line_value,
      differenceConfirmed: li.difference_confirmed
    })),
    createdAt: toIsoString(order.created_at),
    createdBy: order.created_by
  }
}

/**
 * @param {object} msg
 * @param {Map<string, string>} customerNames
 */
function toIntakeMessage (msg, customerNames) {
  return {
    messageId: msg.message_id,
    senderPhone: msg.sender_phone,
    customerId: msg.customer_id ?? null,
    customerName: msg.customer_id
      ? (customerNames.get(msg.customer_id) ?? null)
      : null,
    body: msg.body ?? null,
    mediaType: msg.media_type,
    fcfsTimestamp: toIsoString(msg.fcfs_timestamp),
    parseStatus: msg.parse_status,
    parsedItems: (msg.parsed_items ?? []).map(item => ({
      rawText: item.raw_text,
      productId: item.product_id ?? null,
      rawProductText: item.raw_product_text ?? null,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      confidence: item.confidence
    })),
    queueStatus: msg.queue_status,
    operatorNotes: msg.operator_notes ?? null,
    linkedOrderId: msg.linked_order_id ?? null
  }
}

/**
 * @param {string} customerId
 * @param {number} orderValuePaise
 * @param {string} orderId
 * @param {string} weekId
 * @param {string} operatorId
 * @returns {Promise<{ confirmed: boolean, walletDebited: number, shortfallAmount: number|null, debitTxnId: string|null }>}
 */
async function attemptOrderDebit ({
  customerId,
  orderValuePaise,
  orderId,
  weekId,
  operatorId
}) {
  if (orderValuePaise <= 0) {
    return {
      confirmed: true,
      walletDebited: 0,
      shortfallAmount: null,
      debitTxnId: null
    }
  }

  try {
    const { txnId } = await WalletEngine.debitForOrder({
      idempotencyKey: randomUUID(),
      customerId,
      orderId,
      weekId,
      amount: orderValuePaise,
      createdBy: operatorId
    })
    return {
      confirmed: true,
      walletDebited: orderValuePaise,
      shortfallAmount: null,
      debitTxnId: txnId
    }
  } catch (err) {
    if (!(err instanceof WalletInsufficientError)) {
      throw err
    }
    const customer = await Customer.findOne({ customer_id: customerId })
      .select('wallet_balance')
      .lean()
    const balance = customer?.wallet_balance ?? 0
    return {
      confirmed: false,
      walletDebited: 0,
      shortfallAmount: orderValuePaise - balance,
      debitTxnId: null
    }
  }
}

/**
 * @param {import('fastify').FastifyRequest} request
 */
function resolvePatchOrderAction (request) {
  request.routeOptions.config = request.routeOptions.config ?? {}
  request.routeOptions.config.action =
    request.body?.balancePayment != null
      ? 'record_balance_payment'
      : 'edit_order'
}

async function ordersAndIntakeRoutes (fastify) {
  fastify.get('/weeks/:weekId/intake', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      },
      querystring: {
        type: 'object',
        properties: {
          queueStatus: { type: 'string', enum: QUEUE_STATUSES }
        }
      }
    }
  }, async (request) => {
    const { weekId } = request.params
    const filter = { week_id: weekId }
    if (request.query.queueStatus) {
      filter.queue_status = request.query.queueStatus
    }

    const messages = await InboundMessage.find(filter)
      .sort({ fcfs_timestamp: 1 })
      .lean()

    const customerIds = [
      ...new Set(messages.map(m => m.customer_id).filter(Boolean))
    ]
    const customers = customerIds.length > 0
      ? await Customer.find({ customer_id: { $in: customerIds } })
        .select('customer_id name')
        .lean()
      : []
    const customerNames = new Map(
      customers.map(c => [c.customer_id, c.name])
    )

    return {
      messages: messages.map(msg => toIntakeMessage(msg, customerNames))
    }
  })

  fastify.patch('/weeks/:weekId/intake/:messageId', {
    config: { action: 'confirm_order' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'messageId'],
        properties: {
          weekId: { type: 'string' },
          messageId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['action'],
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['approve', 'reject'] },
          lineItems: {
            type: 'array',
            minItems: 1,
            items: lineItemInputSchema
          },
          operatorNotes: { type: 'string', maxLength: 2000 }
        }
      }
    }
  }, async (request) => {
    const { weekId, messageId } = request.params
    const { action, lineItems, operatorNotes } = request.body

    const inbound = await InboundMessage.findOne({ message_id: messageId })
    if (!inbound) {
      throw new AppError(
        'MESSAGE_NOT_FOUND',
        404,
        `Inbound message not found: ${messageId}`,
        { messageId, weekId }
      )
    }
    if (inbound.week_id !== weekId) {
      throw new AppError(
        'MESSAGE_NOT_FOUND',
        404,
        `Inbound message not found: ${messageId}`,
        { messageId, weekId }
      )
    }
    if (inbound.queue_status !== 'pending') {
      throw new DuplicateMessageError(
        `Inbound message already processed: ${messageId}`,
        { messageId, queueStatus: inbound.queue_status }
      )
    }

    const now = new Date()
    const operatorId = request.user.uid

    if (action === 'reject') {
      inbound.queue_status = 'rejected'
      inbound.processed_at = now
      if (operatorNotes != null) inbound.operator_notes = operatorNotes
      await inbound.save()

      return {
        ok: true,
        messageId,
        queueStatus: 'rejected'
      }
    }

    if (!lineItems || lineItems.length < 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'lineItems is required when action is approve',
        { action }
      )
    }

    if (!inbound.customer_id) {
      throw new CustomerNotFoundError(`Customer not found: ${messageId}`, { customerId: messageId })
    }

    const customer = await Customer.findOne({ customer_id: inbound.customer_id }).lean()
    if (!customer) {
      throw new CustomerNotFoundError(
        `Customer not found: ${inbound.customer_id}`,
        { customerId: inbound.customer_id }
      )
    }

    const { embedded, orderValue } = await buildLineItemsFromInput(weekId, lineItems)
    const orderId = `ord-${randomUUID()}`
    const fcfsTimestamp = inbound.fcfs_timestamp

    const debitOutcome = await attemptOrderDebit({
      customerId: inbound.customer_id,
      orderValuePaise: orderValue,
      orderId,
      weekId,
      operatorId
    })

    const orderStatus = debitOutcome.confirmed ? 'confirmed' : 'pending_payment'
    const walletDebited = debitOutcome.walletDebited
    const balanceDue = debitOutcome.confirmed ? 0 : orderValue

    await CustomerOrder.create({
      order_id: orderId,
      week_id: weekId,
      customer_id: inbound.customer_id,
      status: orderStatus,
      fcfs_timestamp: fcfsTimestamp,
      order_value: orderValue,
      wallet_debited: walletDebited,
      wallet_txn_id: debitOutcome.debitTxnId,
      balance_due: balanceDue,
      balance_cleared: false,
      line_items: embedded,
      created_by: operatorId
    })

    inbound.queue_status = 'approved'
    inbound.linked_order_id = orderId
    inbound.processed_at = now
    if (operatorNotes != null) inbound.operator_notes = operatorNotes
    await inbound.save()

    const response = {
      ok: true,
      messageId,
      queueStatus: 'approved',
      order: {
        orderId,
        status: orderStatus,
        orderValue,
        walletDebited,
        fcfsTimestamp: toIsoString(fcfsTimestamp)
      }
    }

    if (!debitOutcome.confirmed) {
      response.shortfallAmount = debitOutcome.shortfallAmount
    }

    return response
  })

  fastify.get('/weeks/:weekId/orders', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ORDER_STATUSES },
          customerId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { weekId } = request.params
    const filter = { week_id: weekId }
    if (request.query.status) filter.status = request.query.status
    if (request.query.customerId) filter.customer_id = request.query.customerId

    const orders = await CustomerOrder.find(filter)
      .sort({ fcfs_timestamp: 1 })
      .lean()

    const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))]
    const customers = customerIds.length > 0
      ? await Customer.find({ customer_id: { $in: customerIds } })
        .select('customer_id name phone wallet_balance')
        .lean()
      : []
    const customerById = new Map(customers.map(c => [c.customer_id, c]))

    return {
      orders: orders.map(o => toOrderResponse(o, customerById.get(o.customer_id)))
    }
  })

  fastify.post('/weeks/:weekId/orders', {
    config: { action: 'create_order' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      },
      body: {
        type: 'object',
        required: ['customerId', 'lineItems'],
        additionalProperties: false,
        properties: {
          customerId: { type: 'string', minLength: 1 },
          lineItems: {
            type: 'array',
            minItems: 1,
            items: lineItemInputSchema
          },
          notes: { type: 'string', maxLength: 2000 }
        }
      }
    }
  }, async (request, reply) => {
    const { weekId } = request.params
    const { customerId, lineItems, notes } = request.body
    const operatorId = request.user.uid

    const customer = await Customer.findOne({ customer_id: customerId }).lean()
    if (!customer) {
      throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
    }

    const { embedded, orderValue } = await buildLineItemsFromInput(weekId, lineItems)
    const orderId = `ord-${randomUUID()}`
    const fcfsTimestamp = new Date()

    const debitOutcome = await attemptOrderDebit({
      customerId,
      orderValuePaise: orderValue,
      orderId,
      weekId,
      operatorId
    })

    const orderStatus = debitOutcome.confirmed ? 'confirmed' : 'pending_payment'

    const orderDoc = {
      order_id: orderId,
      week_id: weekId,
      customer_id: customerId,
      status: orderStatus,
      fcfs_timestamp: fcfsTimestamp,
      order_value: orderValue,
      wallet_debited: debitOutcome.walletDebited,
      wallet_txn_id: debitOutcome.debitTxnId,
      balance_due: debitOutcome.confirmed ? 0 : orderValue,
      balance_cleared: false,
      line_items: embedded,
      created_by: operatorId
    }
    if (notes != null) orderDoc.notes = notes
    await CustomerOrder.create(orderDoc)

    return reply.code(201).send({
      orderId,
      status: orderStatus,
      orderValue,
      walletDebited: debitOutcome.walletDebited,
      shortfallAmount: debitOutcome.shortfallAmount,
      fcfsTimestamp: toIsoString(fcfsTimestamp)
    })
  })

  fastify.patch('/weeks/:weekId/orders/:orderId', {
    preHandler: resolvePatchOrderAction,
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'orderId'],
        properties: {
          weekId: { type: 'string' },
          orderId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          lineItems: {
            type: 'array',
            minItems: 1,
            items: lineItemInputSchema
          },
          notes: { type: 'string', maxLength: 2000 },
          balancePayment: {
            type: 'object',
            required: ['amount', 'channel'],
            additionalProperties: false,
            properties: {
              amount: { type: 'integer', minimum: 1 },
              channel: { type: 'string', enum: ['cash', 'upi'] }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { weekId, orderId } = request.params
    const { lineItems, notes, balancePayment } = request.body
    const operatorId = request.user.uid

    const order = await CustomerOrder.findOne({
      order_id: orderId,
      week_id: weekId
    })
    if (!order) {
      throw new OrderNotFoundError(`Order not found: ${orderId}`, { orderId, weekId })
    }

    if (balancePayment != null) {
      await WalletEngine.applyBalancePayment({
        idempotencyKey: randomUUID(),
        customerId: order.customer_id,
        amount: balancePayment.amount,
        channel: balancePayment.channel,
        orderId,
        weekId,
        createdBy: operatorId
      })

      const remainingDue = Math.max(0, order.balance_due - balancePayment.amount)
      order.balance_due = remainingDue
      order.balance_cleared = remainingDue === 0
      await order.save()

      return {
        ok: true,
        orderId,
        status: order.status,
        orderValue: order.order_value,
        walletDebited: order.wallet_debited,
        shortfallAmount: null
      }
    }

    if (!lineItems || lineItems.length < 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'lineItems is required for order edit',
        {}
      )
    }

    const oldOrderValue = order.order_value
    const { embedded, orderValue: newOrderValue } = await buildLineItemsFromInput(
      weekId,
      lineItems
    )

    let status = order.status
    let walletDebited = order.wallet_debited
    let walletTxnId = order.wallet_txn_id ?? null
    let shortfallAmount = null

    if (newOrderValue > oldOrderValue) {
      const diff = newOrderValue - oldOrderValue

      if (order.wallet_debited > 0 && order.status === 'confirmed') {
        try {
          await WalletEngine.debitForOrder({
            idempotencyKey: randomUUID(),
            customerId: order.customer_id,
            orderId,
            weekId,
            amount: diff,
            createdBy: operatorId
          })
          walletDebited = order.wallet_debited + diff
          status = 'confirmed'
        } catch (err) {
          if (!(err instanceof WalletInsufficientError)) {
            throw err
          }
          if (!order.wallet_txn_id) {
            throw err
          }
          await WalletEngine.reverseOrderDebit({
            idempotencyKey: randomUUID(),
            customerId: order.customer_id,
            originalDebitTxnId: order.wallet_txn_id,
            orderId,
            createdBy: operatorId
          })
          status = 'pending_payment'
          walletDebited = 0
          walletTxnId = null
          const customer = await Customer.findOne({ customer_id: order.customer_id })
            .select('wallet_balance')
            .lean()
          shortfallAmount = newOrderValue - (customer?.wallet_balance ?? 0)
        }
      } else {
        const debitOutcome = await attemptOrderDebit({
          customerId: order.customer_id,
          orderValuePaise: newOrderValue,
          orderId,
          weekId,
          operatorId
        })
        status = debitOutcome.confirmed ? 'confirmed' : 'pending_payment'
        walletDebited = debitOutcome.walletDebited
        walletTxnId = debitOutcome.debitTxnId
        shortfallAmount = debitOutcome.shortfallAmount
      }
    } else if (newOrderValue < oldOrderValue) {
      if (order.wallet_debited > 0) {
        if (!order.wallet_txn_id) {
          throw new AppError(
            'WALLET_TXN_NOT_FOUND',
            404,
            'Original order debit transaction not found',
            { orderId }
          )
        }

        await WalletEngine.reverseOrderDebit({
          idempotencyKey: randomUUID(),
          customerId: order.customer_id,
          originalDebitTxnId: order.wallet_txn_id,
          orderId,
          createdBy: operatorId
        })
        const { txnId } = await WalletEngine.debitForOrder({
          idempotencyKey: randomUUID(),
          customerId: order.customer_id,
          orderId,
          weekId,
          amount: newOrderValue,
          createdBy: operatorId
        })
        walletDebited = newOrderValue
        walletTxnId = txnId
        status = 'confirmed'
      } else {
        walletDebited = 0
      }
    }

    const update = {
      order_value: newOrderValue,
      wallet_debited: walletDebited,
      wallet_txn_id: walletTxnId,
      status,
      line_items: embedded,
      balance_due: status === 'confirmed' ? 0 : newOrderValue - walletDebited
    }
    if (notes != null) update.notes = notes

    await CustomerOrder.updateOne(
      { order_id: orderId, week_id: weekId },
      { $set: update }
    )

    const result = {
      ok: true,
      orderId,
      status,
      orderValue: newOrderValue,
      walletDebited,
      shortfallAmount
    }
    return result
  })

  fastify.post('/weeks/:weekId/orders/:orderId/confirm', {
    config: { action: 'confirm_order' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'orderId'],
        properties: {
          weekId: { type: 'string' },
          orderId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      }
    }
  }, async (request) => {
    const { weekId, orderId } = request.params
    const operatorId = request.user.uid

    const order = await CustomerOrder.findOne({
      order_id: orderId,
      week_id: weekId
    })
    if (!order) {
      throw new OrderNotFoundError(`Order not found: ${orderId}`, { orderId, weekId })
    }

    if (order.status !== 'pending_payment') {
      throw new AppError(
        'ACTION_NOT_PERMITTED_IN_STATE',
        409,
        'Only pending payment orders can be confirmed',
        { orderId, status: order.status }
      )
    }

    const orderValue = order.order_value
    const debitOutcome = await attemptOrderDebit({
      customerId: order.customer_id,
      orderValuePaise: orderValue,
      orderId,
      weekId,
      operatorId
    })

    if (!debitOutcome.confirmed) {
      throw new WalletInsufficientError(
        'Wallet balance is insufficient to confirm this order',
        {
          orderId,
          shortfallAmount: debitOutcome.shortfallAmount,
          orderValue
        }
      )
    }

    await CustomerOrder.updateOne(
      { order_id: orderId, week_id: weekId },
      {
        $set: {
          status: 'confirmed',
          wallet_debited: debitOutcome.walletDebited,
          wallet_txn_id: debitOutcome.debitTxnId,
          balance_due: 0,
          pending_reason: null
        }
      }
    )

    const customer = await Customer.findOne({ customer_id: order.customer_id })
      .select('customer_id name phone wallet_balance')
      .lean()

    const orderPlain = typeof order.toObject === 'function' ? order.toObject() : order
    return toOrderResponse(
      {
        ...orderPlain,
        status: 'confirmed',
        wallet_debited: debitOutcome.walletDebited,
        wallet_txn_id: debitOutcome.debitTxnId,
        balance_due: 0
      },
      customer
    )
  })

  fastify.delete('/weeks/:weekId/orders/:orderId', {
    config: { action: 'cancel_order' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'orderId'],
        properties: {
          weekId: { type: 'string' },
          orderId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { weekId, orderId } = request.params
    const operatorId = request.user.uid

    const order = await CustomerOrder.findOne({ order_id: orderId })
    if (!order || order.week_id !== weekId) {
      throw new OrderNotFoundError(`Order not found: ${orderId}`, { orderId, weekId })
    }

    let walletReversed

    if (order.status === 'confirmed') {
      if (!order.wallet_txn_id) {
        request.log.error(
          { order_id: orderId },
          'confirmed order missing wallet_txn_id — data integrity error'
        )
        throw new Error(
          'confirmed order missing wallet_txn_id — data integrity error'
        )
      }
      await WalletEngine.reverseOrderDebit({
        idempotencyKey: randomUUID(),
        customerId: order.customer_id,
        originalDebitTxnId: order.wallet_txn_id,
        orderId,
        createdBy: operatorId
      })
      walletReversed = order.wallet_debited
    } else if (order.status === 'pending_payment') {
      walletReversed = 0
    } else {
      throw new AppError(
        'ACTION_NOT_PERMITTED_IN_STATE',
        409,
        'Order cannot be cancelled in its current status',
        { orderId, status: order.status }
      )
    }

    await CustomerOrder.updateOne(
      { order_id: orderId, week_id: weekId },
      {
        $set: {
          status: 'cancelled',
          cancelled_at: new Date(),
          cancelled_by: operatorId,
          wallet_txn_id: null
        }
      }
    )

    return {
      ok: true,
      orderId,
      status: 'cancelled',
      walletReversed
    }
  })
}

module.exports = ordersAndIntakeRoutes
