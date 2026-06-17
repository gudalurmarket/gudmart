'use strict'

const { randomUUID } = require('node:crypto')
const FarmerOrderAssignment = require('../models/FarmerOrderAssignment')
const Farmer = require('../models/Farmer')
const CustomerOrder = require('../models/CustomerOrder')
const Customer = require('../models/Customer')
const WeeklyProduceItem = require('../models/WeeklyProduceItem')
const ProductCatalogue = require('../models/ProductCatalogue')
const WalkInSale = require('../models/WalkInSale')
const LocalFarmerInbound = require('../models/LocalFarmerInbound')
const MarketWeek = require('../models/MarketWeek')
const { runFcfsAllocation, sortByFcfs } = require('../modules/fcfsEngine')
const { enforceActionAllowed } = require('../modules/stateMachine')
const {
  AppError,
  FarmerNotFoundError,
  MarketWeekNotFoundError,
  OrderNotFoundError
} = require('../lib/errors')

const ORDER_UNITS = ['kg', 'piece', 'bunch', '100g']
const WALKIN_CHANNELS = ['cash', 'upi']
const INVENTORY_SOURCES = ['outstation', 'local_farmer']

const db = {
  CustomerOrder,
  WeeklyProduceItem
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
 * @param {number} value
 * @param {string} unit
 * @returns {number}
 */
function roundQtyForUnit (value, unit) {
  if (unit === 'piece' || unit === 'bunch') {
    return Math.floor(value)
  }
  return Math.round(value * 100) / 100
}

/**
 * @param {object} assignment
 */
function toAssignmentResponse (assignment) {
  return {
    assignmentId: assignment.assignment_id,
    farmerId: assignment.farmer_id,
    productId: assignment.product_id,
    preorderQty: assignment.preorder_qty,
    bufferPct: assignment.buffer_pct,
    bufferQty: assignment.buffer_qty,
    outgoingQty: assignment.outgoing_qty,
    deliveredQty: assignment.delivered_qty
  }
}

/**
 * @param {object} sale
 */
function toWalkInSale (sale) {
  return {
    saleId: sale.sale_id,
    weekId: sale.week_id,
    productId: sale.product_id ?? null,
    inventorySource: sale.inventory_source,
    farmerId: sale.farmer_id ?? null,
    qtySold: sale.qty_sold,
    amountCollected: sale.amount_collected,
    channel: sale.channel,
    customerId: sale.customer_id ?? null,
    looseCustomerName: sale.loose_customer_name ?? null,
    looseCustomerPhone: sale.loose_customer_phone ?? null,
    createdAt: toIsoString(sale.created_at),
    createdBy: sale.created_by
  }
}

/**
 * @param {object} inbound
 */
function toLocalFarmerInbound (inbound) {
  return {
    inboundId: inbound.inbound_id,
    weekId: inbound.week_id,
    farmerId: inbound.farmer_id,
    productId: inbound.product_id ?? null,
    itemName: inbound.item_name ?? null,
    inboundQty: inbound.inbound_qty,
    soldQty: inbound.sold_qty,
    unit: inbound.unit,
    pricePerUnit: inbound.price_per_unit,
    amountPaid: inbound.amount_paid ?? null,
    paymentChannel: inbound.payment_channel ?? null,
    paymentRecordedAt: inbound.payment_recorded_at
      ? toIsoString(inbound.payment_recorded_at)
      : null,
    createdAt: toIsoString(inbound.created_at),
    createdBy: inbound.created_by
  }
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<string>}
 */
async function resolveDeliveryPatchAction (request) {
  const { weekId } = request.params
  const body = request.body ?? {}
  const hasModeAFields =
    body.farmerId != null &&
    body.productId != null &&
    (body.preorderQty != null || body.bufferQty != null)
  const hasModeB = body.deliveredQty != null

  if (hasModeAFields && hasModeB) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Request must be either farmer assignment (Mode A) or delivered quantity (Mode B), not both',
      {}
    )
  }
  if (!hasModeAFields && !hasModeB) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Request must include farmer assignment fields or deliveredQty',
      {}
    )
  }

  if (hasModeAFields) {
    return 'set_farmer_assignments'
  }

  const week = await MarketWeek.findOne({ week_id: weekId }).select('state').lean()
  if (!week) {
    throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
  }
  request.marketState = week.state
  return week.state === 'reconciliation'
    ? 'edit_delivered_qty'
    : 'record_delivered_qty'
}

/**
 * @param {string} weekId
 * @param {string} productId
 */
async function sumConfirmedOrderedQty (weekId, productId) {
  const orders = await CustomerOrder.find({
    week_id: weekId,
    status: 'confirmed',
    'line_items.product_id': productId
  }).lean()

  return orders.reduce((sum, order) => {
    const line = (order.line_items ?? []).find(li => li.product_id === productId)
    return line ? sum + line.ordered_qty : sum
  }, 0)
}

/**
 * @param {string} weekId
 * @returns {Promise<Map<string, number>>}
 */
async function buildFcfsRankByOrderId (weekId) {
  const orders = await CustomerOrder.find({
    week_id: weekId,
    status: { $in: ['confirmed', 'packed'] }
  }).lean()
  const sorted = sortByFcfs(orders)
  const rankByOrderId = new Map()
  sorted.forEach((order, index) => {
    rankByOrderId.set(order.order_id, index + 1)
  })
  return rankByOrderId
}

async function deliveryAndPackingRoutes (fastify) {
  fastify.get('/weeks/:weekId/delivery', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const { weekId } = request.params

    const [assignments, produceItems, orders, farmers, products] = await Promise.all([
      FarmerOrderAssignment.find({ week_id: weekId }).lean(),
      WeeklyProduceItem.find({ week_id: weekId }).lean(),
      CustomerOrder.find({
        week_id: weekId,
        status: 'confirmed'
      }).lean(),
      Farmer.find({ active: true }).select('farmer_id name').lean(),
      ProductCatalogue.find({ active: true }).select('product_id name_en name_ta').lean()
    ])

    const farmerNameById = new Map(farmers.map(f => [f.farmer_id, f.name]))
    const productById = new Map(products.map(p => [p.product_id, {
      nameEn: p.name_en,
      nameTa: p.name_ta || null
    }]))
    const produceByProductId = new Map(produceItems.map(p => [p.product_id, p]))

    const orderedByProduct = new Map()
    for (const order of orders) {
      for (const li of order.line_items ?? []) {
        orderedByProduct.set(
          li.product_id,
          (orderedByProduct.get(li.product_id) ?? 0) + li.ordered_qty
        )
      }
    }

    const deliveredByProduct = new Map()
    for (const asgn of assignments) {
      deliveredByProduct.set(
        asgn.product_id,
        (deliveredByProduct.get(asgn.product_id) ?? 0) + asgn.delivered_qty
      )
    }

    const assignmentRows = assignments.map(asgn => {
      const aggregatedOrderedQty = orderedByProduct.get(asgn.product_id) ?? 0
      const totalDelivered = deliveredByProduct.get(asgn.product_id) ?? 0
      const produce = produceByProductId.get(asgn.product_id)
      const product = productById.get(asgn.product_id)
      const nameEn = product?.nameEn ?? asgn.product_id
      return {
        assignmentId: asgn.assignment_id,
        farmerId: asgn.farmer_id,
        farmerName: farmerNameById.get(asgn.farmer_id) ?? asgn.farmer_id,
        productId: asgn.product_id,
        productName: nameEn,
        nameEn,
        nameTa: product?.nameTa ?? null,
        preorderQty: asgn.preorder_qty,
        bufferPct: asgn.buffer_pct,
        bufferQty: asgn.buffer_qty,
        outgoingQty: asgn.outgoing_qty,
        deliveredQty: asgn.delivered_qty,
        unit: produce?.unit ?? 'kg',
        aggregatedOrderedQty,
        shortfallFlag: totalDelivered < aggregatedOrderedQty
      }
    })

    const items = produceItems.map(produce => {
      const product = productById.get(produce.product_id)
      return {
        produceItemId: produce.produce_item_id,
        productId: produce.product_id,
        nameEn: product?.nameEn ?? produce.product_id,
        nameTa: product?.nameTa ?? null,
        unit: produce.unit ?? 'kg',
        totalOrderedQty: orderedByProduct.get(produce.product_id) ?? 0,
        totalDeliveredQty: deliveredByProduct.get(produce.product_id) ?? 0
      }
    })

    return { assignments: assignmentRows, items }
  })

  fastify.patch('/weeks/:weekId/delivery/:assignmentId', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'assignmentId'],
        properties: {
          weekId: { type: 'string' },
          assignmentId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          farmerId: { type: 'string', minLength: 1 },
          productId: { type: 'string', minLength: 1 },
          preorderQty: { type: 'number', minimum: 0 },
          bufferPct: { type: 'number', minimum: 0 },
          bufferQty: { type: 'number', minimum: 0 },
          assignedQty: { type: 'number', minimum: 0 },
          deliveredQty: { type: 'number', minimum: 0 },
          overrideVolunteer: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    const { weekId, assignmentId } = request.params
    const body = request.body
    const operatorId = request.user.uid
    const action = await resolveDeliveryPatchAction(request)
    const week = await MarketWeek.findOne({ week_id: weekId }).select('state').lean()
    if (!week) {
      const { MarketWeekNotFoundError } = require('../lib/errors')
      throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
    }
    enforceActionAllowed(action, week.state, { weekId })

    if (body.overrideVolunteer === true && request.user.role !== 'operator') {
      throw new AppError(
        'FORBIDDEN',
        403,
        'Only operators may set overrideVolunteer',
        {}
      )
    }

    if (action === 'set_farmer_assignments') {
      const {
        farmerId,
        productId,
        preorderQty,
        bufferQty,
        assignedQty
      } = body
      // bufferPct is deprecated — ignored when present (gradual frontend migration)

      if (
        farmerId == null ||
        productId == null ||
        preorderQty == null ||
        bufferQty == null
      ) {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          'farmerId, productId, preorderQty, and bufferQty are required for assignment mode',
          {}
        )
      }

      const farmer = await Farmer.findOne({ farmer_id: farmerId }).lean()
      if (!farmer) {
        throw new FarmerNotFoundError(`Farmer not found: ${farmerId}`, { farmerId })
      }

      const produce = await WeeklyProduceItem.findOne({
        week_id: weekId,
        product_id: productId
      }).lean()
      if (!produce) {
        throw new AppError(
          'PRODUCE_ITEM_NOT_FOUND',
          400,
          `Product not found in week produce list: ${productId}`,
          { weekId, productId }
        )
      }

      const unit = produce.unit ?? 'kg'
      const normalizedBufferQty = roundQtyForUnit(bufferQty, unit)
      const targetOutgoingQty = roundQtyForUnit(preorderQty + normalizedBufferQty, unit)
      const outgoingQty = assignedQty != null
        ? roundQtyForUnit(assignedQty, unit)
        : targetOutgoingQty

      let assignment = await FarmerOrderAssignment.findOne({
        week_id: weekId,
        assignment_id: assignmentId
      })

      const payload = {
        week_id: weekId,
        farmer_id: farmerId,
        product_id: productId,
        preorder_qty: preorderQty,
        buffer_pct: null,
        buffer_qty: normalizedBufferQty,
        outgoing_qty: outgoingQty,
        delivered_qty: assignment?.delivered_qty ?? 0,
        created_by: operatorId
      }

      if (assignment) {
        assignment.set(payload)
        await assignment.save()
      } else {
        const existingPair = await FarmerOrderAssignment.findOne({
          week_id: weekId,
          farmer_id: farmerId,
          product_id: productId
        })
        if (existingPair && existingPair.assignment_id !== assignmentId) {
          throw new AppError(
            'VALIDATION_ERROR',
            409,
            'Assignment already exists for this farmer and product in this week',
            {
              existingAssignmentId: existingPair.assignment_id,
              farmerId,
              productId
            }
          )
        }
        assignment = await FarmerOrderAssignment.create({
          assignment_id: assignmentId,
          ...payload
        })
      }

      const doc = assignment.toObject()
      return {
        ok: true,
        ...toAssignmentResponse(doc),
        farmerName: farmer.name,
        productName: (await ProductCatalogue.findOne({ product_id: productId })
          .select('name_en')
          .lean())?.name_en ?? productId
      }
    }

    const { deliveredQty } = body
    const assignment = await FarmerOrderAssignment.findOne({
      week_id: weekId,
      assignment_id: assignmentId
    })
    if (!assignment) {
      throw new AppError(
        'ASSIGNMENT_NOT_FOUND',
        404,
        `Farmer order assignment not found: ${assignmentId}`,
        { assignmentId, weekId }
      )
    }

    assignment.delivered_qty = deliveredQty
    await assignment.save()

    const productId = assignment.product_id
    const aggResult = await FarmerOrderAssignment.aggregate([
      { $match: { week_id: weekId, product_id: productId } },
      { $group: { _id: null, totalDelivered: { $sum: '$delivered_qty' } } }
    ])
    const totalDelivered = aggResult[0]?.totalDelivered ?? 0

    const totalOrdered = await sumConfirmedOrderedQty(weekId, productId)
    const result = await runFcfsAllocation(weekId, productId, totalDelivered, db)
    const fcfsTriggered = totalDelivered < totalOrdered
    const allocations = result.allocated.map(row => ({
      orderId: row.orderId,
      allocatedQty: row.allocatedQty,
      requestedQty: row.requestedQty,
      unit: row.unit
    }))

    return {
      ok: true,
      assignmentId,
      deliveredQty,
      fcfsTriggered,
      allocations
    }
  })

  fastify.get('/weeks/:weekId/packing', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const { weekId } = request.params

    const [orders, customers, products, produceItems] = await Promise.all([
      CustomerOrder.find({
        week_id: weekId,
        status: { $in: ['confirmed', 'packed'] }
      }).lean(),
      Customer.find({ active: true }).select('customer_id name').lean(),
      ProductCatalogue.find({ active: true }).select('product_id name_en name_ta').lean(),
      WeeklyProduceItem.find({ week_id: weekId }).lean()
    ])

    const customerNameById = new Map(customers.map(c => [c.customer_id, c.name]))
    const productById = new Map(products.map(p => [p.product_id, {
      nameEn: p.name_en,
      nameTa: p.name_ta || null
    }]))
    const fcfsRankByOrderId = await buildFcfsRankByOrderId(weekId)

    const byCustomer = new Map()

    for (const order of orders) {
      if (!byCustomer.has(order.customer_id)) {
        byCustomer.set(order.customer_id, {
          customerId: order.customer_id,
          customerName: customerNameById.get(order.customer_id) ?? order.customer_id,
          orders: []
        })
      }

      const lineItems = (order.line_items ?? []).map(li => {
        const product = productById.get(li.product_id)
        return {
          productId: li.product_id,
          nameEn: product?.nameEn ?? li.product_id,
          nameTa: product?.nameTa ?? null,
          orderedQty: li.ordered_qty,
          allocatedQty: li.delivered_qty,
          unit: li.unit,
          fcfsRank: fcfsRankByOrderId.get(order.order_id) ?? null
        }
      })

      byCustomer.get(order.customer_id).orders.push({
        orderId: order.order_id,
        status: order.status,
        lineItems
      })
    }

    return {
      customers: [...byCustomer.values()].sort((a, b) =>
        a.customerName.localeCompare(b.customerName)
      )
    }
  })

  fastify.patch('/weeks/:weekId/orders/:orderId/packed', {
    config: { action: 'pack_order' },
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
          packedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request) => {
    const { weekId, orderId } = request.params

    const order = await CustomerOrder.findOne({ order_id: orderId, week_id: weekId })
    if (!order) {
      throw new OrderNotFoundError(`Order not found: ${orderId}`, { orderId, weekId })
    }

    if (order.status !== 'confirmed') {
      throw new AppError(
        'INVALID_ORDER_STATUS_TRANSITION',
        409,
        'Order must be confirmed before it can be marked packed',
        { orderId, currentStatus: order.status }
      )
    }

    order.status = 'packed'
    await order.save()

    return { ok: true, orderId, status: 'packed' }
  })

  fastify.patch('/weeks/:weekId/orders/:orderId/dispatched', {
    config: { action: 'dispatch_order' },
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

    const order = await CustomerOrder.findOne({ order_id: orderId, week_id: weekId })
    if (!order) {
      throw new OrderNotFoundError(`Order not found: ${orderId}`, { orderId, weekId })
    }

    if (order.status !== 'packed') {
      throw new AppError(
        'INVALID_ORDER_STATUS_TRANSITION',
        409,
        'Order must be packed before it can be dispatched',
        { orderId, currentStatus: order.status }
      )
    }

    order.status = 'dispatched'
    await order.save()

    return { ok: true, orderId, status: 'dispatched' }
  })

  fastify.get('/weeks/:weekId/dispatch', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const { weekId } = request.params

    const [orders, customers, products] = await Promise.all([
      CustomerOrder.find({
        week_id: weekId,
        status: { $in: ['packed', 'dispatched'] }
      }).lean(),
      Customer.find({ active: true }).select('customer_id name').lean(),
      ProductCatalogue.find({ active: true }).select('product_id name_en name_ta').lean()
    ])

    const customerNameById = new Map(customers.map(c => [c.customer_id, c.name]))
    const productById = new Map(products.map(p => [p.product_id, {
      nameEn: p.name_en,
      nameTa: p.name_ta || null
    }]))

    return {
      orders: orders.map(order => ({
        orderId: order.order_id,
        customerId: order.customer_id,
        customerName: customerNameById.get(order.customer_id) ?? order.customer_id,
        status: order.status,
        balanceDue: order.balance_due,
        lineItems: (order.line_items ?? []).map(li => {
          const product = productById.get(li.product_id)
          return {
            productId: li.product_id,
            nameEn: product?.nameEn ?? li.product_id,
            nameTa: product?.nameTa ?? null,
            deliveredQty: li.delivered_qty,
            unit: li.unit
          }
        })
      }))
    }
  })

  fastify.get('/weeks/:weekId/walkin', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const sales = await WalkInSale.find({ week_id: request.params.weekId })
      .sort({ created_at: -1 })
      .lean()
    return { sales: sales.map(toWalkInSale) }
  })

  fastify.post('/weeks/:weekId/walkin', {
    config: { action: 'record_walkin_sale' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      },
      body: {
        type: 'object',
        required: ['qty', 'unit', 'pricePerUnit', 'channel', 'inventorySource'],
        additionalProperties: false,
        properties: {
          productId: { type: 'string', minLength: 1 },
          itemName: { type: 'string', minLength: 1 },
          qty: { type: 'number', minimum: 0 },
          unit: { type: 'string', enum: ORDER_UNITS },
          pricePerUnit: { type: 'integer', minimum: 1 },
          channel: { type: 'string', enum: WALKIN_CHANNELS },
          inventorySource: { type: 'string', enum: INVENTORY_SOURCES },
          farmerId: { type: 'string', minLength: 1 },
          customerPhone: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { weekId } = request.params
    const {
      productId,
      itemName,
      qty,
      unit,
      pricePerUnit,
      channel,
      inventorySource,
      farmerId,
      customerPhone
    } = request.body
    const operatorId = request.user.uid

    if (!productId && !itemName) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'itemName is required when productId is not provided',
        {}
      )
    }

    if (inventorySource === 'local_farmer') {
      if (!farmerId) {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          'farmerId is required when inventorySource is local_farmer',
          {}
        )
      }
      const farmer = await Farmer.findOne({ farmer_id: farmerId, farmer_type: 'local' }).lean()
      if (!farmer) {
        throw new FarmerNotFoundError(`Farmer not found: ${farmerId}`, { farmerId })
      }

      const inboundFilter = {
        week_id: weekId,
        farmer_id: farmerId
      }
      if (productId) {
        inboundFilter.product_id = productId
      } else {
        inboundFilter.item_name = itemName
      }

      const inbound = await LocalFarmerInbound.findOne(inboundFilter)
      if (!inbound) {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          'No matching local farmer inbound record for this sale',
          { farmerId, productId, itemName }
        )
      }

      const remaining = inbound.inbound_qty - inbound.sold_qty
      if (qty > remaining) {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          'Sale quantity exceeds remaining local farmer inventory',
          { inboundId: inbound.inbound_id, remaining, qty }
        )
      }

      inbound.sold_qty = inbound.sold_qty + qty
      await inbound.save()
    }

    let customerId = null
    let looseCustomerPhone = null
    if (customerPhone) {
      const customer = await Customer.findOne({ phone: customerPhone.trim() }).lean()
      if (customer) {
        customerId = customer.customer_id
      } else {
        looseCustomerPhone = customerPhone.trim()
      }
    }

    const amountCollected = Math.round(qty * pricePerUnit)
    if (!Number.isInteger(amountCollected) || amountCollected < 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'amountCollected must be a positive integer (paise)',
        { qty, pricePerUnit }
      )
    }

    const sale = await WalkInSale.create({
      sale_id: `sale-${randomUUID()}`,
      week_id: weekId,
      product_id: productId ?? null,
      inventory_source: inventorySource,
      farmer_id: farmerId ?? null,
      qty_sold: qty,
      amount_collected: amountCollected,
      channel,
      customer_id: customerId,
      loose_customer_phone: looseCustomerPhone,
      created_by: operatorId
    })

    return reply.code(201).send(toWalkInSale(sale.toObject()))
  })

  fastify.post('/weeks/:weekId/localfarmer-inbound', {
    config: { action: 'record_local_farmer_inbound' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: { weekId: { type: 'string' } }
      },
      body: {
        type: 'object',
        required: ['farmerId', 'inboundQty', 'unit', 'pricePerUnit'],
        additionalProperties: false,
        properties: {
          farmerId: { type: 'string', minLength: 1 },
          productId: { type: 'string', minLength: 1 },
          itemName: { type: 'string', minLength: 1 },
          inboundQty: { type: 'number', minimum: 0 },
          unit: { type: 'string', enum: ORDER_UNITS },
          pricePerUnit: { type: 'integer', minimum: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { weekId } = request.params
    const { farmerId, productId, itemName, inboundQty, unit, pricePerUnit } = request.body
    const operatorId = request.user.uid

    if (!productId && !itemName) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'itemName is required when productId is not provided',
        {}
      )
    }

    const farmer = await Farmer.findOne({ farmer_id: farmerId, farmer_type: 'local' }).lean()
    if (!farmer) {
      throw new FarmerNotFoundError(`Farmer not found: ${farmerId}`, { farmerId })
    }

    const inbound = await LocalFarmerInbound.create({
      inbound_id: `inb-${randomUUID()}`,
      week_id: weekId,
      farmer_id: farmerId,
      product_id: productId ?? null,
      item_name: productId ? null : itemName.trim(),
      inbound_qty: inboundQty,
      sold_qty: 0,
      unit,
      price_per_unit: pricePerUnit,
      created_by: operatorId
    })

    return reply.code(201).send(toLocalFarmerInbound(inbound.toObject()))
  })
}

module.exports = deliveryAndPackingRoutes
module.exports.resolveDeliveryPatchAction = resolveDeliveryPatchAction
