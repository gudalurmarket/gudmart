'use strict'

const crypto = require('crypto')
const { parseMessage, getSynonymCache } = require('../modules/parser')
const { pushToAllClients } = require('../modules/sse')
const InboundMessage = require('../models/InboundMessage')
const Customer = require('../models/Customer')
const MarketWeek = require('../models/MarketWeek')
const WeeklyProduceItem = require('../models/WeeklyProduceItem')
const ProductCatalogue = require('../models/ProductCatalogue')

const ACTIVE_WEEK_STATES = ['open', 'locked', 'delivery']
const CONFIDENCE_RANK = { clean: 3, partial: 2, manual_required: 1 }

/**
 * @param {string | undefined} signatureHeader
 * @param {Buffer | string} rawBody
 * @returns {boolean}
 */
function verifyHubSignature (signatureHeader, rawBody) {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !signatureHeader || typeof signatureHeader !== 'string') {
    return false
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const receivedBuf = Buffer.from(signatureHeader)
  if (expectedBuf.length !== receivedBuf.length) {
    return false
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

/**
 * @param {string} whatsappType
 * @returns {'text' | 'audio' | 'image' | 'other'}
 */
function normalizeMediaType (whatsappType) {
  if (whatsappType === 'text' || whatsappType === 'audio' || whatsappType === 'image') {
    return whatsappType
  }
  return 'other'
}

/**
 * @param {Array<{ confidence: string }>} parsedItems
 * @returns {'clean' | 'partial' | 'manual_required'}
 */
function highestParserConfidence (parsedItems) {
  if (!parsedItems.length) return 'manual_required'

  let best = 'manual_required'
  let rank = 0
  for (const item of parsedItems) {
    const score = CONFIDENCE_RANK[item.confidence] ?? 0
    if (score > rank) {
      rank = score
      best = item.confidence
    }
  }
  return best
}

/**
 * @param {Array<{
 *   rawText: string,
 *   productId: string | null,
 *   rawProductText: string | null,
 *   quantity: number | null,
 *   unit: string | null,
 *   confidence: string
 * }>} parsedItems
 * @returns {object[]}
 */
function toInboundParsedItems (parsedItems) {
  return parsedItems.map((item) => ({
    raw_text: item.rawText,
    product_id: item.productId,
    raw_product_text: item.rawProductText,
    quantity: item.quantity,
    unit: item.unit,
    confidence: item.confidence
  }))
}

/**
 * @param {string} weekId
 * @returns {Promise<Array<{ product_id: string, name_en: string, name_ta?: string | null, unit: string }>>}
 */
async function loadProduceList (weekId) {
  const produceRows = await WeeklyProduceItem.find({ week_id: weekId })
    .sort({ display_order: 1 })
    .lean()

  if (produceRows.length === 0) return []

  const productIds = produceRows.map((row) => row.product_id)
  const products = await ProductCatalogue.find({
    product_id: { $in: productIds },
    active: true
  }).lean()
  const productById = new Map(products.map((p) => [p.product_id, p]))

  return produceRows.map((row) => {
    const product = productById.get(row.product_id)
    return {
      product_id: row.product_id,
      name_en: product?.name_en ?? row.product_id,
      name_ta: product?.name_ta ?? null,
      unit: row.unit
    }
  })
}

/**
 * @param {import('fastify').FastifyBaseLogger} log
 * @param {unknown} synonymCache
 * @param {unknown} payload
 */
async function processWebhookPayload (log, synonymCache, payload) {
  const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages
  if (!messages || messages.length === 0) return

  const msg = messages[0]
  const message_id = msg.id
  const sender_phone = msg.from
  const body = msg.text?.body ?? null
  const media_type = normalizeMediaType(msg.type)
  const fcfs_timestamp = new Date(parseInt(msg.timestamp, 10) * 1000)
  const created_at = new Date()

  const existing = await InboundMessage.findOne({ message_id }).lean()
  if (existing) {
    log.debug({ message_id }, 'Duplicate WhatsApp message_id — skipping')
    return
  }

  let customer_id = null
  let parse_status = 'manual_required'

  const customer = await Customer.findOne({ phone: sender_phone, active: true }).lean()
  if (customer) {
    customer_id = customer.customer_id
  }

  let week_id = null
  let produceList = []

  const activeWeek = await MarketWeek.findOne({
    state: { $in: ACTIVE_WEEK_STATES }
  }).lean()

  if (activeWeek) {
    week_id = activeWeek.week_id
    produceList = await loadProduceList(week_id)
  } else {
    parse_status = 'no_active_week'
  }

  let parsed_items = []

  if (media_type === 'audio') {
    parse_status = 'voice_note'
    parsed_items = []
  } else if (media_type === 'image') {
    parse_status = 'image'
    parsed_items = []
  } else if (media_type === 'text' && customer_id && week_id) {
    const parsed = parseMessage(body, produceList, synonymCache)
    parsed_items = toInboundParsedItems(parsed)
    parse_status = highestParserConfidence(parsed)
  } else if (parse_status !== 'no_active_week') {
    parse_status = 'manual_required'
    parsed_items = []
  }

  try {
    await InboundMessage.create({
      message_id,
      sender_phone,
      customer_id,
      week_id,
      body,
      media_type,
      fcfs_timestamp,
      parse_status,
      parsed_items,
      queue_status: 'pending',
      created_at,
      created_by: 'system'
    })
  } catch (err) {
    if (err.code === 11000) {
      log.debug({ message_id }, 'Duplicate WhatsApp message_id on insert — skipping')
      return
    }
    throw err
  }

  pushToAllClients('new-message', {
    messageId: message_id,
    weekId: week_id,
    customerId: customer_id,
    queueStatus: 'pending',
    fcfsTimestamp: fcfs_timestamp.toISOString()
  })
}

async function webhookRoutes (fastify, _opts) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (req, body, done) {
      req.rawBody = body
      try {
        const json = JSON.parse(body.toString('utf8'))
        done(null, json)
      } catch (err) {
        done(err)
      }
    }
  )

  fastify.get('/webhook/whatsapp', async (request, reply) => {
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

    return reply.code(403).send()
  })

  fastify.post('/webhook/whatsapp', async (request, reply) => {
    const rawBody = request.rawBody
    if (!rawBody || !verifyHubSignature(request.headers['x-hub-signature-256'], rawBody)) {
      return reply.code(403).send()
    }

    reply.code(200).send()

    const payload = request.body
    const synonymCache = getSynonymCache()
    const log = request.log

    setImmediate(() => {
      processWebhookPayload(log, synonymCache, payload).catch((err) => {
        const message_id =
          payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ?? 'unknown'
        log.error({ err, message_id }, 'WhatsApp webhook async processing failed')
      })
    })
  })
}

module.exports = webhookRoutes
