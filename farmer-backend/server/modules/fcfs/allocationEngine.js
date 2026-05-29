'use strict'

const CustomerOrder = require('../../models/CustomerOrder')
const WeeklyProduceItem = require('../../models/WeeklyProduceItem')
const { runFcfsAllocation } = require('../fcfsEngine')

/**
 * Legacy entry point used by delivery routes (produceItemId + availableQty).
 * Delegates to runFcfsAllocation and maps field names for callers.
 */
async function allocate ({ weekId, produceItemId, availableQty }) {
  const produceItem = await WeeklyProduceItem.findOne({
    week_id: weekId,
    produce_item_id: produceItemId
  }).lean()

  if (!produceItem) {
    const { AppError } = require('../../lib/errors')
    throw new AppError(
      'PRODUCE_ITEM_NOT_FOUND',
      400,
      `Product not found in week produce list: ${produceItemId}`,
      { weekId, produceItemId }
    )
  }

  const { allocated, shortfall } = await runFcfsAllocation(
    weekId,
    produceItem.product_id,
    availableQty,
    { CustomerOrder, WeeklyProduceItem }
  )

  return {
    shortfall,
    allocations: allocated.map((row) => ({
      order_id: row.orderId,
      item_id: produceItemId,
      allocated_qty: row.allocatedQty,
      requested_qty: row.requestedQty,
      unit: row.unit
    }))
  }
}

module.exports = { allocate }
