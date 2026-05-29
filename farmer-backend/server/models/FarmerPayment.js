'use strict'

const mongoose = require('mongoose')

const farmerPaymentSchema = new mongoose.Schema(
  {
    payment_id: {
      type: String,
      required: true,
      unique: true
    },
    week_id: {
      type: String,
      required: true
    },
    farmer_id: {
      type: String,
      required: true
    },
    amount_due: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    status: {
      type: String,
      required: true,
      enum: ['unpaid', 'partial', 'paid']
    },
    amount_paid: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    outstanding: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    channel: {
      type: String,
      default: null,
      validate: {
        validator: function (v) {
          return v == null || v === 'cash' || v === 'upi'
        },
        message: 'channel must be cash, upi, or null'
      }
    },
    recorded_at: {
      type: Date,
      required: true,
      default: Date.now
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
    collection: 'farmer_payments'
  }
)

farmerPaymentSchema.index({ week_id: 1, farmer_id: 1 }, { unique: true })
farmerPaymentSchema.index({ farmer_id: 1, status: 1 })

module.exports = mongoose.model('FarmerPayment', farmerPaymentSchema)
