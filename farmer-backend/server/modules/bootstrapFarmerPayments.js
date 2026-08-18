'use strict'

const { randomUUID } = require('node:crypto')
const FarmerOrderAssignment = require('../models/FarmerOrderAssignment')
const FarmerPayment = require('../models/FarmerPayment')
const WeeklyProduceItem = require('../models/WeeklyProduceItem')

/**
 * @param {string} farmerId
 * @param {object[]} assignments
 * @param {Map<string, number>} priceByProduct
 * @returns {number}
 */
function computePreorderComponent (farmerId, assignments, priceByProduct) {
  return assignments.reduce((sum, asgn) => {
    if (String(asgn.farmer_id) !== String(farmerId)) return sum
    const price = priceByProduct.get(asgn.product_id) ?? 0
    return sum + Math.round(asgn.delivered_qty * price)
  }, 0)
}

/**
 * @param {string} farmerId
 * @param {object[]} inboundRows
 * @returns {number}
 */
function computeSurplusComponent (farmerId, inboundRows) {
  return inboundRows.reduce((sum, row) => {
    if (String(row.farmer_id) !== String(farmerId)) return sum
    return sum + Math.round(row.sold_qty * row.price_per_unit)
  }, 0)
}

/**
 * Create unpaid FarmerPayment rows for outstation farmers with deliveries but no
 * payment record. Local farmer payments are tracked on LocalFarmerInbound directly
 * (payment_amount_cash / payment_amount_bank), not via FarmerPayment.
 * Idempotent — safe to call multiple times (e.g. on reconciliation entry or Tab B load).
 *
 * @param {string} weekId
 * @param {string} operatorUid
 */
async function bootstrapFarmerPayments (weekId, operatorUid) {
  const [assignments, existing] = await Promise.all([
    FarmerOrderAssignment.find({ week_id: weekId, delivered_qty: { $gt: 0 } }).lean(),
    FarmerPayment.find({ week_id: weekId }).select('farmer_id').lean()
  ])

  const existingFarmerIds = new Set(existing.map(p => String(p.farmer_id)))
  const farmerIdsNeedingPayment = new Set(assignments.map(asgn => String(asgn.farmer_id)))

  const newFarmerIds = [...farmerIdsNeedingPayment].filter(id => !existingFarmerIds.has(id))
  if (newFarmerIds.length === 0) return

  const productIds = [...new Set(assignments.map(a => a.product_id))]
  const produceItems = productIds.length > 0
    ? await WeeklyProduceItem.find({
      week_id: weekId,
      product_id: { $in: productIds }
    })
      .select('product_id price_per_unit')
      .lean()
    : []
  const priceByProduct = new Map(produceItems.map(p => [p.product_id, p.price_per_unit]))

  await FarmerPayment.insertMany(
    newFarmerIds.map(farmerId => {
      const amountDue = computePreorderComponent(farmerId, assignments, priceByProduct)
      return {
        payment_id: `fp-${randomUUID()}`,
        week_id: weekId,
        farmer_id: farmerId,
        amount_due: amountDue,
        status: 'unpaid',
        amount_paid: 0,
        outstanding: amountDue,
        created_by: operatorUid,
        created_at: new Date()
      }
    }),
    { ordered: false }
  )
}

module.exports = {
  bootstrapFarmerPayments,
  computePreorderComponent,
  computeSurplusComponent
}
