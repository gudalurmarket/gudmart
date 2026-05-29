const CustomerOrder = require('../../models/CustomerOrder')
const LocalFarmerInbound = require('../../models/LocalFarmerInbound')
const OrderAllocation = require('../../models/OrderAllocation')
const ProductCatalogue = require('../../models/ProductCatalogue')

function availableQty (inbound) {
  return Math.max(0, inbound.inbound_qty - inbound.sold_qty)
}

/**
 * Shared pool refs so the same inbound row is not double-counted when keyed by name and product_id.
 */
function buildInventoryMaps (inboundRows) {
  const byName = new Map()
  const byProductId = new Map()

  for (const row of inboundRows) {
    const qty = availableQty(row)
    if (qty <= 0) continue

    const nameKey = row.item_name ? row.item_name.trim().toLowerCase() : null
    const productId = row.product_id || null

    let pool = null
    if (nameKey && byName.has(nameKey)) {
      pool = byName.get(nameKey)
    } else if (productId && byProductId.has(productId)) {
      pool = byProductId.get(productId)
    }

    if (!pool) {
      pool = { available: 0 }
    }

    pool.available += qty

    if (nameKey) byName.set(nameKey, pool)
    if (productId) byProductId.set(productId, pool)
  }

  return { byName, byProductId }
}

function findInventoryPool (productId, itemName, inventory) {
  if (productId && inventory.byProductId.has(productId)) {
    return inventory.byProductId.get(productId)
  }

  const nameKey = itemName ? itemName.trim().toLowerCase() : ''
  if (nameKey && inventory.byName.has(nameKey)) {
    return inventory.byName.get(nameKey)
  }

  return null
}

function normalizeOrderLineItems (order) {
  if (Array.isArray(order.line_items) && order.line_items.length > 0) {
    return order.line_items.map((line) => ({
      product_id: line.product_id || null,
      requested_qty: line.ordered_qty,
      unit: line.unit
    }))
  }

  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((item) => ({
      product_id: item.product_id || null,
      requested_qty: item.quantity ?? item.ordered_qty ?? 0,
      unit: item.unit
    }))
  }

  return []
}

async function loadProductNames (productIds) {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const products = await ProductCatalogue.find(
    { product_id: { $in: ids } },
    { product_id: 1, name_en: 1 }
  ).lean()

  return new Map(products.map((p) => [p.product_id, p.name_en]))
}

function resolveItemName (productId, productNames) {
  if (productId && productNames.has(productId)) {
    return productNames.get(productId)
  }
  if (productId) return productId
  return 'unknown'
}

function allocateOrder (order, inventory, productNames) {
  const lines = normalizeOrderLineItems(order)
  const allocations = []

  for (const line of lines) {
    const itemName = resolveItemName(line.product_id, productNames)
    const pool = findInventoryPool(line.product_id, itemName, inventory)
    let allocatedQty = 0

    if (pool && pool.available > 0) {
      allocatedQty = Math.min(line.requested_qty, pool.available)
      pool.available -= allocatedQty
    }

    allocations.push({
      item_name: item.item_name,
      requested_qty: line.requested_qty,
      allocated_qty: allocatedQty,
      unit: line.unit
    })
  }

  return {
    order_id: order.order_id,
    allocations
  }
}

async function runAllocationForWeek (weekId) {
  const [orders, inboundRows] = await Promise.all([
    CustomerOrder.find({ week_id: weekId })
      .sort({ created_at: 1 })
      .lean(),
    LocalFarmerInbound.find({ week_id: weekId }).lean()
  ])

  const inventory = buildInventoryMaps(inboundRows)

  const productIds = [
    ...inboundRows.map((r) => r.product_id),
    ...orders.flatMap((o) => normalizeOrderLineItems(o).map((l) => l.product_id))
  ]
  const productNames = await loadProductNames(productIds)

  const results = orders.map((order) => allocateOrder(order, inventory, productNames))

  await OrderAllocation.deleteMany({ week_id: weekId })

  if (results.length > 0) {
    await OrderAllocation.insertMany(
      results.map((result) => ({
        week_id: weekId,
        order_id: result.order_id,
        allocations: result.allocations
      }))
    )
  }

  return results
}

module.exports = {
  runAllocationForWeek
}
