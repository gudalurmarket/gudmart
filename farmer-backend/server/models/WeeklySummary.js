'use strict'

const mongoose = require('mongoose')

const integerPaiseValidator = {
  validator: Number.isInteger,
  message: 'Must be integer paise'
}

const IMMUTABLE_SUMMARY_ERROR =
  'weekly_summaries are immutable after insert'

const weeklySummarySchema = new mongoose.Schema(
  {
    summary_id: {
      type: String,
      required: true,
      unique: true,
      immutable: true
    },
    week_id: {
      type: String,
      required: true,
      immutable: true
    },
    opening_balance_cash: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    opening_balance_bank: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    preorder_receipts_cash: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    preorder_receipts_bank: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    market_day_receipts_cash: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    market_day_receipts_bank: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    walkin_receipts_cash: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    walkin_receipts_bank: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    wallet_adjustments_credits: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    wallet_adjustments_debits: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    outstation_farmer_paid_cash: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    outstation_farmer_paid_bank: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    local_farmer_paid_cash: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    local_farmer_paid_bank: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    outstanding_farmer_liabilities: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    outstanding_customer_dues: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    closing_balance_cash: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    closing_balance_bank: {
      type: Number,
      required: true,
      validate: integerPaiseValidator,
      immutable: true
    },
    generated_at: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true
    },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true
    },
    created_by: {
      type: String,
      required: true,
      immutable: true
    }
  },
  {
    collection: 'weekly_summaries'
  }
)

function rejectSummaryMutation () {
  throw new Error(IMMUTABLE_SUMMARY_ERROR)
}

weeklySummarySchema.pre('save', function () {
  if (!this.isNew) rejectSummaryMutation()
})

const summaryQueryMethods = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne'
]

for (const method of summaryQueryMethods) {
  weeklySummarySchema.pre(method, { document: false, query: true }, rejectSummaryMutation)
}

module.exports = mongoose.model('WeeklySummary', weeklySummarySchema)
