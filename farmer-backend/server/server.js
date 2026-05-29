'use strict'

require('dotenv').config()

const { buildApp } = require('./app')
const { reloadSynonymCache } = require('./modules/parser')

/** Temporary startup diagnostics — remove after hang is resolved */
function startupLog (id, message) {
  console.error(`[${id}] ${message}`)
}

/** @type {import('fastify').FastifyInstance | null} */
let app = null

async function start () {
  startupLog('STARTUP-01', 'start() entered')
  startupLog('STARTUP-02', 'before buildApp()')
  app = await buildApp()
  startupLog('STARTUP-03', 'after buildApp()')
  startupLog('STARTUP-04', 'before app.ready()')
  await app.ready()
  startupLog('STARTUP-05', 'after app.ready()')
  const port = Number(process.env.PORT) || 8080
  startupLog('STARTUP-06', `before app.listen(port=${port})`)
  await app.listen({ port, host: '0.0.0.0' })
  startupLog('STARTUP-07', 'after app.listen()')
  app.log.info({ port }, 'Server listening')
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
