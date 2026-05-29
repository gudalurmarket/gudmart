'use strict'

const mongoose = require('mongoose')

const synonymEntrySchema = new mongoose.Schema(
  {
    canonical: {
      type: String,
      required: true
    },
    aliases: {
      type: [String],
      required: true,
      default: []
    },
    language: {
      type: String,
      enum: ['en', 'ta', 'mixed']
    }
  },
  { _id: false }
)

const configSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      enum: ['synonyms'],
      default: 'synonyms'
    },
    table: {
      type: [synonymEntrySchema],
      required: true,
      default: []
    },
    updated_at: {
      type: Date,
      default: Date.now
    },
    updated_by: {
      type: String,
      required: true
    }
  },
  {
    collection: 'config'
  }
)

module.exports = mongoose.model('Config', configSchema)
