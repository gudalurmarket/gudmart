'use strict'

const InboundMessage = require('../../models/InboundMessage')
const MarketWeek = require('../../models/MarketWeek')
const { buildInboundParseFields } = require('../parserService')

/**
 * @param {unknown} body Parsed JSON body from Meta WhatsApp webhook POST
 * @returns {Promise<void>}
 */
async function processIncomingWebhook (_body) {
  const body = _body
  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
  if (!messages || messages.length === 0) return

  const msg = messages[0]
  const message_id = msg.id
  const sender_phone = msg.from
  const message_type = msg.type
  const message_text = msg.text?.body || null
  const timestamp = new Date(Number(msg.timestamp) * 1000)

  const media_type =
    message_type === 'text'
      ? 'text'
      : message_type === 'audio'
        ? 'audio'
        : message_type === 'image'
          ? 'image'
          : 'other'

  let parse_status = 'manual_required'
  if (message_type === 'audio') {
    parse_status = 'voice_note'
  } else if (message_type === 'image') {
    parse_status = 'image'
  }

  const activeWeek = await MarketWeek.findOne({ state: 'open' })
  const week_id = activeWeek ? activeWeek.week_id : null

  if (!week_id) {
    parse_status = 'no_active_week'
  }

  const parseFields = buildInboundParseFields({
    body: message_text,
    media_type,
    week_id,
    parse_status
  })

  const inboundMessage = {
    message_id,
    week_id,
    sender_phone,
    body: message_text,
    media_type,
    fcfs_timestamp: timestamp,
    parse_status: week_id ? parseFields.parse_status : parse_status,
    parsed_items: parseFields.parsed_items,
    created_by: 'system'
  }

  try {
    await InboundMessage.create(inboundMessage)
  } catch (err) {
    if (err.code === 11000) return
    throw err
  }
}

module.exports = {
  processIncomingWebhook
}
