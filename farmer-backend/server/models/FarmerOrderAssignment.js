'use strict'

const mongoose = require('mongoose')

const farmerOrderAssignmentSchema = new mongoose.Schema(
  {
    assignment_id: {
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
      required: true
    },
    preorder_qty: {
      type: Number,
      required: true,
      min: 0
    },
    buffer_pct: {
      type: Number,
      required: false,
      default: null,
      min: 0
    },
    buffer_qty: {
      type: Number,
      required: true,
      min: 0
    },
    outgoing_qty: {
      type: Number,
      required: true,
      min: 0
    },
    delivered_qty: {
      type: Number,
      required: true,
      min: 0
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
    collection: 'farmer_order_assignments'
  }
)

farmerOrderAssignmentSchema.index(
  { week_id: 1, farmer_id: 1, product_id: 1 },
  { unique: true }
)

module.exports = mongoose.model('FarmerOrderAssignment', farmerOrderAssignmentSchema)
