'use strict'

const { randomUUID } = require('node:crypto')
const { MarketWeekNotFoundError } = require('../../lib/errors')

const MONETARY_FIELDS = [
  'opening_balance_cash',
  'opening_balance_bank',
  'preorder_receipts_cash',
  'preorder_receipts_bank',
  'market_day_receipts_cash',
  'market_day_receipts_bank',
  'walkin_receipts_cash',
  'walkin_receipts_bank',
  'wallet_adjustments_credits',
  'wallet_adjustments_debits',
  'outstation_farmer_paid_cash',
  'outstation_farmer_paid_bank',
  'local_farmer_paid_cash',
  'local_farmer_paid_bank',
  'outstanding_farmer_liabilities',
  'outstanding_customer_dues',
  'closing_balance_cash',
  'closing_balance_bank'
]

const DUPLICATE_SUMMARY_ERROR = 'weekly summary already exists for weekId'

/**
 * @param {Array<{ _id: string|null, total: number }>} rows
 * @returns {{ cash: number, bank: number }}
 */
function channelTotalsFromAggregate (rows) {
  let cash = 0
  let bank = 0
  for (const row of rows) {
    const total = row.total ?? 0
    if (row._id === 'cash') cash += total
    else if (row._id === 'upi') bank += total
  }
  return { cash, bank }
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} collectionName
 * @param {object[]} pipeline
 * @param {import('mongodb').ClientSession} session
 * @returns {Promise<Array<{ _id: string|null, total: number }>>}
 */
async function runAggregate (db, collectionName, pipeline, session) {
  return db.collection(collectionName).aggregate(pipeline, { session }).toArray()
}

/**
 * @param {object} doc
 */
function assertIntegerPaiseFields (doc) {
  for (const field of MONETARY_FIELDS) {
    const value = doc[field]
    if (!Number.isInteger(value)) {
      throw new Error(`non-integer paise value in summary field: ${field}`)
    }
  }
}

/**
 * @param {string} weekId
 * @param {import('mongodb').Db} db
 * @param {import('mongodb').ClientSession} session
 * @param {string} operatorUid
 * @returns {Promise<object>}
 */
async function generateWeeklySummary (weekId, db, session, operatorUid) {
  const existing = await db.collection('weekly_summaries').findOne(
    { week_id: weekId },
    { session }
  )
  if (existing) {
    throw new Error(DUPLICATE_SUMMARY_ERROR)
  }

  const week = await db.collection('market_weeks').findOne(
    { week_id: weekId },
    { session }
  )
  if (!week) {
    throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
  }

  const matchWeek = { $match: { week_id: weekId } }

  const topUpRows = await runAggregate(db, 'wallet_transactions', [
    matchWeek,
    { $match: { type: 'top_up' } },
    { $group: { _id: '$channel', total: { $sum: '$amount' } } }
  ], session)
  const preorder = channelTotalsFromAggregate(topUpRows)

  const balancePaymentRows = await runAggregate(db, 'wallet_transactions', [
    matchWeek,
    { $match: { type: 'balance_payment' } },
    { $group: { _id: '$channel', total: { $sum: '$amount' } } }
  ], session)
  const marketDay = channelTotalsFromAggregate(balancePaymentRows)

  const creditRows = await runAggregate(db, 'wallet_transactions', [
    matchWeek,
    { $match: { type: 'price_diff_credit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ], session)
  const debitRows = await runAggregate(db, 'wallet_transactions', [
    matchWeek,
    { $match: { type: 'price_diff_debit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ], session)
  const walletAdjustmentsCredits = creditRows[0]?.total ?? 0
  const walletAdjustmentsDebits = debitRows[0]?.total ?? 0

  const walkinRows = await runAggregate(db, 'walkin_sales', [
    matchWeek,
    { $group: { _id: '$channel', total: { $sum: '$amount_collected' } } }
  ], session)
  const walkin = channelTotalsFromAggregate(walkinRows)

  const farmerPaidRows = await runAggregate(db, 'farmer_payments', [
    matchWeek,
    { $match: { status: { $in: ['partial', 'paid'] } } },
    { $group: { _id: '$channel', total: { $sum: '$amount_paid' } } }
  ], session)
  const outstationPaid = channelTotalsFromAggregate(farmerPaidRows)

  const liabilityRows = await runAggregate(db, 'farmer_payments', [
    matchWeek,
    { $match: { status: { $in: ['unpaid', 'partial'] } } },
    { $group: { _id: null, total: { $sum: '$outstanding' } } }
  ], session)
  const outstandingFarmerLiabilities = liabilityRows[0]?.total ?? 0

  const localInboundRows = await db.collection('local_farmer_inbound')
    .find({ week_id: weekId }, { session })
    .project({ amount_paid: 1, payment_channel: 1, payment_amount_cash: 1, payment_amount_bank: 1 })
    .toArray()

  let localFarmerPaidCash = 0
  let localFarmerPaidBank = 0
  for (const row of localInboundRows) {
    if (
      row.payment_amount_cash != null ||
      row.payment_amount_bank != null
    ) {
      localFarmerPaidCash += row.payment_amount_cash ?? 0
      localFarmerPaidBank += row.payment_amount_bank ?? 0
      continue
    }
    const paid = row.amount_paid ?? 0
    if (row.payment_channel === 'cash') localFarmerPaidCash += paid
    if (row.payment_channel === 'upi') localFarmerPaidBank += paid
  }

  const dueRows = await runAggregate(db, 'wallet_transactions', [
    matchWeek,
    { $match: { type: 'customer_due' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ], session)
  const outstandingCustomerDues = dueRows[0]?.total ?? 0

  const openingBalanceCash = week.opening_balance_cash ?? 0
  const openingBalanceBank = week.opening_balance_bank ?? 0

  const closingBalanceCash =
    openingBalanceCash +
    preorder.cash +
    marketDay.cash +
    walkin.cash -
    outstationPaid.cash -
    localFarmerPaidCash

  const closingBalanceBank =
    openingBalanceBank +
    preorder.bank +
    marketDay.bank +
    walkin.bank -
    outstationPaid.bank -
    localFarmerPaidBank

  const generatedAt = new Date()
  const summaryDoc = {
    summary_id: randomUUID(),
    week_id: weekId,
    opening_balance_cash: openingBalanceCash,
    opening_balance_bank: openingBalanceBank,
    preorder_receipts_cash: preorder.cash,
    preorder_receipts_bank: preorder.bank,
    market_day_receipts_cash: marketDay.cash,
    market_day_receipts_bank: marketDay.bank,
    walkin_receipts_cash: walkin.cash,
    walkin_receipts_bank: walkin.bank,
    wallet_adjustments_credits: walletAdjustmentsCredits,
    wallet_adjustments_debits: walletAdjustmentsDebits,
    outstation_farmer_paid_cash: outstationPaid.cash,
    outstation_farmer_paid_bank: outstationPaid.bank,
    local_farmer_paid_cash: localFarmerPaidCash,
    local_farmer_paid_bank: localFarmerPaidBank,
    outstanding_farmer_liabilities: outstandingFarmerLiabilities,
    outstanding_customer_dues: outstandingCustomerDues,
    closing_balance_cash: closingBalanceCash,
    closing_balance_bank: closingBalanceBank,
    generated_at: generatedAt,
    created_at: generatedAt,
    created_by: operatorUid
  }

  assertIntegerPaiseFields(summaryDoc)

  try {
    await db.collection('weekly_summaries').insertOne(summaryDoc, { session })
  } catch (err) {
    if (err && err.code === 11000) {
      throw new Error(DUPLICATE_SUMMARY_ERROR)
    }
    throw err
  }

  return summaryDoc
}

module.exports = {
  generateWeeklySummary
}
