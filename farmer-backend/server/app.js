'use strict'

require('dotenv').config()

const path = require('path')
const { MongoClient } = require('mongodb')
const mongoose = require('mongoose')
const fastifyFactory = require('fastify')
const fastifyStatic = require('@fastify/static')
const { initFirebase } = require('./config/firebase')
const authVerify = require('./plugins/authVerify')
const stateMachineGuard = require('./plugins/stateMachineGuard')
const { registerErrorHandler } = require('./lib/errors')
const { reloadSynonymCache } = require('./modules/parser')

const DB_NAME = 'farmer-market'

/** Temporary startup diagnostics — remove after hang is resolved */
function startupLog (id, message) {
  console.error(`[${id}] ${message}`)
}

/**
 * @param {object} [opts]
 * @param {string} [opts.dbName]
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildApp (opts = {}) {
  startupLog('STARTUP-10', 'buildApp() entered')
  const dbName = opts.dbName ?? DB_NAME

  const fastify = fastifyFactory({
    logger: process.env.NODE_ENV === 'production'
  })
  startupLog('STARTUP-11', 'Fastify instance created')

  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not defined')
  }
  startupLog('STARTUP-12', `MONGODB_URI present (length=${uri.length})`)

  const mongoClient = new MongoClient(uri)
  startupLog('STARTUP-13', 'before mongoClient.connect()')
  await mongoClient.connect()
  startupLog('STARTUP-14', 'after mongoClient.connect()')
  fastify.decorate('db', mongoClient.db(dbName))
  fastify.decorate('mongo', { client: mongoClient })

  fastify.addHook('onClose', async () => {
    await mongoClient.close()
  })

  const mongooseState = mongoose.connection.readyState
  startupLog('STARTUP-15', `mongoose readyState=${mongooseState} (0=disconnected)`)
  if (mongooseState === 0) {
    startupLog('STARTUP-16', 'before mongoose.connect()')
    await mongoose.connect(uri, { dbName })
    startupLog('STARTUP-17', 'after mongoose.connect()')
  } else {
    startupLog('STARTUP-17', 'skipped mongoose.connect() — already connected')
  }

  startupLog('STARTUP-18', 'before initFirebase()')
  initFirebase()
  startupLog('STARTUP-19', 'after initFirebase()')

  startupLog('STARTUP-20', 'before fastifyStatic.register()')
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/'
  })
  startupLog('STARTUP-21', 'after fastifyStatic.register()')

  startupLog('STARTUP-22', 'before authVerify plugin')
  await authVerify(fastify)
  fastify.addHook('onRequest', authVerify.verifyAuthPreHandler)
  fastify.addHook('preHandler', authVerify.authorizeRolePreHandler)
  startupLog('STARTUP-23', 'after authVerify plugin + hooks')

  startupLog('STARTUP-24', 'before stateMachineGuard plugin')
  await stateMachineGuard(fastify)
  fastify.addHook('preHandler', stateMachineGuard.stateMachineGuardPreHandler)
  startupLog('STARTUP-25', 'after stateMachineGuard plugin + hooks')

  const routeRegisters = [
    ['STARTUP-26', 'authRoutes', './routes/authRoutes', '/api/v1'],
    ['STARTUP-27', 'weeksRoutes', './routes/weeksRoutes', '/api/v1'],
    ['STARTUP-28', 'produceRoutes', './routes/produceRoutes', '/api/v1'],
    ['STARTUP-29', 'ordersAndIntake', './routes/ordersAndIntake', '/api/v1'],
    ['STARTUP-30', 'customersRoutes', './routes/customersRoutes', '/api/v1'],
    ['STARTUP-31', 'farmersRoutes', './routes/farmersRoutes', '/api/v1'],
    ['STARTUP-32', 'catalogueRoutes', './routes/catalogueRoutes', '/api/v1'],
    ['STARTUP-33', 'deliveryRoutes', './routes/deliveryRoutes', '/api/v1'],
    ['STARTUP-34', 'reconciliationRoutes', './routes/reconciliationRoutes', '/api/v1'],
    ['STARTUP-35', 'sseRoutes', './routes/sseRoutes', '/api/v1'],
    ['STARTUP-36', 'webhookRoutes', './routes/webhookRoutes', null]
  ]

  for (const [id, label, routePath, prefix] of routeRegisters) {
    startupLog(id, `before register ${label}`)
    if (prefix) {
      await fastify.register(require(routePath), { prefix })
    } else {
      await fastify.register(require(routePath))
    }
    startupLog(`${id}b`, `after register ${label}`)
  }

  // SPA fallback — serve index.html for all non-API, non-webhook paths so
  // React Router deep links (e.g. /operator/dashboard) work on refresh and direct URL entry.
  fastify.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0]
    if (pathname.startsWith('/api/') || pathname.startsWith('/webhook/')) {
      return reply.status(404).send({
        code: 'NOT_FOUND',
        httpStatus: 404,
        message: 'Not found',
        details: {}
      })
    }
    return reply.sendFile('index.html')
  })

  startupLog('STARTUP-37', 'before registerErrorHandler()')
  registerErrorHandler(fastify)
  startupLog('STARTUP-38', 'after registerErrorHandler()')

  fastify.addHook('onReady', async () => {
    startupLog('STARTUP-40', 'onReady hook — before reloadSynonymCache()')
    await reloadSynonymCache(fastify.db)
    startupLog('STARTUP-41', 'onReady hook — after reloadSynonymCache()')
  })

  startupLog('STARTUP-39', 'buildApp() returning (onReady not run until app.ready())')
  return fastify
}

module.exports = { buildApp }
