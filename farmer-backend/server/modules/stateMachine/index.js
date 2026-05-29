'use strict'

/**
 * MarketWeek state machine — pure transition and action-gate logic.
 * No DB access; state persistence goes through a dedicated transition service.
 */

const {
  WEEK_STATES,
  PERMITTED_TRANSITIONS,
  PERMITTED_ACTIONS
} = require('./constants')
const { validateStateTransition } = require('./stateGuard')
const {
  ActionNotAllowedError,
  InvalidStateTransitionError
} = require('../../lib/errors')

function assertKnownState (state, label) {
  if (!WEEK_STATES.includes(state)) {
    const reason = `${label} is not a recognized week state`
    throw new InvalidStateTransitionError(
      `Invalid state transition: ${state} → ${state} (${reason})`,
      { currentState: state, targetState: state, reason }
    )
  }
}

/**
 * @param {{ code: string, currentState: string, targetState: string }} err
 * @param {string} currentState
 * @param {string} nextState
 * @returns {string}
 */
function structuredErrorToReason (err, currentState, nextState) {
  switch (err.code) {
    case 'INVALID_STATE':
      if (!WEEK_STATES.includes(currentState)) {
        return 'currentState is not a recognized week state'
      }
      if (!WEEK_STATES.includes(nextState)) {
        return 'nextState is not a recognized week state'
      }
      return 'invalid state'
    case 'TERMINAL_STATE':
      return 'closed is terminal'
    case 'INVALID_TRANSITION':
      if (currentState === nextState) {
        return 'self-transition not allowed'
      }
      {
        const fromIdx = WEEK_STATES.indexOf(currentState)
        const toIdx = WEEK_STATES.indexOf(nextState)
        if (toIdx < fromIdx) {
          return 'backward transition not allowed'
        }
        if (toIdx > fromIdx + 1) {
          return 'state skip not allowed'
        }
        return 'transition not permitted'
      }
    default:
      return err.message || err.code
  }
}

/**
 * @param {string} currentState
 * @param {string} nextState
 * @throws {InvalidStateTransitionError}
 */
function assertValidTransition (currentState, nextState) {
  try {
    validateStateTransition({
      currentState,
      targetState: nextState
    })
  } catch (err) {
    if (err != null && typeof err === 'object' && err.code != null) {
      const cs = err.currentState ?? currentState
      const ts = err.targetState ?? nextState
      const reason = structuredErrorToReason(err, currentState, nextState)
      throw new InvalidStateTransitionError(
        `Invalid state transition: ${cs} → ${ts} (${reason})`,
        { currentState: cs, targetState: ts, reason }
      )
    }
    throw err
  }
}

/**
 * @param {string} state — current market_weeks.state
 * @param {string} action — semantic key from PERMITTED_ACTIONS
 * @returns {boolean}
 */
function isActionAllowed (state, action) {
  const permittedStates = PERMITTED_ACTIONS[action]

  if (permittedStates == null) {
    throw new Error(`Unknown action: ${action}`)
  }

  assertKnownState(state, 'state')

  return permittedStates.includes(state)
}

/**
 * @param {string} action
 * @returns {string[]|undefined}
 */
function permittedStatesForAction (action) {
  return PERMITTED_ACTIONS[action]
}

/**
 * @param {string} action — semantic key from PERMITTED_ACTIONS
 * @param {string} state — current market_weeks.state
 * @param {{ weekId?: string }} [context]
 * @throws {ActionNotAllowedError}
 */
function enforceActionAllowed (action, state, context = {}) {
  if (!isActionAllowed(state, action)) {
    throw new ActionNotAllowedError(
      `Action "${action}" is not permitted when market week is in state "${state}"`,
      {
        weekId: context.weekId,
        currentState: state,
        action,
        permittedStates: permittedStatesForAction(action) ?? []
      }
    )
  }
}

module.exports = {
  WEEK_STATES,
  PERMITTED_TRANSITIONS,
  PERMITTED_ACTIONS,
  InvalidStateTransitionError,
  assertValidTransition,
  enforceActionAllowed,
  isActionAllowed,
  permittedStatesForAction,
  get transitionWeekState () {
    return require('./transitionExecutor').transitionWeekState
  }
}
