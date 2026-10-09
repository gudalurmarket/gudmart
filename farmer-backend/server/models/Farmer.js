'use strict'

const mongoose = require('mongoose')

const farmerSchema = new mongoose.Schema(
  {
    farmer_id: {
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
    location: {
      type: String,
      required: true,
      trim: true
    },
    farmer_type: {
      type: String,
      required: true,
      enum: ['outstation', 'local']
    },
    active: {
      type: Boolean,
      default: true
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    created_by: {
      type: String,
      required: true
    },
    // Set on every PATCH — answers "who changed this record, and when"
    updated_at: {
      type: Date,
      default: null
    },
    updated_by: {
      type: String,
      default: null
    }
  },
  {
    collection: 'farmers'
  }
)

farmerSchema.index({ phone: 1 }, { unique: true })
farmerSchema.index({ farmer_type: 1, active: 1 })

module.exports = mongoose.model('Farmer', farmerSchema)
