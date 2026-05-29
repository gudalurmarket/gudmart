'use strict'

const mongoose = require('mongoose')

const IMMUTABLE_INBOUND_FIELDS = new Set([
  'message_id',
  'sender_phone',
  'body',
  'fcfs_timestamp',
  'parsed_items'
])

const parsedItemSchema = new mongoose.Schema(
  {
    raw_text: {
      type: String,
      required: true,
      immutable: true
    },
    product_id: {
      type: String,
      default: null,
      immutable: true
    },
    raw_product_text: {
      type: String,
      default: null,
      immutable: true
    },
    quantity: {
      type: Number,
      default: null,
      immutable: true
    },
    unit: {
      type: String,
      default: null,
      enum: ['kg', 'piece', 'bunch', '100g'],
      immutable: true
    },
    confidence: {
      type: String,
      required: true,
      enum: ['clean', 'partial', 'manual_required'],
      immutable: true
    }
  },
  { _id: false }
)

/**
 * @param {object} update
 * @returns {string[]}
 */
function collectUpdatedTopLevelPaths (update) {
  if (update == null || typeof update !== 'object') return []

  const paths = []
  for (const key of Object.keys(update)) {
    if (!key.startsWith('$')) {
      paths.push(key)
      continue
    }
    const block = update[key]
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      paths.push(...Object.keys(block))
    }
  }
  return paths
}

/**
 * @param {object} update
 */
function assertInboundMutableUpdate (update) {
  const paths = collectUpdatedTopLevelPaths(update)
  for (const path of paths) {
    const topLevel = path.split('.')[0]
    if (IMMUTABLE_INBOUND_FIELDS.has(topLevel)) {
      throw new Error(`inbound_messages.${topLevel} is immutable after insert`)
    }
  }
}

const inboundMessageSchema = new mongoose.Schema(
  {
    message_id: {
      type: String,
      required: true,
      immutable: true
    },
    week_id: {
      type: String,
      default: null
    },
    sender_phone: {
      type: String,
      required: true,
      immutable: true
    },
    customer_id: {
      type: String,
      default: null
    },
    body: {
      type: String,
      default: null,
      immutable: true
    },
    media_type: {
      type: String,
      required: true,
      enum: ['text', 'audio', 'image', 'other']
    },
    fcfs_timestamp: {
      type: Date,
      required: true,
      immutable: true
    },
    parse_status: {
      type: String,
      required: true,
      enum: [
        'clean',
        'partial',
        'manual_required',
        'voice_note',
        'image',
        'no_active_week'
      ]
    },
    parsed_items: {
      type: [parsedItemSchema],
      default: [],
      immutable: true
    },
    queue_status: {
      type: String,
      required: true,
      default: 'pending',
      enum: ['pending', 'approved', 'rejected']
    },
    operator_notes: {
      type: String
    },
    linked_order_id: {
      type: String,
      default: null
    },
    processed_at: {
      type: Date,
      default: null
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    created_by: {
      type: String,
      required: true,
      default: 'system'
    }
  },
  {
    collection: 'inbound_messages'
  }
)

inboundMessageSchema.pre('save', function () {
  if (!this.isNew) {
    const modified = this.modifiedPaths()
    const illegal = modified.filter((p) => {
      if (p === '_id') return false
      const topLevel = p.split('.')[0]
      return IMMUTABLE_INBOUND_FIELDS.has(topLevel)
    })
    if (illegal.length > 0) {
      throw new Error(
        `inbound_messages fields are immutable after insert: ${illegal.join(', ')}`
      )
    }
  }
})

const inboundQueryMethods = ['updateOne', 'updateMany', 'findOneAndUpdate']

function rejectImmutableInboundUpdate () {
  assertInboundMutableUpdate(this.getUpdate())
}

for (const method of inboundQueryMethods) {
  inboundMessageSchema.pre(method, { document: false, query: true }, rejectImmutableInboundUpdate)
}

inboundMessageSchema.index({ message_id: 1 }, { unique: true })
inboundMessageSchema.index({ week_id: 1, queue_status: 1, fcfs_timestamp: 1 })

module.exports = mongoose.model('InboundMessage', inboundMessageSchema)
