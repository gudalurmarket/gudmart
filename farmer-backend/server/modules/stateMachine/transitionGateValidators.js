'use strict'

/**
 * Transition gate validators — DB checks before market_weeks.state advances.
 * Returns { ok: true } or { ok: false, blockers: [{ type, id, label }] }.
 */

const WeeklyProduceItem = require('../../models/WeeklyProduceItem')
const CustomerOrder = require('../../models/CustomerOrder')
const Customer = require('../../models/Customer')
const FarmerPayment = require('../../models/FarmerPayment')
const FarmerOrderAssignment = require('../../models/FarmerOrderAssignment')
const Farmer = require('../../models/Farmer')
const LocalFarmerInbound = require('../../models/LocalFarmerInbound')
const ProductCatalogue = require('../../models/ProductCatalogue')

/** @param {number} paise */
function formatPaiseForLabel (paise) {
  return `₹${(paise / 100).toFixed(2)}`
}

/**
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
function hasGateValidator (fromState, toState) {
  const edge = `${fromState}→${toState}`
  return edge === 'setup→open' ||
    edge === 'open→locked' ||
    edge === 'reconciliation→closed'
}

/**
 * @param {string} weekId
 * @returns {Promise<{ ok: true } | { ok: false, blockers: object[] }>}
 */
async function validateSetupToOpen (weekId) {
  const count = await WeeklyProduceItem.countDocuments({ week_id: weekId })
  if (count >= 1) {
    return { ok: true }
  }
  return {
    ok: false,
    blockers: [{
      type: 'NO_PRODUCE_ITEMS',
      id: weekId,
      label: 'Add at least one produce list item before publishing the week'
    }]
  }
}

/**
 * @param {string} weekId
 * @returns {Promise<{ ok: true } | { ok: false, blockers: object[] }>}
 */
async function validateOpenToLocked (weekId) {
  const pending = await CustomerOrder.find({
    week_id: weekId,
    status: 'pending_payment'
  })
    .select('order_id customer_id order_value')
    .lean()

  if (pending.length === 0) {
    return { ok: true }
  }

  const customerIds = [...new Set(pending.map(o => o.customer_id))]
  const customers = await Customer.find({ customer_id: { $in: customerIds } })
    .select('customer_id name')
    .lean()
  const nameById = new Map(customers.map(c => [c.customer_id, c.name]))

  return {
    ok: false,
    blockers: pending.map(order => ({
      type: 'PENDING_PAYMENT_ORDER',
      id: order.order_id,
      label: `${nameById.get(order.customer_id) ?? 'Customer'} — ${formatPaiseForLabel(order.order_value)} — pending payment`
    }))
  }
}

/**
 * @param {string} weekId
 * @returns {Promise<{ ok: true } | { ok: false, blockers: object[] }>}
 */
async function validateReconciliationToClosed (weekId) {
  const blockers = []

  const orders = await CustomerOrder.find({
    week_id: weekId,
    status: { $ne: 'cancelled' }
  })
    .select('order_id customer_id line_items')
    .lean()

  const customerIds = [...new Set(orders.map(o => o.customer_id))]
  const customers = await Customer.find({ customer_id: { $in: customerIds } })
    .select('customer_id name')
    .lean()
  const customerNameById = new Map(customers.map(c => [c.customer_id, c.name]))

  const productIds = new Set()
  for (const order of orders) {
    for (const li of order.line_items ?? []) {
      if (li.product_id) productIds.add(li.product_id)
    }
  }
  const products = await ProductCatalogue.find({
    product_id: { $in: [...productIds] }
  })
    .select('product_id name')
    .lean()
  const productNameById = new Map(products.map(p => [p.product_id, p.name]))

  for (const order of orders) {
    for (const li of order.line_items ?? []) {
      if (li.delivered_qty === li.ordered_qty) continue
      if (li.difference_confirmed === true) continue
      const diffId = `${order.order_id}:${li.line_item_id}`
      const productLabel = productNameById.get(li.product_id) ?? li.product_id
      const customerLabel = customerNameById.get(order.customer_id) ?? 'Customer'
      blockers.push({
        type: 'UNCONFIRMED_PRICE_DIFF',
        id: diffId,
        label: `${productLabel} — ${customerLabel} — difference not confirmed`
      })
    }
  }

  const deliveringFarmerIds = await FarmerOrderAssignment.distinct('farmer_id', {
    week_id: weekId,
    delivered_qty: { $gt: 0 }
  })

  if (deliveringFarmerIds.length > 0) {
    const paymentRows = await FarmerPayment.find({
      week_id: weekId,
      farmer_id: { $in: deliveringFarmerIds }
    })
      .select('farmer_id status')
      .lean()
    const paymentByFarmer = new Map(paymentRows.map(p => [p.farmer_id, p]))

    const farmers = await Farmer.find({ farmer_id: { $in: deliveringFarmerIds } })
      .select('farmer_id name')
      .lean()
    const farmerNameById = new Map(farmers.map(f => [f.farmer_id, f.name]))

    for (const farmerId of deliveringFarmerIds) {
      const payment = paymentByFarmer.get(farmerId)
      if (!payment) {
        blockers.push({
          type: 'OUTSTATION_PAYMENT_INCOMPLETE',
          id: farmerId,
          label: `${farmerNameById.get(farmerId) ?? 'Farmer'} — payment status not set`
        })
      }
    }
  }

  const localFarmers = await Farmer.find({ farmer_type: 'local', active: true })
    .select('farmer_id name')
    .lean()
  const localFarmerIdSet = new Set(localFarmers.map(f => f.farmer_id))
  const localFarmerNameById = new Map(localFarmers.map(f => [f.farmer_id, f.name]))

  const assignmentFarmerIds = await FarmerOrderAssignment.distinct('farmer_id', {
    week_id: weekId
  })
  const assignedLocalFarmers = assignmentFarmerIds.filter(id => localFarmerIdSet.has(id))

  const inboundRows = await LocalFarmerInbound.find({ week_id: weekId })
    .select('farmer_id payment_amount_cash payment_amount_bank')
    .lean()
  const inboundLocalFarmers = inboundRows.map(row => row.farmer_id)
  const allLocalFarmerIds = [...new Set([...assignedLocalFarmers, ...inboundLocalFarmers])]

  if (allLocalFarmerIds.length > 0) {
    const paidFarmerIds = new Set(
      inboundRows
        .filter(row => (row.payment_amount_cash ?? 0) + (row.payment_amount_bank ?? 0) > 0)
        .map(row => row.farmer_id)
    )

    for (const farmerId of allLocalFarmerIds) {
      if (!paidFarmerIds.has(farmerId)) {
        blockers.push({
          type: 'LOCAL_FARMER_PAYMENT_INCOMPLETE',
          id: farmerId,
          label: `${localFarmerNameById.get(farmerId) ?? 'Local farmer'} — payment not recorded`
        })
      }
    }
  }

  if (blockers.length === 0) {
    return { ok: true }
  }
  return { ok: false, blockers }
}

/**
 * @param {string} fromState
 * @param {string} toState
 * @param {string} weekId
 * @returns {Promise<{ ok: true } | { ok: false, blockers: object[] }>}
 */
async function validateTransitionGate (fromState, toState, weekId) {
  const edge = `${fromState}→${toState}`
  switch (edge) {
    case 'setup→open':
      return validateSetupToOpen(weekId)
    case 'open→locked':
      return validateOpenToLocked(weekId)
    case 'reconciliation→closed':
      return validateReconciliationToClosed(weekId)
    default:
      return { ok: true }
  }
}

module.exports = {
  hasGateValidator,
  validateTransitionGate,
  validateSetupToOpen,
  validateOpenToLocked,
  validateReconciliationToClosed
}
