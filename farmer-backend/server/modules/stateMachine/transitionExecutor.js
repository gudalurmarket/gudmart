'use strict'

/**
 * Atomic MarketWeek state transitions — sole permitted writer for `state` / `state_history`.
 * CAS on `state` in a single findOneAndUpdate; append-only history via `$push`.
 */

const MarketWeek = require('../../models/MarketWeek')
const STATE_MACHINE_UPDATE_OPTION = MarketWeek.STATE_MACHINE_UPDATE_OPTION
const { assertValidTransition, InvalidStateTransitionError } = require('./index')
const {
  MarketWeekNotFoundError,
  MarketWeekStateMismatchError
} = require('../../lib/errors')

/**
 * @param {{
 *   weekId: string,
 *   fromState: string,
 *   toState: string,
 *   operatorId: string,
 *   note?: string,
 *   session?: import('mongoose').ClientSession
 * }} params
 * @returns {Promise<{ week: object, previousState: string, newState: string }>}
 */
async function transitionWeekState ({
  weekId,
  fromState,
  toState,
  operatorId,
  note,
  session
}) {
  if (!weekId || typeof weekId !== 'string') {
    throw new Error('INVALID_INPUT: weekId must be string')  }
  if (!operatorId || typeof operatorId !== 'string') {
    throw new Error('INVALID_INPUT: operatorId must be string')
  }

  assertValidTransition(fromState, toState)

  const changedAt = new Date()
  const historyEntry = {
    from_state: fromState,
    to_state: toState,
    changed_at: changedAt,
    changed_by: operatorId
  }
  if (note != null) {
    historyEntry.note = note
  }

  const update = {
    state: toState,
    $push: { state_history: historyEntry }
  }
  if (toState === 'closed') {
    update.closed_at = changedAt
  }

  const updateOptions = {
    returnDocument: 'after',
    runValidators: true,
    [STATE_MACHINE_UPDATE_OPTION]: true
  }
  if (session) {
    updateOptions.session = session
  }

  const updated = await MarketWeek.findOneAndUpdate(
    { week_id: weekId, state: fromState },
    update,
    updateOptions
  ).lean()

  if (updated) {
    return {
      week: updated,
      previousState: fromState,
      newState: toState
    }
  }

  // Distinguish not-found vs CAS race — only after failed atomic update, never before.
  let existingQuery = MarketWeek.findOne({ week_id: weekId }).select('state')
  if (session) {
    existingQuery = existingQuery.session(session)
  }
  const existing = await existingQuery.lean()

  if (!existing) {
    throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
  }

  throw new MarketWeekStateMismatchError(
    `Market week ${weekId} is in state "${existing.state}", expected "${fromState}"`,
    { weekId, expectedState: fromState, actualState: existing.state }
  )
}

module.exports = {
  transitionWeekState
}
