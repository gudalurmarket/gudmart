'use strict'

const mongoose = require('mongoose')

const localFarmerInboundSchema = new mongoose.Schema(
  {
    inbound_id: {
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
    product_id: {
      type: String,
      default: null
    },
    item_name: {
      type: String,
      default: null,
      required: function () {
        return this.product_id == null
      }
    },
    inbound_qty: {
      type: Number,
      required: true,
      min: 0
    },
    sold_qty: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    payment_amount_cash: {
      type: Number,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    payment_amount_bank: {
      type: Number,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    unit: {
      type: String,
      required: true,
      enum: ['kg', 'piece', 'bunch', '100g']
    },
    price_per_unit: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    amount_paid: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: function (v) {
          return v == null || Number.isInteger(v)
        },
        message: 'Must be integer paise'
      }
    },
    payment_channel: {
      type: String,
      default: null,
      validate: {
        validator: function (v) {
          return v == null || v === 'cash' || v === 'upi'
        },
        message: 'payment_channel must be cash, upi, or null'
      }
    },
    payment_recorded_at: {
      type: Date,
      default: null
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
    collection: 'local_farmer_inbound'
  }
)

module.exports = mongoose.model('LocalFarmerInbound', localFarmerInboundSchema)
