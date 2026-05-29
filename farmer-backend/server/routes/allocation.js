'use strict'

const { runAllocationForWeek } = require('../modules/allocation/allocationService')

async function allocationRoutes (fastify, _opts) {
  fastify.post('/allocation/run/:week_id', async (request, reply) => {
    const { week_id } = request.params

    await runAllocationForWeek(week_id)

    return reply.send({ message: 'Allocation completed successfully' })
  })
}

module.exports = allocationRoutes
