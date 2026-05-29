'use strict'

/**
 * Firebase JWT verification and role-based route authorisation (B7 / ARCHITECTURE §7).
 */

const jwt = require('jsonwebtoken')
const { admin } = require('../config/firebase')
const { AppError } = require('../lib/errors')
const {
  JWT_SKIP_ROUTES,
  ROLE_SKIP_ROUTES,
  VOLUNTEER_WRITE_ROUTES,
  VOLUNTEER_READ_ROUTES
} = require('../modules/stateMachine/constants')

const JWT_SKIP = new Set(JWT_SKIP_ROUTES)
const ROLE_SKIP = new Set(ROLE_SKIP_ROUTES)
const VOLUNTEER_WRITE = new Set(VOLUNTEER_WRITE_ROUTES)
const VOLUNTEER_READ = new Set(VOLUNTEER_READ_ROUTES)

const TEST_TOKEN_OPERATOR = 'test-token-operator'
const TEST_TOKEN_VOLUNTEER = 'test-token-volunteer'

/**
 * @param {import('fastify').FastifyRequest} request
 * @returns {string}
 */
function routeKey (request) {
  const method = request.method
  const path = request.routeOptions?.url ?? request.routerPath ?? request.url.split('?')[0]
  return `${method} ${path}`
}

/** EventSource cannot send Authorization; token is passed as ?token= (build-guide C3). */
function isIntakeQueueSseRequest (request) {
  if (request.method !== 'GET') return false
  const pathname = request.url.split('?')[0]
  return pathname === '/api/v1/events/intake-queue' || pathname.endsWith('/events/intake-queue')
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @returns {string | null}
 */
function extractAuthToken (request) {
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  if (isIntakeQueueSseRequest(request)) {
    const token = request.query?.token
    if (typeof token === 'string' && token.length > 0) {
      return token
    }
  }
  return null
}

/**
 * PWA static assets and other non-API paths do not require JWT (ARCHITECTURE §8.1).
 * @param {import('fastify').FastifyRequest} request
 */
function isPublicPath (request) {
  const pathname = request.url.split('?')[0]
  return !pathname.startsWith('/api/v1')
}

/**
 * @param {import('fastify').FastifyRequest} request
 */
async function verifyAuthPreHandler (request) {
  if (isPublicPath(request)) {
    return
  }

  const key = routeKey(request)
  if (JWT_SKIP.has(key)) {
    return
  }

  const token = extractAuthToken(request)
  if (!token) {
    throw new AppError('UNAUTHORISED', 401, 'Missing or invalid Authorization header')
  }

  if (process.env.NODE_ENV === 'test') {
    if (token === TEST_TOKEN_OPERATOR) {
      request.user = { uid: 'test-operator-uid', role: 'operator', email: 'operator@test' }
      return
    }
    if (token === TEST_TOKEN_VOLUNTEER) {
      request.user = { uid: 'test-volunteer-uid', role: 'volunteer', email: 'volunteer@test' }
      return
    }
    const testSecret = process.env.FIREBASE_TEST_JWT_SECRET
    if (testSecret) {
      try {
        const decoded = jwt.verify(token, testSecret, { algorithms: ['HS256'] })
        const role = decoded.role
        if (role === 'operator' || role === 'volunteer') {
          request.user = {
            uid: decoded.sub ?? decoded.uid ?? 'test-operator-uid',
            role,
            email: decoded.email ?? ''
          }
          return
        }
      } catch {
        // fall through to Firebase verify
      }
    }
  }

  let decoded
  try {
    decoded = await admin.auth().verifyIdToken(token)
  } catch {
    throw new AppError('UNAUTHORISED', 401, 'Invalid or expired token')
  }

  const role = decoded.role ?? decoded.operator ?? null
  if (role !== 'operator' && role !== 'volunteer') {
    throw new AppError('UNAUTHORISED', 401, 'Token missing operator or volunteer role claim')
  }

  request.user = {
    uid: decoded.uid,
    role,
    email: decoded.email ?? ''
  }
}

/**
 * @param {import('fastify').FastifyRequest} request
 */
async function authorizeRolePreHandler (request) {
  if (isPublicPath(request)) {
    return
  }

  const key = routeKey(request)
  if (ROLE_SKIP.has(key)) {
    return
  }

  const role = request.user?.role
  if (role === 'operator') {
    return
  }

  if (role === 'volunteer') {
    if (VOLUNTEER_WRITE.has(key)) return
    if (VOLUNTEER_READ.has(key) && request.method === 'GET') return
    throw new AppError('FORBIDDEN', 403, 'Volunteer is not permitted to access this route')
  }

  throw new AppError('UNAUTHORISED', 401, 'Authentication required')
}

async function authVerifyPlugin (fastify) {
  fastify.decorateRequest('user', null)
}

module.exports = authVerifyPlugin
module.exports.verifyAuthPreHandler = verifyAuthPreHandler
module.exports.authorizeRolePreHandler = authorizeRolePreHandler
module.exports.TEST_TOKEN_OPERATOR = TEST_TOKEN_OPERATOR
module.exports.TEST_TOKEN_VOLUNTEER = TEST_TOKEN_VOLUNTEER
