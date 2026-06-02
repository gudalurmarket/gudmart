'use strict'

const { randomUUID } = require('node:crypto')
const FarmerOrderAssignment = require('../models/FarmerOrderAssignment')
const FarmerPayment = require('../models/FarmerPayment')
const WeeklyProduceItem = require('../models/WeeklyProduceItem')

/**
 * Create unpaid FarmerPayment rows for farmers with deliveries but no payment record.
 * Idempotent — safe to call multiple times (e.g. on reconciliation entry or Tab B load).
 *
 * @param {string} weekId
 * @param {string} operatorUid
 */
async function bootstrapFarmerPayments (weekId, operatorUid) {
  const assignments = await FarmerOrderAssignment.find({
    week_id: weekId,
    delivered_qty: { $gt: 0 }
  }).lean()

  if (assignments.length === 0) return

  const existing = await FarmerPayment.find({ week_id: weekId })
    .select('farmer_id')
    .lean()
  const existingFarmerIds = new Set(existing.map(p => String(p.farmer_id)))

  const farmerIds = [...new Set(
    assignments
      .map(a => String(a.farmer_id))
      .filter(id => !existingFarmerIds.has(id))
  )]

  if (farmerIds.length === 0) return

  const productIds = [...new Set(assignments.map(a => a.product_id))]
  const produceItems = await WeeklyProduceItem.find({
    week_id: weekId,
    product_id: { $in: productIds }
  })
    .select('product_id price_per_unit')
    .lean()
  const priceByProduct = new Map(produceItems.map(p => [p.product_id, p.price_per_unit]))

  const amountByFarmer = new Map()
  for (const asgn of assignments) {
    const farmerId = String(asgn.farmer_id)
    if (!farmerIds.includes(farmerId)) continue
    const price = priceByProduct.get(asgn.product_id) ?? 0
    const amount = Math.round(asgn.delivered_qty * price)
    amountByFarmer.set(farmerId, (amountByFarmer.get(farmerId) ?? 0) + amount)
  }

  await FarmerPayment.insertMany(
    farmerIds.map(farmerId => {
      const amountDue = amountByFarmer.get(farmerId) ?? 0
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

module.exports = { bootstrapFarmerPayments }
