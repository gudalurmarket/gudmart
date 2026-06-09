'use strict'

const crypto = require('crypto')
const { connections } = require('../modules/sse')
const { AppError } = require('../lib/errors')

const HEARTBEAT_MS = 30_000

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {string} eventName
 * @param {Record<string, unknown>} payload
 */
function writeSseEvent (reply, eventName, payload) {
  const chunk = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
  reply.raw.write(chunk)
}

async function sseRoutes (fastify, _opts) {
  fastify.get('/events/intake-queue', async (request, reply) => {
    if (request.user?.role !== 'operator') {
      throw new AppError('FORBIDDEN', 403, 'Operator role required for intake-queue SSE')
    }

    if (connections.size >= 10) {
      return reply.code(503).send({
        code: 'SSE_CAPACITY_REACHED',
        httpStatus: 503,
        message: 'Maximum concurrent SSE connections reached. Try again shortly.',
        details: {}
      })
    }

    const connectionId = crypto.randomUUID()

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })

    connections.set(connectionId, reply)

    const lifetimeTimer = setTimeout(() => {
      connections.delete(connectionId)
      reply.raw.end()
    }, 4 * 60 * 60 * 1000)

    writeSseEvent(reply, 'connection-established', {
      connectedAt: new Date().toISOString()
    })

    const heartbeatInterval = setInterval(() => {
      try {
        if (reply.raw.destroyed || reply.raw.writableEnded) {
          connections.delete(connectionId)
          clearInterval(heartbeatInterval)
          return
        }
        writeSseEvent(reply, 'heartbeat', { at: new Date().toISOString() })
      } catch (err) {
        request.log.warn({ err, connectionId }, 'SSE heartbeat write failed — removing client')
        connections.delete(connectionId)
        clearInterval(heartbeatInterval)
      }
    }, HEARTBEAT_MS)

    request.raw.on('close', () => {
      connections.delete(connectionId)
      clearInterval(heartbeatInterval)
      clearTimeout(lifetimeTimer)
    })
  })
}

module.exports = sseRoutes
