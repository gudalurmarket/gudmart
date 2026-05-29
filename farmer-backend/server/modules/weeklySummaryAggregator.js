'use strict'

const MarketWeek = require('../models/MarketWeek')
const WeeklySummary = require('../models/WeeklySummary')
const WalletTransaction = require('../models/WalletTransaction')
const WalkInSale = require('../models/WalkInSale')
const FarmerPayment = require('../models/FarmerPayment')
const LocalFarmerInbound = require('../models/LocalFarmerInbound')
const { MarketWeekNotFoundError } = require('../lib/errors')

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
 * @param {import('mongoose').Model} Model
 * @param {object[]} pipeline
 * @param {import('mongoose').ClientSession} [session]
 */
async function aggregateOnModel (Model, pipeline, session) {
  let agg = Model.aggregate(pipeline)
  if (session) {
    agg = agg.session(session)
  }
  return agg
}

/**
 * @param {{
 *   weekId: string,
 *   operatorId: string,
 *   session?: import('mongoose').ClientSession
 * }} params
 * @returns {Promise<object>}
 */
async function aggregateWeeklySummary ({ weekId, operatorId, session }) {
  let weekQuery = MarketWeek.findOne({ week_id: weekId })
  if (session) weekQuery = weekQuery.session(session)
  const week = await weekQuery.lean()
  if (!week) {
    throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
  }

  const matchWeek = { $match: { week_id: weekId } }

  const topUpRows = await aggregateOnModel(WalletTransaction, [
    matchWeek,
    { $match: { type: 'top_up' } },
    { $group: { _id: '$channel', total: { $sum: '$amount' } } }
  ], session)
  const preorder = channelTotalsFromAggregate(topUpRows)

  const balancePaymentRows = await aggregateOnModel(WalletTransaction, [
    matchWeek,
    { $match: { type: 'balance_payment' } },
    { $group: { _id: '$channel', total: { $sum: '$amount' } } }
  ], session)
  const marketDay = channelTotalsFromAggregate(balancePaymentRows)

  const creditRows = await aggregateOnModel(WalletTransaction, [
    matchWeek,
    { $match: { type: 'price_diff_credit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ], session)
  const debitRows = await aggregateOnModel(WalletTransaction, [
    matchWeek,
    { $match: { type: 'price_diff_debit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ], session)
  const walletAdjustmentsCredits = creditRows[0]?.total ?? 0
  const walletAdjustmentsDebits = debitRows[0]?.total ?? 0

  const walkinRows = await aggregateOnModel(WalkInSale, [
    matchWeek,
    { $group: { _id: '$channel', total: { $sum: '$amount_collected' } } }
  ], session)
  const walkin = channelTotalsFromAggregate(walkinRows)

  let farmerPaymentQuery = FarmerPayment.find({ week_id: weekId })
    .select('status amount_paid outstanding channel')
  if (session) farmerPaymentQuery = farmerPaymentQuery.session(session)
  const farmerPaymentRows = await farmerPaymentQuery.lean()

  let outstationFarmerPaidCash = 0
  let outstationFarmerPaidBank = 0
  let outstandingFarmerLiabilities = 0
  for (const fp of farmerPaymentRows) {
    if (fp.status === 'partial' || fp.status === 'paid') {
      if (fp.channel === 'cash') outstationFarmerPaidCash += fp.amount_paid ?? 0
      if (fp.channel === 'upi') outstationFarmerPaidBank += fp.amount_paid ?? 0
    }
    if (fp.status === 'unpaid' || fp.status === 'partial') {
      outstandingFarmerLiabilities += fp.outstanding ?? 0
    }
  }

  let localInboundQuery = LocalFarmerInbound.find({ week_id: weekId })
    .select('amount_paid payment_channel payment_amount_cash payment_amount_bank')
  if (session) localInboundQuery = localInboundQuery.session(session)
  const localInboundRows = await localInboundQuery.lean()

  let localFarmerPaidCash = 0
  let localFarmerPaidBank = 0
  for (const row of localInboundRows) {
    const cashRecorded = row.payment_amount_cash ?? 0
    const bankRecorded = row.payment_amount_bank ?? 0
    if (cashRecorded + bankRecorded > 0) {
      localFarmerPaidCash += cashRecorded
      localFarmerPaidBank += bankRecorded
      continue
    }
    const paid = row.amount_paid ?? 0
    if (row.payment_channel === 'cash') localFarmerPaidCash += paid
    if (row.payment_channel === 'upi') localFarmerPaidBank += paid
  }

  const dueRows = await aggregateOnModel(WalletTransaction, [
    matchWeek,
    { $match: { type: 'customer_due' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ], session)
  const outstandingCustomerDues = dueRows[0]?.total ?? 0

  const openingBalanceCash = week.opening_balance_cash
  const openingBalanceBank = week.opening_balance_bank

  const closingBalanceCash =
    openingBalanceCash +
    preorder.cash +
    marketDay.cash +
    walkin.cash -
    outstationFarmerPaidCash -
    localFarmerPaidCash

  const closingBalanceBank =
    openingBalanceBank +
    preorder.bank +
    marketDay.bank +
    walkin.bank -
    outstationFarmerPaidBank -
    localFarmerPaidBank

  const generatedAt = new Date()
  const summaryDoc = {
    summary_id: `sum-${weekId}`,
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
    outstation_farmer_paid_cash: outstationFarmerPaidCash,
    outstation_farmer_paid_bank: outstationFarmerPaidBank,
    local_farmer_paid_cash: localFarmerPaidCash,
    local_farmer_paid_bank: localFarmerPaidBank,
    outstanding_farmer_liabilities: outstandingFarmerLiabilities,
    outstanding_customer_dues: outstandingCustomerDues,
    closing_balance_cash: closingBalanceCash,
    closing_balance_bank: closingBalanceBank,
    generated_at: generatedAt,
    created_at: generatedAt,
    created_by: operatorId
  }

  const createOptions = session ? { session } : {}
  await WeeklySummary.create([summaryDoc], createOptions)

  return summaryDoc
}

module.exports = {
  aggregateWeeklySummary
}
