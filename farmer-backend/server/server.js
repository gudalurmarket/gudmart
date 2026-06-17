'use strict'

require('dotenv').config()

const { buildApp } = require('./app')
const { reloadSynonymCache } = require('./modules/parser')

/** @type {import('fastify').FastifyInstance | null} */
let app = null

async function start () {
  app = await buildApp()
  await app.ready()
  const port = Number(process.env.PORT) || 8080
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info({ port }, 'GudMart API listening')
}

process.on('SIGHUP', async () => {
  if (!app?.db) return
  try {
    await reloadSynonymCache(app.db)
    app.log.info('Synonym cache reloaded (SIGHUP)')
  } catch (err) {
    app.log.error({ err }, 'Synonym cache reload failed (SIGHUP)')
  }
})

async function shutdown (signal) {
  if (!app) {
    process.exit(0)
    return
  }
  try {
    await app.close()
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Stopped on ${signal}`)
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
