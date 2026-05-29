'use strict'

const mongoose = require('mongoose')

const IMMUTABLE_LINE_FIELDS = new Set([
  'line_item_id',
  'product_id',
  'ordered_qty',
  'unit',
  'price_per_unit',
  'line_value'
])

/** Statuses where order_value and wallet_debited are frozen (B1). */
const POST_CONFIRMATION_STATUSES = new Set([
  'confirmed',
  'packed',
  'dispatched',
  'delivered'
])

const orderLineItemSchema = new mongoose.Schema(
  {
    line_item_id: {
      type: String,
      required: true,
      immutable: true
    },
    product_id: {
      type: String,
      required: true,
      immutable: true
    },
    ordered_qty: {
      type: Number,
      required: true,
      min: 0,
      immutable: true
    },
    delivered_qty: {
      type: Number,
      required: true,
      min: 0
    },
    unit: {
      type: String,
      required: true,
      enum: ['kg', 'piece', 'bunch', '100g'],
      immutable: true
    },
    price_per_unit: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      },
      immutable: true
    },
    line_value: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      },
      immutable: true
    },
    difference_confirmed: {
      type: Boolean,
      required: true,
      default: false
    }
  },
  { _id: false }
)

const customerOrderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true
    },
    week_id: {
      type: String,
      required: true
    },
    customer_id: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: [
        'pending_payment',
        'confirmed',
        'cancelled',
        'packed',
        'dispatched',
        'delivered'
      ]
    },
    fcfs_timestamp: {
      type: Date,
      required: true,
      immutable: true
    },
    order_value: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    wallet_debited: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    wallet_txn_id: {
      type: String,
      default: null
      // txn_id of the order_debit wallet transaction at confirmation
      // set by the route/service layer when debitForOrder succeeds
      // used by price-change and cancellation flows for reversal lookup
      // null for pending_payment orders (no debit taken)
    },
    balance_due: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    balance_cleared: {
      type: Boolean,
      required: true,
      default: false
    },
    notes: {
      type: String
    },
    pending_reason: {
      type: String
    },
    line_items: {
      type: [orderLineItemSchema],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 1
        },
        message: 'line_items must contain at least 1 item'
      }
    },
    cancelled_at: {
      type: Date
    },
    cancelled_by: {
      type: String
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    created_by: {
      type: String,
      required: true
    }
  },
  {
    collection: 'customer_orders'
  }
)

/**
 * @param {string} status
 * @returns {boolean}
 */
function isPostConfirmationStatus (status) {
  return POST_CONFIRMATION_STATUSES.has(status)
}

/**
 * Reject updates to order_value / wallet_debited after confirmation (B1).
 * @param {import('mongoose').Document} doc
 */
function assertConfirmationFieldsMutable (doc) {
  if (doc.isNew) return
  if (!doc.$__was_confirmed_on_load) return

  if (doc.isModified('order_value')) {
    throw new Error(
      'customer_orders.order_value is immutable after confirmation'
    )
  }
  if (doc.isModified('wallet_debited')) {
    throw new Error(
      'customer_orders.wallet_debited is immutable after confirmation'
    )
  }
}

/**
 * Reject updates to immutable line-item fields after initial write.
 * @param {import('mongoose').Document} doc
 */
function assertLineItemsMutable (doc) {
  if (doc.isNew) return

  const prior = doc.$__original_line_items
  if (!prior || !Array.isArray(doc.line_items)) return

  for (let i = 0; i < doc.line_items.length; i++) {
    const next = doc.line_items[i]
    const prev = prior[i]
    if (!prev || !next) continue

    for (const field of IMMUTABLE_LINE_FIELDS) {
      if (next[field] !== prev[field]) {
        throw new Error(
          `customer_orders.line_items.${field} is immutable after write`
        )
      }
    }
  }
}

customerOrderSchema.post('init', function () {
  this.$__was_confirmed_on_load = isPostConfirmationStatus(this.status)
})

customerOrderSchema.pre('save', function () {
  if (this.isNew) {
    this.$__original_line_items = this.line_items.map((li) => li.toObject?.() ?? { ...li })
    return
  }

  assertLineItemsMutable(this)
  assertConfirmationFieldsMutable(this)
  this.$__original_line_items = this.line_items.map((li) => li.toObject?.() ?? { ...li })
})

customerOrderSchema.index({ week_id: 1, status: 1, fcfs_timestamp: 1 })
customerOrderSchema.index({ week_id: 1, customer_id: 1 })
customerOrderSchema.index({ week_id: 1, status: 1 })

module.exports = mongoose.model('CustomerOrder', customerOrderSchema)
