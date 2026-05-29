'use strict'

const mongoose = require('mongoose')

const weekStates = [
  'setup',
  'open',
  'locked',
  'delivery',
  'market_day',
  'reconciliation',
  'closed'
]

/** Must match option passed to transitionWeekState (state machine sole writer). */
const STATE_MACHINE_UPDATE_OPTION = 'marketWeekStateMachine'

/**
 * @param {object|object[]|null|undefined} update
 * @returns {boolean}
 */
function isProtectedStateMutation (update) {
  if (update == null || typeof update !== 'object') return false
  if (Array.isArray(update)) {
    return update.some(isProtectedStateMutation)
  }

  for (const key of Object.keys(update)) {
    if (key.startsWith('$')) continue
    if (key === 'state' || key === 'state_history') return true
  }

  const setLikeOps = ['$set', '$unset', '$setOnInsert', '$currentDate']
  for (const op of setLikeOps) {
    const block = update[op]
    if (!block || typeof block !== 'object') continue
    for (const path of Object.keys(block)) {
      if (
        path === 'state' ||
        path === 'state_history' ||
        path.startsWith('state_history.')
      ) {
        return true
      }
    }
  }

  if (update.$push && typeof update.$push === 'object') {
    for (const path of Object.keys(update.$push)) {
      if (
        path === 'state' ||
        path === 'state_history' ||
        path.startsWith('state_history.')
      ) {
        return true
      }
    }
  }

  if (update.$pull && typeof update.$pull === 'object') {
    for (const path of Object.keys(update.$pull)) {
      if (
        path === 'state' ||
        path === 'state_history' ||
        path.startsWith('state_history.')
      ) {
        return true
      }
    }
  }

  if (update.$addToSet && typeof update.$addToSet === 'object') {
    for (const path of Object.keys(update.$addToSet)) {
      if (
        path === 'state' ||
        path === 'state_history' ||
        path.startsWith('state_history.')
      ) {
        return true
      }
    }
  }

  if (update.$pop && typeof update.$pop === 'object') {
    for (const path of Object.keys(update.$pop)) {
      if (
        path === 'state' ||
        path === 'state_history' ||
        path.startsWith('state_history.')
      ) {
        return true
      }
    }
  }

  if (update.$rename && typeof update.$rename === 'object') {
    for (const [from, to] of Object.entries(update.$rename)) {
      const toStr = String(to)
      if (
        from === 'state' ||
        from === 'state_history' ||
        from.startsWith('state_history.')
      ) {
        return true
      }
      if (
        toStr === 'state' ||
        toStr === 'state_history' ||
        toStr.startsWith('state_history.')
      ) {
        return true
      }
    }
  }

  return false
}

function rejectDirectStateMutation () {
  const opts = this.getOptions()
  if (opts && opts[STATE_MACHINE_UPDATE_OPTION] === true) {
    return
  }
  const update = this.getUpdate()
  if (isProtectedStateMutation(update)) {
    throw new Error(
      'Direct state mutation forbidden. Use MarketWeek state machine service.'
    )
  }
}

const stateHistorySchema = new mongoose.Schema(
  {
    from_state: {
      type: String,
      required: true,
      enum: weekStates
    },
    to_state: {
      type: String,
      required: true,
      enum: weekStates
    },
    changed_at: {
      type: Date,
      required: true,
      default: Date.now
    },
    changed_by: {
      type: String,
      required: true
    },
    note: {
      type: String
    }
  },
  { _id: false }
)

const marketWeekSchema = new mongoose.Schema(
  {
    week_id: {
      type: String,
      required: true,
      unique: true
    },
    market_date: {
      type: Date,
      required: true
    },
    state: {
      type: String,
      required: true,
      enum: weekStates,
      default: 'setup'
    },
    opening_balance_cash: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    opening_balance_bank: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Must be integer paise'
      }
    },
    closed_at: {
      type: Date,
      default: null
    },
    state_history: {
      type: [stateHistorySchema],
      default: []
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
    collection: 'market_weeks'
  }
)

marketWeekSchema.pre('save', function () {
  if (this.isNew) return
  if (
    this.isModified('state') ||
    this.modifiedPaths().some((p) => p.startsWith('state_history'))
  ) {
    throw new Error(
      'Direct state mutation forbidden. Use MarketWeek state machine service.'
    )
  }
})

const queryUpdateMethods = ['updateOne', 'updateMany', 'findOneAndUpdate']

for (const method of queryUpdateMethods) {
  marketWeekSchema.pre(method, { document: false, query: true }, rejectDirectStateMutation)
}

marketWeekSchema.index({ market_date: 1 }, { unique: true })
marketWeekSchema.index({ state: 1 })

const MarketWeek = mongoose.model('MarketWeek', marketWeekSchema)

module.exports = MarketWeek
module.exports.STATE_MACHINE_UPDATE_OPTION = STATE_MACHINE_UPDATE_OPTION
module.exports.isProtectedStateMutation = isProtectedStateMutation
