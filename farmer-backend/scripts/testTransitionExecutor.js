'use strict'

/**
 * Manual sanity check for transitionWeekState — not a Jest test.
 * Run from repo root: node scripts/testTransitionExecutor.js
 * Requires MONGODB_URI in .env (same as server).
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const mongoose = require('mongoose')
const connectDB = require('../server/config/db')
const MarketWeek = require('../server/models/MarketWeek')
const { transitionWeekState } = require('../server/modules/stateMachine/transitionExecutor')

const TEST_WEEK_ID = 'test_week_001'
const OPERATOR_ID = 'test_operator'

const TEST_WEEK_DOC = {
  week_id: TEST_WEEK_ID,
  market_date: new Date('2099-01-01'),
  state: 'setup',
  opening_balance_cash: 0,
  opening_balance_bank: 0,
  state_history: [],
  created_at: new Date(),
  created_by: OPERATOR_ID
}

async function ensureTestWeek () {
  const existing = await MarketWeek.findOne({ week_id: TEST_WEEK_ID }).lean()

  if (!existing) {
    await MarketWeek.collection.insertOne(TEST_WEEK_DOC)
    console.log('Created test MarketWeek:', TEST_WEEK_ID)
    return
  }

  if (existing.state === 'setup' && existing.state_history.length === 0) {
    console.log('Using existing test MarketWeek in setup')
    return
  }

  await MarketWeek.deleteOne({ week_id: TEST_WEEK_ID })
  await MarketWeek.collection.insertOne(TEST_WEEK_DOC)
  console.log('Reset test MarketWeek to setup for re-run')
}

async function main () {
  await connectDB()
  await ensureTestWeek()

  console.log('Running transition setup → open...')
  const result = await transitionWeekState({
    weekId: TEST_WEEK_ID,
    fromState: 'setup',
    toState: 'open',
    operatorId: OPERATOR_ID
  })

  console.log('Transition result:', {
    previousState: result.previousState,
    newState: result.newState
  })

  const updated = await MarketWeek.findOne({ week_id: TEST_WEEK_ID }).lean()
  console.log({
    state: updated.state,
    lastHistory: updated.state_history[updated.state_history.length - 1]
  })

  await mongoose.connection.close()
  process.exit(0)
}

main().catch((err) => {
  console.error('Sanity check failed:', err)
  mongoose.connection.close().finally(() => process.exit(1))
})
