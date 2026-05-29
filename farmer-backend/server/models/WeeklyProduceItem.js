'use strict'

const mongoose = require('mongoose')

const weeklyProduceItemSchema = new mongoose.Schema(
  {
    produce_item_id: {
      type: String,
      required: true,
      unique: true
    },
    week_id: {
      type: String,
      required: true
    },
    product_id: {
      type: String,
      required: true
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
    display_order: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer'
      }
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    created_by: {
      type: String,
      required: true
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  {
    collection: 'weekly_produce_items'
  }
)

weeklyProduceItemSchema.index({ week_id: 1, product_id: 1 }, { unique: true })
weeklyProduceItemSchema.index({ week_id: 1, display_order: 1 })

module.exports = mongoose.model('WeeklyProduceItem', weeklyProduceItemSchema)
