'use strict'

async function authRoutes (fastify) {
  fastify.post('/auth/verify', {
    schema: {
      body: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            uid: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['operator', 'volunteer'] }
          },
          required: ['uid', 'email', 'role']
        }
      }
    }
  }, async (request) => {
    return {
      uid: request.user.uid,
      email: request.user.email,
      role: request.user.role
    }
  })
}

module.exports = authRoutes
