'use strict'

/**
 * Fastify plugin — market week state transition and action gates (B2 / B7).
 *
 * Pure transition/action rules live in server/modules/stateMachine (no DB).
 * This plugin reads week state for route preHandlers only; it never writes state.
 *
 * Register on the root instance (or call the plugin function on it), then attach the
 * preHandler on that same instance so it applies to all routes:
 *
 *   const guard = require('./plugins/stateMachineGuard')
 *   await guard(fastify)
 *   fastify.addHook('preHandler', guard.stateMachineGuardPreHandler)
 *
 * Routes declare `config: { action: '<semantic_key>' }` from PERMITTED_ACTIONS.
 * Handlers may call `fastify.assertValidTransition(from, to)` or
 * `fastify.enforceActionAllowed(action, state)` when week state is already known.
 */

const MarketWeek = require('../models/MarketWeek')
const {
  assertValidTransition,
  enforceActionAllowed,
  PERMITTED_ACTIONS
} = require('../modules/stateMachine')
const {
  AppError,
  MarketWeekNotFoundError
} = require('../lib/errors')

/**
 * @param {import('fastify').FastifyRequest} request
 * @returns {string|null}
 */
function resolveWeekId (request) {
  const { params, body, query } = request
  if (params?.weekId) return params.weekId
  if (params?.week_id) return params.week_id
  if (body && typeof body === 'object') {
    if (body.weekId) return body.weekId
    if (body.week_id) return body.week_id
  }
  if (query?.weekId) return query.weekId
  if (query?.week_id) return query.week_id
  return null
}

/**
 * @param {import('fastify').FastifyRequest} request
 */
async function stateMachineGuardPreHandler (request) {
  const action = request.routeOptions?.config?.action
  if (action == null || action === '') {
    return
  }

  const weekId = resolveWeekId(request)
  if (!weekId) {
    const permittedInAllStates =
      PERMITTED_ACTIONS[action]?.length === 7
    if (permittedInAllStates) {
      return
    }
    throw new AppError(
      'WEEK_ID_REQUIRED',
      400,
      'weekId is required for state-gated routes',
      { action }
    )
  }

  const week = await MarketWeek.findOne({ week_id: weekId }).select('state').lean()
  if (!week) {
    throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
  }

  request.marketState = week.state
  enforceActionAllowed(action, week.state, { weekId })
}

async function stateMachineGuardPlugin (fastify) {
  fastify.decorate('assertValidTransition', assertValidTransition)
  fastify.decorate('enforceActionAllowed', enforceActionAllowed)
  fastify.decorate('stateMachineGuard', stateMachineGuardPreHandler)
}

module.exports = stateMachineGuardPlugin
module.exports.assertValidTransition = assertValidTransition
module.exports.enforceActionAllowed = enforceActionAllowed
module.exports.stateMachineGuardPreHandler = stateMachineGuardPreHandler
module.exports.resolveWeekId = resolveWeekId
