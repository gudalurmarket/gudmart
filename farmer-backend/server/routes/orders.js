'use strict'

const InboundMessage = require('../models/InboundMessage')
const mongoose = require('mongoose')

module.exports = async function (fastify) {

  fastify.post('/orders/from-inbound/:message_id', async (request, reply) => {
    const { message_id } = request.params

    // 1. Fetch inbound message
    const inbound = await InboundMessage.findOne({ message_id })

    if (!inbound) {
      return reply.code(404).send({ error: 'Inbound message not found' })
    }

    // 2. Validate
    if (inbound.queue_status !== 'approved') {
      return reply.code(400).send({ error: 'Message not approved' })
    }

    if (!inbound.parsed_items || inbound.parsed_items.length === 0) {
      return reply.code(400).send({ error: 'No parsed items found' })
    }

    // 3. Build order
    const order = {
      order_id: new mongoose.Types.ObjectId().toString(),
      week_id: inbound.week_id,
      customer_id: inbound.customer_id,
      items: inbound.parsed_items.map(item => ({
        product_id: item.product_id || null,
        quantity: item.quantity,
        unit: item.unit
      })),
      created_at: new Date()
    }

    // 4. Save to DB
    const db = mongoose.connection.db
    const result = await db.collection('customer_orders').insertOne(order)

    return reply.send(result.ops ? result.ops[0] : order)
  })
}