'use strict'

const mongoose = require('mongoose')

const customerSchema = new mongoose.Schema(
  {
    customer_id: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    active: {
      type: Boolean,
      default: true
    },
    wallet_balance: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
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
    collection: 'customers'
  }
)

customerSchema.index({ phone: 1 }, { unique: true })

module.exports = mongoose.model('Customer', customerSchema)
