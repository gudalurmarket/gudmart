'use strict'

const webhookService = require('../whatsapp/webhookService')

async function verifyWebhook (request, reply) {
  const mode = request.query['hub.mode']
  const verifyToken = request.query['hub.verify_token']
  const challenge = request.query['hub.challenge']

  if (
    mode === 'subscribe' &&
    verifyToken === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return reply
      .code(200)
      .type('text/plain')
      .send(challenge != null ? String(challenge) : '')
  }

  return reply.code(403).send({ error: 'WEBHOOK_VERIFICATION_FAILED' })
}

async function receiveWebhook (request, reply) {
  try {
    await webhookService.processIncomingWebhook(request.body)
    return reply.code(200).send({ success: true })
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'WEBHOOK_PROCESSING_FAILED' })
  }
}

module.exports = {
  verifyWebhook,
  receiveWebhook
}
