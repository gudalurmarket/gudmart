'use strict'

/**
 * Pure market_weeks state transition validator.
 * No DB access, no side-effects — validates (currentState → targetState) only.
 * Authoritative edges: specs/B2-state-machine.md §4.
 */

const STATES = [
  'setup',
  'open',
  'locked',
  'delivery',
  'market_day',
  'reconciliation',
  'closed'
]

/** @type {Map<string, string>} */
const VALID_TRANSITIONS = new Map([
  ['setup', 'open'],
  ['open', 'locked'],
  ['locked', 'delivery'],
  ['delivery', 'market_day'],
  ['market_day', 'reconciliation'],
  ['reconciliation', 'closed']
])

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isValidTransition (from, to) {
  return VALID_TRANSITIONS.get(from) === to
}

/**
 * @param {{
 *   currentState: string,
 *   targetState: string
 * }} params
 * @returns {{ ok: true }}
 */
function validateStateTransition ({ currentState, targetState }) {
  if (!STATES.includes(currentState)) {
    throw {
      code: 'INVALID_STATE',
      currentState,
      targetState,
      message: 'Invalid state'
    }
  }

  if (!STATES.includes(targetState)) {
    throw {
      code: 'INVALID_STATE',
      currentState,
      targetState,
      message: 'Invalid state'
    }
  }

  if (currentState === targetState) {
    throw {
      code: 'INVALID_TRANSITION',
      currentState,
      targetState,
      message: 'Invalid state transition'
    }
  }

  if (currentState === 'closed') {
    throw {
      code: 'TERMINAL_STATE',
      currentState,
      targetState,
      message: 'Cannot transition from terminal state'
    }
  }

  if (!isValidTransition(currentState, targetState)) {
    throw {
      code: 'INVALID_TRANSITION',
      currentState,
      targetState,
      message: 'Invalid state transition'
    }
  }

  return { ok: true }
}

module.exports = {
  STATES,
  VALID_TRANSITIONS,
  isValidTransition,
  validateStateTransition
}
