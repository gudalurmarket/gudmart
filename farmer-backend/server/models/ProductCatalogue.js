'use strict'

const mongoose = require('mongoose')

const productCatalogueSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
      required: true,
      unique: true
    },
    name_en: {
      type: String,
      required: true,
      trim: true
    },
    name_ta: {
      type: String,
      trim: true
    },
    default_unit: {
      type: String,
      required: true,
      enum: ['kg', 'piece', 'bunch', '100g']
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
    collection: 'product_catalogue'
  }
)

module.exports = mongoose.model('ProductCatalogue', productCatalogueSchema)
