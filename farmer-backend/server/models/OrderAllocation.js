const mongoose = require('mongoose')

const allocationLineSchema = new mongoose.Schema(
  {
    item_name: {
      type: String,
      required: true
    },
    requested_qty: {
      type: Number,
      required: true,
      min: 0
    },
    allocated_qty: {
      type: Number,
      required: true,
      min: 0
    },
    unit: {
      type: String,
      required: true,
      enum: ['kg', 'piece', 'bunch', '100g']
    }
  },
  { _id: false }
)

const orderAllocationSchema = new mongoose.Schema(
  {
    week_id: {
      type: String,
      required: true
    },
    order_id: {
      type: String,
      required: true
    },
    allocations: {
      type: [allocationLineSchema],
      required: true,
      default: []
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'order_allocations'
  }
)

orderAllocationSchema.index({ week_id: 1, order_id: 1 }, { unique: true })
orderAllocationSchema.index({ week_id: 1 })

module.exports = mongoose.model('OrderAllocation', orderAllocationSchema)
