'use strict'

const { AppError } = require('../lib/errors')

const COUNT_UNITS = new Set(['piece', 'bunch'])

function fcfsTimestampMillis (value) {
  if (value == null) return Number.POSITIVE_INFINITY

  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY
    return value < 1e12 ? value * 1000 : value
  }

  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY
  }

  return Number.POSITIVE_INFINITY
}

function compareMongoId (a, b) {
  const aId = String(a ?? '')
  const bId = String(b ?? '')
  if (aId < bId) return -1
  if (aId > bId) return 1
  return 0
}

/**
 * Sort by fcfs_timestamp ASC; tie-break by MongoDB _id ASC.
 *
 * @template T
 * @param {T[]} orders
 * @returns {T[]}
 */
function sortByFcfs (orders) {
  if (!Array.isArray(orders)) {
    throw new TypeError('sortByFcfs expects an array')
  }
  return [...orders].sort((a, b) => {
    const aMs = fcfsTimestampMillis(a.fcfs_timestamp)
    const bMs = fcfsTimestampMillis(b.fcfs_timestamp)
    if (aMs !== bMs) return aMs - bMs
    return compareMongoId(a._id, b._id)
  })
}

/**
 * @param {'kg'|'piece'|'bunch'|'100g'} unit
 * @param {number} qty
 * @returns {number}
 */
function roundQty (qty, unit) {
  if (!Number.isFinite(qty)) return 0
  if (COUNT_UNITS.has(unit)) return Math.floor(qty)
  return Math.round(qty * 100) / 100
}

function normalizeRemaining (remaining, unit) {
  return roundQty(remaining, unit)
}

function findLineForProduct (order, productId) {
  if (!order?.line_items || !Array.isArray(order.line_items)) return null
  return order.line_items.find((line) => line.product_id === productId) ?? null
}

function sumOrderedQty (orders, productId) {
  return orders.reduce((sum, order) => {
    const line = findLineForProduct(order, productId)
    return line ? sum + line.ordered_qty : sum
  }, 0)
}

/**
 * Walk FCFS-sorted orders and allocate deliveredQty until exhausted.
 *
 * @param {object[]} sortedOrders
 * @param {number} deliveredQty
 * @param {string} unit
 * @param {string} productId
 * @returns {Array<{ customerId: string, orderId: string, allocatedQty: number, requestedQty: number, unit: string }>}
 */
function allocate (sortedOrders, deliveredQty, unit, productId) {
  let remaining = normalizeRemaining(deliveredQty, unit)
  const results = []

  for (const order of sortedOrders) {
    const line = findLineForProduct(order, productId)
    if (!line) continue

    remaining = normalizeRemaining(remaining, unit)

    let allocatedQty = 0
    if (remaining > 0) {
      const raw = Math.min(line.ordered_qty, remaining)
      allocatedQty = roundQty(raw, unit)
      if (allocatedQty > remaining) {
        allocatedQty = roundQty(remaining, unit)
      }
      remaining = normalizeRemaining(Math.max(0, remaining - allocatedQty), unit)
    }

    results.push({
      customerId: order.customer_id,
      orderId: order.order_id,
      allocatedQty,
      requestedQty: line.ordered_qty,
      unit
    })
  }

  return results
}

function allocateFullOrdered (sortedOrders, unit, productId) {
  return sortedOrders.map((order) => {
    const line = findLineForProduct(order, productId)
    return {
      customerId: order.customer_id,
      orderId: order.order_id,
      allocatedQty: roundQty(line.ordered_qty, unit),
      requestedQty: line.ordered_qty,
      unit
    }
  }).filter((row) => row.requestedQty != null)
}

async function resolveProduceUnit (weekId, productId, db) {
  const item = await db.WeeklyProduceItem.findOne({
    week_id: weekId,
    product_id: productId
  }).lean()

  if (!item) {
    throw new AppError(
      'PRODUCE_ITEM_NOT_FOUND',
      400,
      `Product not found in week produce list: ${productId}`,
      { weekId, productId }
    )
  }

  return item.unit
}

async function fetchConfirmedOrdersForProduct (weekId, productId, db) {
  const orders = await db.CustomerOrder.find({
    week_id: weekId,
    status: 'confirmed',
    'line_items.product_id': productId
  }).lean()

  return orders.filter((order) => findLineForProduct(order, productId) != null)
}

async function writeDeliveredQty (allocations, productId, db) {
  await Promise.all(
    allocations.map(({ orderId, allocatedQty }) =>
      db.CustomerOrder.updateOne(
        { order_id: orderId, 'line_items.product_id': productId },
        { $set: { 'line_items.$.delivered_qty': allocatedQty } }
      )
    )
  )
}

/**
 * FCFS shortfall allocation for a product in a market week.
 *
 * @param {string} weekId
 * @param {string} productId
 * @param {number} deliveredQty — aggregate delivered_qty across all farmer_order_assignments
 *   for (weekId, productId); callers must sum before invoking, not pass a single assignment qty
 * @param {{ CustomerOrder: import('mongoose').Model, WeeklyProduceItem: import('mongoose').Model }} db
 * @returns {Promise<{ allocated: Array<{ customerId: string, orderId: string, allocatedQty: number, requestedQty: number, unit: string }>, shortfall: boolean }>}
 */
async function runFcfsAllocation (weekId, productId, deliveredQty, db) {
  if (!db?.CustomerOrder || !db?.WeeklyProduceItem) {
    throw new TypeError('runFcfsAllocation requires db.CustomerOrder and db.WeeklyProduceItem')
  }

  if (typeof deliveredQty !== 'number' || !Number.isFinite(deliveredQty) || deliveredQty < 0) {
    const err = new Error('deliveredQty must be a finite non-negative number')
    err.code = 'INVALID_DELIVERED_QTY'
    err.httpStatus = 400
    throw err
  }

  const unit = await resolveProduceUnit(weekId, productId, db)
  const orders = await fetchConfirmedOrdersForProduct(weekId, productId, db)
  const sortedOrders = sortByFcfs(orders)

  const totalOrdered = sumOrderedQty(sortedOrders, productId)
  const shortfall = deliveredQty < totalOrdered
  const normalizedDelivered = normalizeRemaining(deliveredQty, unit)

  const allocated = shortfall
    ? allocate(sortedOrders, normalizedDelivered, unit, productId)
    : allocateFullOrdered(sortedOrders, unit, productId)

  await writeDeliveredQty(allocated, productId, db)

  return { allocated, shortfall }
}

module.exports = {
  runFcfsAllocation,
  sortByFcfs,
  allocate,
  roundQty,
  COUNT_UNITS
}
