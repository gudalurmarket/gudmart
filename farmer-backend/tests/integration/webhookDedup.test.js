'use strict'

require('./helpers/setup')

const Customer = require('../../server/models/Customer')
const InboundMessage = require('../../server/models/InboundMessage')
const {
  seedWeek,
  seedCustomer,
  buildWhatsAppPayload,
  postWebhook,
  waitForInboundMessage
} = require('./helpers/setup')

describe('POST /webhook/whatsapp', () => {
  it('silently discards duplicate message_id (single InboundMessage)', async () => {
    const { weekId } = await seedWeek('open')
    const waPhone = `919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
    const { customerId } = await seedCustomer(0)
    await Customer.updateOne(
      { customer_id: customerId },
      { $set: { phone: waPhone } }
    )
    const messageId = 'wamid-test-001'

    const payload = buildWhatsAppPayload({
      messageId,
      from: waPhone
    })

    const first = await postWebhook(payload)
    const second = await postWebhook(payload)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)

    await waitForInboundMessage(messageId)

    const count = await InboundMessage.countDocuments({ message_id: messageId })
    expect(count).toBe(1)

    const doc = await InboundMessage.findOne({ message_id: messageId }).lean()
    expect(doc.week_id).toBe(weekId)
  })

  it('persists InboundMessage for unknown sender with customer_id null', async () => {
    await seedWeek('open')
    const messageId = 'wamid-unknown-sender-001'
    const unknownPhone = '919999888877'

    const payload = buildWhatsAppPayload({
      messageId,
      from: unknownPhone,
      body: 'xyz unknown product'
    })

    const res = await postWebhook(payload)
    expect(res.statusCode).toBe(200)

    const doc = await waitForInboundMessage(messageId)
    expect(doc).not.toBeNull()
    expect(doc.customer_id).toBeNull()
    expect(doc.parse_status).toBe('manual_required')
  })
})
