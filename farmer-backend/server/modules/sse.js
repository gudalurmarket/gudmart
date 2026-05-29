'use strict'

/** @type {Map<string, import('fastify').FastifyReply>} */
const connections = new Map()

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function formatSseChunk (eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
}

/**
 * Push an SSE event to all connected intake-queue clients.
 * @param {string} eventName
 * @param {Record<string, unknown>} payload
 */
function pushToAllClients (eventName, payload) {
  const chunk = formatSseChunk(eventName, payload)

  for (const [connectionId, reply] of connections) {
    try {
      if (reply.raw.destroyed || reply.raw.writableEnded) {
        connections.delete(connectionId)
        continue
      }
      reply.raw.write(chunk)
    } catch (err) {
      console.warn({ err, connectionId }, 'SSE push failed — removing client')
      connections.delete(connectionId)
    }
  }
}

module.exports = {
  connections,
  pushToAllClients
}
