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
    }
  },
  {
    collection: 'product_catalogue'
  }
)

module.exports = mongoose.model('ProductCatalogue', productCatalogueSchema)
