import { ApiError } from './api.js'

/**
 * Map API errors to translation keys for operator-facing messages.
 * @param {unknown} err
 * @returns {string}
 */
export function apiErrorTranslationKey (err) {
  if (!(err instanceof ApiError)) {
    return 'error.unknown'
  }
  if (err.code === 'NETWORK_ERROR') {
    return 'error.network_error'
  }
  const codeMap = {
    FORBIDDEN: 'error.forbidden',
    UNAUTHORISED: 'error.unauthorised',
    ACTION_NOT_PERMITTED_IN_STATE: 'error.action_not_permitted_in_state',
    TRANSITION_GATE_BLOCKED: 'error.transition_gate_blocked',
    TRANSITION_GATE_FAILED: 'error.transition_gate_blocked',
    MARKET_WEEK_NOT_FOUND: 'error.week_not_found',
    WEEK_NOT_FOUND: 'error.week_not_found',
    ORDER_NOT_FOUND: 'error.order_not_found',
    CUSTOMER_NOT_FOUND: 'error.customer_not_found',
    VALIDATION_ERROR: 'error.validation',
    INTERNAL_ERROR: 'error.internal',
  }
  return codeMap[err.code] ?? 'error.unknown'
}

/**
 * @param {{ weekId?: string, week_id?: string, _id?: string } | null | undefined} week
 * @returns {string | null}
 */
export function resolveWeekId (week) {
  if (week == null) return null
  return week.weekId ?? week.week_id ?? week._id ?? null
}
