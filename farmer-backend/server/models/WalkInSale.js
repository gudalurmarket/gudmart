'use strict'

const mongoose = require('mongoose')

const IMMUTABLE_SALE_ERROR = 'walkin_sales are immutable after insert'

const walkInSaleSchema = new mongoose.Schema(
  {
    sale_id: {
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
    product_id: {
      type: String,
      default: null,
      immutable: true
    },
    inventory_source: {
      type: String,
      required: true,
      enum: ['outstation', 'local_farmer'],
      immutable: true
    },
    farmer_id: {
      type: String,
      default: null,
      immutable: true
    },
    qty_sold: {
      type: Number,
      required: true,
      min: 0,
      immutable: true
    },
    amount_collected: {
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
      enum: ['cash', 'upi'],
      immutable: true
    },
    customer_id: {
      type: String,
      default: null,
      immutable: true
    },
    loose_customer_name: {
      type: String,
      default: null,
      immutable: true
    },
    loose_customer_phone: {
      type: String,
      default: null,
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
    collection: 'walkin_sales'
  }
)

function rejectWalkInMutation () {
  throw new Error(IMMUTABLE_SALE_ERROR)
}

walkInSaleSchema.pre('save', function () {
  if (!this.isNew) rejectWalkInMutation()
})

const walkInQueryMethods = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne'
]

for (const method of walkInQueryMethods) {
  walkInSaleSchema.pre(method, { document: false, query: true }, rejectWalkInMutation)
}

module.exports = mongoose.model('WalkInSale', walkInSaleSchema)
