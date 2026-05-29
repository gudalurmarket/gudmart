'use strict'

const { randomUUID } = require('node:crypto')
const {
  FarmerNotFoundError,
  DuplicatePhoneError
} = require('../lib/errors')

const FARMER_TYPES = ['outstation', 'local']

/**
 * @param {Date|string} value
 * @returns {string}
 */
function toIsoString (value) {
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

/**
 * @param {object} farmer
 */
function toFarmerResponse (farmer) {
  return {
    farmerId: farmer.farmer_id,
    name: farmer.name,
    phone: farmer.phone,
    location: farmer.location,
    farmerType: farmer.farmer_type,
    active: farmer.active,
    createdAt: toIsoString(farmer.created_at)
  }
}

async function farmersRoutes (fastify) {
  const farmers = () => fastify.db.collection('farmers')

  fastify.get('/farmers', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: FARMER_TYPES },
          status: { type: 'string', enum: ['active', 'inactive'] }
        }
      }
    }
  }, async (request) => {
    const filter = {}
    if (request.query.type) filter.farmer_type = request.query.type
    if (request.query.status === 'active') filter.active = true
    if (request.query.status === 'inactive') filter.active = false

    const docs = await farmers()
      .find(filter)
      .sort({ name: 1 })
      .toArray()

    return { farmers: docs.map(toFarmerResponse) }
  })

  fastify.post('/farmers', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'phone', 'location', 'farmerType'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          phone: { type: 'string', minLength: 1 },
          location: { type: 'string', minLength: 1 },
          farmerType: { type: 'string', enum: FARMER_TYPES }
        }
      }
    }
  }, async (request, reply) => {
    const { name, phone, location, farmerType } = request.body
    const trimmedPhone = phone.trim()

    const existing = await farmers().findOne({ phone: trimmedPhone })
    if (existing) {
      throw new DuplicatePhoneError(
        `Phone number already registered: ${trimmedPhone}`,
        { phone: trimmedPhone }
      )
    }

    const doc = {
      farmer_id: randomUUID(),
      name: name.trim(),
      phone: trimmedPhone,
      location: location.trim(),
      farmer_type: farmerType,
      active: true,
      created_at: new Date(),
      created_by: request.user.uid
    }

    await farmers().insertOne(doc)
    return reply.code(201).send(toFarmerResponse(doc))
  })

  fastify.patch('/farmers/:farmerId', {
    schema: {
      params: {
        type: 'object',
        required: ['farmerId'],
        properties: {
          farmerId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          phone: { type: 'string', minLength: 1 },
          location: { type: 'string', minLength: 1 },
          farmerType: { type: 'string', enum: FARMER_TYPES },
          active: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    const { farmerId } = request.params
    const current = await farmers().findOne({ farmer_id: farmerId })
    if (!current) {
      throw new FarmerNotFoundError(`Farmer not found: ${farmerId}`, { farmerId })
    }

    const updates = {}
    if (request.body.name != null) updates.name = request.body.name.trim()
    if (request.body.location != null) updates.location = request.body.location.trim()
    if (request.body.farmerType != null) updates.farmer_type = request.body.farmerType
    if (request.body.active != null) updates.active = request.body.active

    if (request.body.phone != null) {
      const trimmedPhone = request.body.phone.trim()
      if (trimmedPhone !== current.phone) {
        const conflict = await farmers().findOne({
          phone: trimmedPhone,
          farmer_id: { $ne: farmerId }
        })
        if (conflict) {
          throw new DuplicatePhoneError(
            `Phone number already registered: ${trimmedPhone}`,
            { phone: trimmedPhone }
          )
        }
      }
      updates.phone = trimmedPhone
    }

    if (Object.keys(updates).length > 0) {
      await farmers().updateOne({ farmer_id: farmerId }, { $set: updates })
    }

    const updated = await farmers().findOne({ farmer_id: farmerId })
    return toFarmerResponse(updated)
  })
}

module.exports = farmersRoutes
