'use strict'

const InboundMessage = require('../models/InboundMessage')

async function inboundQueueRoutes (fastify, _opts) {
  fastify.get('/inbound/pending', async () => {
    return InboundMessage.find({ queue_status: 'pending' })
      .sort({ fcfs_timestamp: 1 })
      .lean()
  })

  fastify.patch('/inbound/:message_id/approve', async (request, reply) => {
    const doc = await InboundMessage.findOneAndUpdate(
      { message_id: request.params.message_id },
      { queue_status: 'approved', processed_at: new Date() },
      { new: true }
    )
    if (!doc) {
      return reply.code(404).send({ error: 'Message not found' })
    }
    return doc
  })

  fastify.patch('/inbound/:message_id/reject', async (request, reply) => {
    const doc = await InboundMessage.findOneAndUpdate(
      { message_id: request.params.message_id },
      { queue_status: 'rejected', processed_at: new Date() },
      { new: true }
    )
    if (!doc) {
      return reply.code(404).send({ error: 'Message not found' })
    }
    return doc
  })
}

module.exports = inboundQueueRoutes
