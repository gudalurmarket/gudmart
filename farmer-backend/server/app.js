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

/**
 * @param {object} [opts]
 * @param {string} [opts.dbName]
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildApp (opts = {}) {
  const dbName = opts.dbName ?? DB_NAME

  const fastify = fastifyFactory({
    logger: process.env.NODE_ENV === 'production'
  })

  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not defined')
  }

  const mongoClient = new MongoClient(uri)
  await mongoClient.connect()
  fastify.decorate('db', mongoClient.db(dbName))
  fastify.decorate('mongo', { client: mongoClient })

  fastify.addHook('onClose', async () => {
    await mongoClient.close()
  })

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, { dbName })
  }

  initFirebase()

  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/'
  })

  await authVerify(fastify)
  fastify.addHook('onRequest', authVerify.verifyAuthPreHandler)
  fastify.addHook('preHandler', authVerify.authorizeRolePreHandler)

  await stateMachineGuard(fastify)
  fastify.addHook('preHandler', stateMachineGuard.stateMachineGuardPreHandler)

  const routeRegisters = [
    ['./routes/authRoutes', '/api/v1'],
    ['./routes/weeksRoutes', '/api/v1'],
    ['./routes/produceRoutes', '/api/v1'],
    ['./routes/ordersAndIntake', '/api/v1'],
    ['./routes/customersRoutes', '/api/v1'],
    ['./routes/farmersRoutes', '/api/v1'],
    ['./routes/catalogueRoutes', '/api/v1'],
    ['./routes/deliveryRoutes', '/api/v1'],
    ['./routes/reconciliationRoutes', '/api/v1'],
    ['./routes/sseRoutes', '/api/v1'],
    ['./routes/webhookRoutes', null]
  ]

  for (const [routePath, prefix] of routeRegisters) {
    if (prefix) {
      await fastify.register(require(routePath), { prefix })
    } else {
      await fastify.register(require(routePath))
    }
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

  registerErrorHandler(fastify)

  fastify.addHook('onReady', async () => {
    await reloadSynonymCache(fastify.db)
  })

  return fastify
}

module.exports = { buildApp }
