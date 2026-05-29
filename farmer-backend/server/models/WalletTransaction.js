'use strict'

const mongoose = require('mongoose')

const IMMUTABLE_LEDGER_ERROR =
  'wallet_transactions are immutable after insert'

const walletTransactionSchema = new mongoose.Schema(
  {
    txn_id: {
      type: String,
      required: true,
      unique: true,
      immutable: true
    },
    customer_id: {
      type: String,
      required: true,
      immutable: true
    },
    week_id: {
      type: String,
      default: null,
      immutable: true
    },
    type: {
      type: String,
      required: true,
      enum: [
        'top_up',
        'order_debit',
        'order_debit_reversal',
        'price_diff_credit',
        'price_diff_debit',
        'customer_due',
        'balance_payment',
        'manual_adjustment'
      ],
      immutable: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      },
      immutable: true
    },
    channel: {
      type: String,
      required: true,
      enum: ['cash', 'upi', 'system'],
      immutable: true
    },
    reference_note: {
      type: String,
      immutable: true
    },
    running_balance: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      },
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
    collection: 'wallet_transactions'
  }
)

function rejectLedgerMutation () {
  throw new Error(IMMUTABLE_LEDGER_ERROR)
}

walletTransactionSchema.pre('save', function () {
  if (!this.isNew) rejectLedgerMutation()
})

const ledgerQueryMethods = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace'
]

for (const method of ledgerQueryMethods) {
  walletTransactionSchema.pre(method, { document: false, query: true }, rejectLedgerMutation)
}

walletTransactionSchema.index({ customer_id: 1, created_at: -1 })
walletTransactionSchema.index({ week_id: 1, type: 1 })
walletTransactionSchema.index({ customer_id: 1, week_id: 1 })
// B2 §4.2 / §4.3 — at most one order_debit or order_debit_reversal per reference_note per customer
walletTransactionSchema.index(
  { customer_id: 1, type: 1, reference_note: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: { $in: ['order_debit', 'order_debit_reversal'] }
    }
  }
)

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema)
