'use strict'

/**
 * Market week lifecycle — states, transitions, and action gates.
 * Authoritative source: PRD §3.3, CLAUDE.md §6, specs/B2-state-machine.md.
 * No DB access; consumed by stateMachineGuard and transition services.
 */

const WEEK_STATES = Object.freeze([
  'setup',
  'open',
  'locked',
  'delivery',
  'market_day',
  'reconciliation',
  'closed'
])

/** Forward-only canonical path; no skip, no backward, closed is terminal. */
const PERMITTED_TRANSITIONS = Object.freeze({
  setup: ['open'],
  open: ['locked'],
  locked: ['delivery'],
  delivery: ['market_day'],
  market_day: ['reconciliation'],
  reconciliation: ['closed'],
  closed: []
})

/**
 * Semantic action keys → week states where the action is permitted.
 * Actions omitted here are not state-gated at the module layer (caller decides).
 */
const PERMITTED_ACTIONS = Object.freeze({
  add_produce_item: ['setup', 'open'],
  edit_produce_price: ['setup', 'open'],
  delete_produce_item: ['setup'],
  publish_week: ['setup'],
  receive_parse_message: ['open'],
  create_order: ['open'],
  confirm_order: ['open'],
  debit_wallet: ['open'],
  wallet_top_up: ['setup', 'open', 'locked', 'delivery', 'market_day', 'reconciliation'],
  edit_order: ['open'],
  cancel_order: ['open'],
  lock_orders: ['open'],
  set_farmer_assignments: ['locked'],
  confirm_produce_arrived: ['locked'],
  record_delivered_qty: ['delivery'],
  edit_delivered_qty: ['delivery', 'reconciliation'],
  pack_order: ['delivery'],
  open_market_day: ['delivery'],
  dispatch_order: ['market_day'],
  record_local_farmer_inbound: ['market_day'],
  record_walkin_sale: ['market_day'],
  record_balance_payment: ['market_day'],
  open_reconciliation: ['market_day'],
  edit_local_farmer_sold_qty: ['reconciliation'],
  confirm_price_diff: ['reconciliation'],
  apply_price_diff: ['reconciliation'],
  mark_outstation_farmer_payment: ['reconciliation'],
  record_local_farmer_payment: ['reconciliation'],
  close_week: ['reconciliation'],
  view_weekly_summary: ['closed'],
  register_entity: ['setup', 'open', 'locked', 'delivery', 'market_day', 'reconciliation', 'closed'],
  view_wallet: ['setup', 'open', 'locked', 'delivery', 'market_day', 'reconciliation', 'closed'],
  view_farmer_liabilities: ['setup', 'open', 'locked', 'delivery', 'market_day', 'reconciliation', 'closed']
})

/** JWT verification skipped (ARCHITECTURE §7.4). */
const JWT_SKIP_ROUTES = Object.freeze([
  'GET /webhook/whatsapp',
  'POST /webhook/whatsapp'
])

/** Role allowlist skipped — any authenticated role passes (B7 POST /auth/verify). */
const ROLE_SKIP_ROUTES = Object.freeze([
  ...JWT_SKIP_ROUTES,
  'POST /api/v1/auth/verify'
])

/** Volunteer write allowlist (ARCHITECTURE §7.3, B7). */
const VOLUNTEER_WRITE_ROUTES = Object.freeze([
  'PATCH /api/v1/weeks/:weekId/delivery/:assignmentId',
  'PATCH /api/v1/weeks/:weekId/orders/:orderId/packed',
  'PATCH /api/v1/weeks/:weekId/orders/:orderId/dispatched'
])

/** Volunteer read allowlist (ARCHITECTURE §7.3, B7). */
const VOLUNTEER_READ_ROUTES = Object.freeze([
  'GET /api/v1/weeks/:weekId',
  'GET /api/v1/weeks/:weekId/produce',
  'GET /api/v1/weeks/:weekId/delivery',
  'GET /api/v1/weeks/:weekId/packing',
  'GET /api/v1/weeks/:weekId/dispatch',
  'GET /api/v1/catalogue'
])

module.exports = {
  WEEK_STATES,
  PERMITTED_TRANSITIONS,
  PERMITTED_ACTIONS,
  JWT_SKIP_ROUTES,
  ROLE_SKIP_ROUTES,
  VOLUNTEER_WRITE_ROUTES,
  VOLUNTEER_READ_ROUTES
}
