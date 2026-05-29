'use strict'

const { randomUUID } = require('node:crypto')
const { enforceActionAllowed } = require('../modules/stateMachine')
const MarketWeek = require('../models/MarketWeek')
const CustomerOrder = require('../models/CustomerOrder')
const Customer = require('../models/Customer')
const ProductCatalogue = require('../models/ProductCatalogue')
const FarmerPayment = require('../models/FarmerPayment')
const Farmer = require('../models/Farmer')
const LocalFarmerInbound = require('../models/LocalFarmerInbound')
const WeeklySummary = require('../models/WeeklySummary')
const WalletEngine = require('../modules/walletEngine')
const {
  AppError,
  OrderNotFoundError,
  ActionNotAllowedError,
  MarketWeekNotFoundError
} = require('../lib/errors')

const ORDER_UNITS = ['kg', 'piece', 'bunch', '100g']
const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid']
const PAYMENT_CHANNELS = ['cash', 'upi']

const integerPaiseSchema = {
  type: 'integer',
  minimum: 0
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
 * @param {object} line
 * @returns {number}
 */
function computeMonetaryDifferencePaise (line) {
  const differenceQty = line.delivered_qty - line.ordered_qty
  return Math.round(differenceQty * line.price_per_unit)
}

/**
 * @param {object} product
 */
function toProductDetail (product) {
  return {
    productId: product.product_id,
    nameEn: product.name_en,
    nameTa: product.name_ta ?? null,
    defaultUnit: product.default_unit,
    active: product.active,
    createdAt: toIsoString(product.created_at),
    createdBy: product.created_by
  }
}

/**
 * @param {object} product
 */
function toProductListItem (product) {
  return {
    productId: product.product_id,
    nameEn: product.name_en,
    nameTa: product.name_ta ?? null,
    defaultUnit: product.default_unit,
    active: product.active
  }
}

/**
 * @param {object} payment
 * @param {string} [farmerName]
 */
function toFarmerPayment (payment, farmerName) {
  return {
    paymentId: payment.payment_id,
    farmerId: payment.farmer_id,
    farmerName: farmerName ?? payment.farmer_id,
    amountDue: payment.amount_due,
    status: payment.status,
    amountPaid: payment.amount_paid,
    outstanding: payment.outstanding,
    channel: payment.channel ?? null
  }
}

/**
 * @param {object} summary
 */
/**
 * @param {object} row
 * @param {Map<string, string>} [productNameById]
 */
function toLocalFarmerPaymentItem (row, productNameById) {
  const inboundQty = row.inbound_qty
  const soldQty = row.sold_qty
  const itemName = row.item_name ??
    (row.product_id ? productNameById?.get(row.product_id) : null) ??
    ''
  return {
    inboundId: row.inbound_id,
    productId: row.product_id ?? null,
    itemName,
    unit: row.unit,
    inboundQty,
    soldQty,
    unsoldQty: inboundQty - soldQty,
    pricePerUnit: row.price_per_unit,
    amountDue: soldQty * row.price_per_unit
  }
}

function toWeeklySummaryResponse (summary) {
  return {
    summaryId: summary.summary_id,
    weekId: summary.week_id,
    openingBalanceCash: summary.opening_balance_cash,
    openingBalanceBank: summary.opening_balance_bank,
    preorderReceiptsCash: summary.preorder_receipts_cash,
    preorderReceiptsBank: summary.preorder_receipts_bank,
    marketDayReceiptsCash: summary.market_day_receipts_cash,
    marketDayReceiptsBank: summary.market_day_receipts_bank,
    walkinReceiptsCash: summary.walkin_receipts_cash,
    walkinReceiptsBank: summary.walkin_receipts_bank,
    walletAdjustmentsCredits: summary.wallet_adjustments_credits,
    walletAdjustmentsDebits: summary.wallet_adjustments_debits,
    outstationFarmerPaidCash: summary.outstation_farmer_paid_cash,
    outstationFarmerPaidBank: summary.outstation_farmer_paid_bank,
    localFarmerPaidCash: summary.local_farmer_paid_cash,
    localFarmerPaidBank: summary.local_farmer_paid_bank,
    outstandingFarmerLiabilities: summary.outstanding_farmer_liabilities,
    outstandingCustomerDues: summary.outstanding_customer_dues,
    closingBalanceCash: summary.closing_balance_cash,
    closingBalanceBank: summary.closing_balance_bank,
    generatedAt: toIsoString(summary.generated_at),
    createdAt: toIsoString(summary.created_at),
    createdBy: summary.created_by
  }
}

async function reconciliationAndMoreRoutes (fastify) {
  fastify.get('/weeks/:weekId/reconciliation', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const { weekId } = request.params

    const orders = await CustomerOrder.find({ week_id: weekId })
      .select('order_id customer_id line_items')
      .lean()

    const customerIds = [...new Set(orders.map(o => o.customer_id))]
    const [customers, products, inboundRows, paymentRows, farmers] = await Promise.all([
      Customer.find({ customer_id: { $in: customerIds } })
        .select('customer_id name')
        .lean(),
      ProductCatalogue.find({ active: true }).select('product_id name_en').lean(),
      LocalFarmerInbound.find({ week_id: weekId }).lean(),
      FarmerPayment.find({ week_id: weekId }).lean(),
      Farmer.find({ active: true }).select('farmer_id name farmer_type').lean()
    ])

    const customerNameById = new Map(customers.map(c => [c.customer_id, c.name]))
    const productNameById = new Map(products.map(p => [p.product_id, p.name_en]))
    const farmerNameById = new Map(farmers.map(f => [f.farmer_id, f.name]))
    const farmerTypeById = new Map(farmers.map(f => [f.farmer_id, f.farmer_type]))

    const priceDifferences = []
    for (const order of orders) {
      for (const li of order.line_items ?? []) {
        if (li.delivered_qty === li.ordered_qty) continue
        const differenceQty = li.delivered_qty - li.ordered_qty
        priceDifferences.push({
          diffId: `${order.order_id}:${li.line_item_id}`,
          orderId: order.order_id,
          lineItemId: li.line_item_id,
          customerId: order.customer_id,
          customerName: customerNameById.get(order.customer_id) ?? order.customer_id,
          productId: li.product_id,
          productName: productNameById.get(li.product_id) ?? li.product_id,
          orderedQty: li.ordered_qty,
          deliveredQty: li.delivered_qty,
          differenceQty,
          pricePerUnit: li.price_per_unit,
          monetaryDifference: computeMonetaryDifferencePaise(li),
          differenceConfirmed: li.difference_confirmed === true
        })
      }
    }

    const localFarmerItems = inboundRows.map(row => ({
      inboundId: row.inbound_id,
      farmerId: row.farmer_id,
      farmerName: farmerNameById.get(row.farmer_id) ?? row.farmer_id,
      productId: row.product_id ?? null,
      itemName: row.item_name ?? null,
      inboundQty: row.inbound_qty,
      soldQty: row.sold_qty,
      unit: row.unit,
      pricePerUnit: row.price_per_unit,
      amountDue: Math.round((row.inbound_qty - row.sold_qty) * row.price_per_unit),
      amountPaid: row.amount_paid ?? null,
      paymentChannel: row.payment_channel ?? null,
      paymentRecorded: row.payment_recorded_at != null ||
        (row.amount_paid != null && row.payment_channel != null)
    }))

    const outstationPayments = paymentRows
      .filter(p => farmerTypeById.get(p.farmer_id) === 'outstation')
      .map(p => toFarmerPayment(p, farmerNameById.get(p.farmer_id)))

    return {
      priceDifferences,
      localFarmerItems,
      outstationPayments
    }
  })

  fastify.post('/weeks/:weekId/reconciliation/:diffId/confirm', {
    config: { action: 'confirm_price_diff' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'diffId'],
        properties: {
          weekId: { type: 'string' },
          diffId: { type: 'string', minLength: 3 }
        }
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      }
    }
  }, async (request) => {
    const { weekId, diffId } = request.params
    const operatorId = request.user.uid

    const colonIdx = diffId.indexOf(':')
    if (colonIdx < 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'diffId must be in format orderId:lineItemId',
        { diffId }
      )
    }

    const orderId = diffId.slice(0, colonIdx)
    const lineItemId = diffId.slice(colonIdx + 1)

    const order = await CustomerOrder.findOne({ order_id: orderId, week_id: weekId })
    if (!order) {
      throw new OrderNotFoundError(`Order not found: ${orderId}`, { orderId, weekId })
    }

    const line = (order.line_items ?? []).find(li => li.line_item_id === lineItemId)
    if (!line) {
      throw new OrderNotFoundError(`Order not found: ${orderId}`, { orderId, weekId })
    }

    if (line.difference_confirmed) {
      return {
        ok: true,
        diffId,
        differenceConfirmed: true,
        walletTxnId: null,
        customerDueCreated: false
      }
    }

    const monetaryDifference = computeMonetaryDifferencePaise(line)
    let walletTxnId = null
    let customerDueCreated = false

    if (monetaryDifference !== 0) {
      const idempotencyKey = `pricediff-${diffId}`
      const direction = monetaryDifference < 0 ? 'credit' : 'debit'
      const amount = Math.abs(monetaryDifference)

      const result = await WalletEngine.applyPriceDiff({
        idempotencyKey,
        customerId: order.customer_id,
        amount,
        direction,
        lineItemId,
        weekId,
        createdBy: operatorId
      })

      walletTxnId = result.txnIds[0] ?? null
      customerDueCreated = (result.dueAmount ?? 0) > 0
    }

    await CustomerOrder.updateOne(
      {
        order_id: orderId,
        week_id: weekId,
        'line_items.line_item_id': lineItemId
      },
      { $set: { 'line_items.$.difference_confirmed': true } }
    )

    return {
      ok: true,
      diffId,
      differenceConfirmed: true,
      walletTxnId,
      customerDueCreated
    }
  })

  fastify.get('/weeks/:weekId/localfarmer-payments', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const { weekId } = request.params

    const inboundRows = await LocalFarmerInbound.find({ week_id: weekId }).lean()
    if (inboundRows.length === 0) {
      return { localFarmerPayments: [] }
    }

    const productIds = [...new Set(
      inboundRows.map(r => r.product_id).filter(Boolean)
    )]
    const farmerIds = [...new Set(inboundRows.map(r => r.farmer_id))]

    const [products, farmers] = await Promise.all([
      productIds.length > 0
        ? ProductCatalogue.find({ product_id: { $in: productIds } })
          .select('product_id name_en')
          .lean()
        : [],
      Farmer.find({ farmer_id: { $in: farmerIds } })
        .select('farmer_id name')
        .lean()
    ])

    const productNameById = new Map(products.map(p => [p.product_id, p.name_en]))
    const farmerNameById = new Map(farmers.map(f => [f.farmer_id, f.name]))

    const byFarmer = new Map()
    for (const row of inboundRows) {
      const cash = row.payment_amount_cash ?? 0
      const bank = row.payment_amount_bank ?? 0
      const item = toLocalFarmerPaymentItem(row, productNameById)

      if (!byFarmer.has(row.farmer_id)) {
        byFarmer.set(row.farmer_id, {
          farmerId: row.farmer_id,
          farmerName: farmerNameById.get(row.farmer_id) ?? row.farmer_id,
          items: [],
          totalAmountDue: 0,
          paymentAmountCash: 0,
          paymentAmountBank: 0
        })
      }

      const group = byFarmer.get(row.farmer_id)
      group.items.push(item)
      group.totalAmountDue += item.amountDue
      group.paymentAmountCash += cash
      group.paymentAmountBank += bank
    }

    const localFarmerPayments = [...byFarmer.values()].map(group => ({
      farmerId: group.farmerId,
      farmerName: group.farmerName,
      items: group.items,
      totalAmountDue: group.totalAmountDue,
      paymentAmountCash: group.paymentAmountCash,
      paymentAmountBank: group.paymentAmountBank,
      paymentComplete: (group.paymentAmountCash + group.paymentAmountBank) > 0
    }))

    return { localFarmerPayments }
  })

  fastify.patch('/weeks/:weekId/localfarmer-inbound/:inboundId/payment', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'inboundId'],
        properties: {
          weekId: { type: 'string' },
          inboundId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['paymentAmountCash', 'paymentAmountBank'],
        additionalProperties: false,
        properties: {
          soldQty: { type: 'number', minimum: 0 },
          paymentAmountCash: integerPaiseSchema,
          paymentAmountBank: integerPaiseSchema
        }
      }
    }
  }, async (request) => {
    const { weekId, inboundId } = request.params
    const { soldQty, paymentAmountCash, paymentAmountBank } = request.body

    const inbound = await LocalFarmerInbound.findOne({ inbound_id: inboundId })
    if (!inbound || inbound.week_id !== weekId) {
      throw new AppError(
        'INBOUND_NOT_FOUND',
        404,
        'Local farmer inbound record not found',
        {}
      )
    }

    const week = await MarketWeek.findOne({ week_id: inbound.week_id }).select('state').lean()
    if (!week) {
      throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
    }
    enforceActionAllowed('record_local_farmer_payment', week.state, { weekId })

    if (!Number.isInteger(paymentAmountCash) || !Number.isInteger(paymentAmountBank)) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'paymentAmountCash and paymentAmountBank must be integer paise',
        {}
      )
    }
    if (paymentAmountCash + paymentAmountBank <= 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'At least one of paymentAmountCash or paymentAmountBank must be greater than zero',
        {}
      )
    }

    if (soldQty != null) {
      if (soldQty < 0 || soldQty > inbound.inbound_qty) {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          'soldQty must be between 0 and inboundQty',
          { soldQty, inboundQty: inbound.inbound_qty }
        )
      }
      inbound.sold_qty = soldQty
    }

    inbound.payment_amount_cash = paymentAmountCash
    inbound.payment_amount_bank = paymentAmountBank
    await inbound.save()

    const totalPayment = paymentAmountCash + paymentAmountBank
    return {
      ok: true,
      inboundId: inbound.inbound_id,
      farmerId: inbound.farmer_id,
      soldQty: inbound.sold_qty,
      paymentAmountCash,
      paymentAmountBank,
      totalPayment
    }
  })

  fastify.get('/weeks/:weekId/farmerpayments', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const payments = await FarmerPayment.find({ week_id: request.params.weekId }).lean()
    const farmerIds = [...new Set(payments.map(p => p.farmer_id))]
    const farmers = await Farmer.find({ farmer_id: { $in: farmerIds } })
      .select('farmer_id name')
      .lean()
    const farmerNameById = new Map(farmers.map(f => [f.farmer_id, f.name]))

    return {
      payments: payments.map(p =>
        toFarmerPayment(p, farmerNameById.get(p.farmer_id))
      )
    }
  })

  fastify.patch('/weeks/:weekId/farmerpayments/:paymentId', {
    config: { action: 'mark_outstation_farmer_payment' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'paymentId'],
        properties: {
          weekId: { type: 'string' },
          paymentId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: PAYMENT_STATUSES },
          amountPaid: integerPaiseSchema,
          channel: { type: 'string', enum: PAYMENT_CHANNELS }
        }
      }
    }
  }, async (request) => {
    const { weekId, paymentId } = request.params
    const { status, amountPaid, channel } = request.body

    if ((status === 'partial' || status === 'paid') && amountPaid == null) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'amountPaid is required when status is partial or paid',
        { status }
      )
    }
    if ((status === 'partial' || status === 'paid') && !channel) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'channel is required when status is partial or paid',
        { status }
      )
    }

    const payment = await FarmerPayment.findOne({
      payment_id: paymentId,
      week_id: weekId
    })
    if (!payment) {
      throw new AppError(
        'PAYMENT_NOT_FOUND',
        404,
        `Farmer payment not found: ${paymentId}`,
        { paymentId, weekId }
      )
    }

    const paid = status === 'unpaid' ? 0 : (amountPaid ?? 0)
    payment.status = status
    payment.amount_paid = paid
    payment.outstanding = Math.max(0, payment.amount_due - paid)
    payment.channel = status === 'unpaid' ? null : channel
    payment.recorded_at = new Date()
    await payment.save()

    const farmer = await Farmer.findOne({ farmer_id: payment.farmer_id })
      .select('name')
      .lean()

    return toFarmerPayment(payment.toObject(), farmer?.name)
  })

  fastify.get('/weeks/:weekId/summary', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const { weekId } = request.params

    const week = await MarketWeek.findOne({ week_id: weekId }).select('state').lean()
    if (!week || week.state !== 'closed') {
      throw new AppError(
        'SUMMARY_NOT_FOUND',
        404,
        `Weekly summary not found for week: ${weekId}`,
        { weekId }
      )
    }

    const summary = await WeeklySummary.findOne({ week_id: weekId }).lean()
    if (!summary) {
      throw new AppError(
        'SUMMARY_NOT_FOUND',
        404,
        `Weekly summary not found for week: ${weekId}`,
        { weekId }
      )
    }

    return toWeeklySummaryResponse(summary)
  })

  fastify.get('/catalogue', {}, async () => {
    const products = await ProductCatalogue.find({})
      .sort({ name_en: 1 })
      .lean()
    return { products: products.map(toProductListItem) }
  })

  fastify.post('/catalogue', {
    config: { action: 'register_entity' },
    schema: {
      body: {
        type: 'object',
        required: ['nameEn', 'defaultUnit'],
        additionalProperties: false,
        properties: {
          nameEn: { type: 'string', minLength: 1 },
          nameTa: { type: 'string', minLength: 1 },
          defaultUnit: { type: 'string', enum: ORDER_UNITS }
        }
      }
    }
  }, async (request, reply) => {
    const { nameEn, nameTa, defaultUnit } = request.body
    const productId = `prod-${randomUUID()}`
    const operatorId = request.user.uid

    const product = await ProductCatalogue.create({
      product_id: productId,
      name_en: nameEn.trim(),
      name_ta: nameTa?.trim() ?? '',
      default_unit: defaultUnit,
      active: true,
      created_by: operatorId
    })

    return reply.code(201).send(toProductDetail(product.toObject()))
  })

  fastify.patch('/catalogue/:productId', {
    config: { action: 'register_entity' },
    schema: {
      params: {
        type: 'object',
        required: ['productId'],
        properties: { productId: { type: 'string', minLength: 1 } }
      },
      body: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          nameEn: { type: 'string', minLength: 1 },
          nameTa: { type: 'string', minLength: 1 },
          defaultUnit: { type: 'string', enum: ORDER_UNITS },
          active: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    const { productId } = request.params
    const updates = {}

    if (request.body.nameEn != null) updates.name_en = request.body.nameEn.trim()
    if (request.body.nameTa != null) updates.name_ta = request.body.nameTa.trim()
    if (request.body.defaultUnit != null) updates.default_unit = request.body.defaultUnit
    if (request.body.active != null) updates.active = request.body.active

    const product = await ProductCatalogue.findOneAndUpdate(
      { product_id: productId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean()

    if (!product) {
      throw new AppError('PRODUCT_NOT_FOUND', 404, `Product not found: ${productId}`, { productId })
    }
    return toProductDetail(product)
  })
}

module.exports = reconciliationAndMoreRoutes
