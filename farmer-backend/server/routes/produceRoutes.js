'use strict'

const { randomUUID } = require('node:crypto')
const MarketWeek = require('../models/MarketWeek')
const WeeklyProduceItem = require('../models/WeeklyProduceItem')
const ProductCatalogue = require('../models/ProductCatalogue')
const CustomerOrder = require('../models/CustomerOrder')
const WalletEngine = require('../modules/walletEngine')
const { enforceActionAllowed } = require('../modules/stateMachine')
const {
  AppError,
  ActionNotAllowedError,
  MarketWeekNotFoundError,
  WalletInsufficientError
} = require('../lib/errors')

const PRODUCE_UNITS = ['kg', 'piece', 'bunch', '100g']

/**
 * @param {object} row
 * @param {object|null} product
 */
function toProduceItemResponse (row, product) {
  return {
    produceItemId: row.produce_item_id,
    productId: row.product_id,
    nameEn: product?.name_en ?? '',
    nameTa: product?.name_ta ?? null,
    unit: row.unit,
    pricePerUnit: row.price_per_unit,
    displayOrder: row.display_order
  }
}

/**
 * @param {string} weekId
 * @returns {Promise<object>}
 */
async function loadMarketWeek (weekId) {
  const week = await MarketWeek.findOne({ week_id: weekId }).lean()
  if (!week) {
    throw new MarketWeekNotFoundError(`Market week not found: ${weekId}`, { weekId })
  }
  return week
}

/**
 * @param {object} order
 * @param {import('fastify').FastifyBaseLogger} log
 * @returns {string}
 */
function requireConfirmedOrderWalletTxnId (order, log) {
  if (!order.wallet_txn_id) {
    log.error(
      { orderId: order.order_id },
      'confirmed order missing wallet_txn_id — data integrity error'
    )
    throw new AppError(
      'INTERNAL_ERROR',
      500,
      'confirmed order missing wallet_txn_id — data integrity error',
      { orderId: order.order_id }
    )
  }
  return order.wallet_txn_id
}

/**
 * @param {number} orderedQty
 * @param {number} pricePerUnit
 * @returns {number}
 */
function computeLineValuePaise (orderedQty, pricePerUnit) {
  const lineValue = orderedQty * pricePerUnit
  if (!Number.isInteger(lineValue) || lineValue < 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Line value must be a non-negative integer (paise)',
      { orderedQty, pricePerUnit }
    )
  }
  return lineValue
}

/**
 * @param {object} order
 * @param {string} weekId
 * @param {string} changedProductId
 * @param {number} newPricePaise
 * @param {Map<string, number>} producePriceByProduct
 * @returns {number}
 */
function computeNewOrderValuePaise (
  order,
  changedProductId,
  newPricePaise,
  producePriceByProduct
) {
  let total = 0
  for (const li of order.line_items) {
    let price = producePriceByProduct.get(li.product_id)
    if (li.product_id === changedProductId) {
      price = newPricePaise
    }
    if (price == null) {
      price = li.price_per_unit
    }
    total += computeLineValuePaise(li.ordered_qty, price)
  }
  return total
}

/**
 * @param {string} weekId
 * @param {string} itemId
 * @param {number} newPricePaise
 * @param {import('mongodb').Db} db
 * @param {typeof WalletEngine} walletEngine
 * @param {string} operatorId
 * @param {string} changedProductId
 * @param {import('fastify').FastifyInstance} fastify
 * @returns {Promise<Array<{ orderId: string, customerId: string, newStatus: string, newOrderValue: number }>>}
 */
async function applyPriceChangeSideEffects (
  weekId,
  itemId,
  newPricePaise,
  db,
  walletEngine,
  operatorId,
  changedProductId,
  fastify
) {
  const produceRows = await WeeklyProduceItem.find({ week_id: weekId })
    .select('product_id price_per_unit')
    .lean()
  const producePriceByProduct = new Map(
    produceRows.map(row => [row.product_id, row.price_per_unit])
  )
  producePriceByProduct.set(changedProductId, newPricePaise)

  const orders = await CustomerOrder.find({
    week_id: weekId,
    status: 'confirmed',
    'line_items.product_id': changedProductId
  }).lean()

  const affectedOrders = []

  for (const order of orders) {
    const newOrderValue = computeNewOrderValuePaise(
      order,
      changedProductId,
      newPricePaise,
      producePriceByProduct
    )
    const delta = newOrderValue - order.order_value

    if (delta === 0) {
      continue
    }

    const orderId = order.order_id
    const customerId = order.customer_id
    let newStatus = 'confirmed'
    let walletDebited = order.wallet_debited
    let walletTxnId = order.wallet_txn_id ?? null

    if (delta > 0) {
      let debitSucceeded = false
      try {
        await walletEngine.debitForOrder({
          idempotencyKey: randomUUID(),
          customerId,
          orderId,
          weekId,
          amount: delta,
          createdBy: operatorId
        })
        walletDebited = order.wallet_debited + delta
        debitSucceeded = true
      } catch (err) {
        if (!(err instanceof WalletInsufficientError)) {
          throw err
        }
      }

      if (!debitSucceeded) {
        await reverseOriginalOrderDebit(order, walletEngine, operatorId, fastify.log)
        newStatus = 'pending_payment'
        walletDebited = 0
        walletTxnId = null
      }
    } else if (delta < 0 && order.wallet_debited > 0) {
      const originalDebitTxnId = requireConfirmedOrderWalletTxnId(order, fastify.log)
      const session = fastify.mongo.client.startSession()
      try {
        await session.withTransaction(async () => {
          await walletEngine.reverseOrderDebit({
            idempotencyKey: randomUUID(),
            customerId,
            originalDebitTxnId,
            orderId,
            createdBy: operatorId,
            session
          })
          const result = await walletEngine.debitForOrder({
            idempotencyKey: randomUUID(),
            customerId,
            orderId,
            weekId,
            amount: newOrderValue,
            createdBy: operatorId,
            session
          })
          await db.collection('customer_orders').updateOne(
            { order_id: orderId, week_id: weekId },
            {
              $set: {
                order_value: newOrderValue,
                wallet_txn_id: result.txnId,
                wallet_debited: newOrderValue,
                status: 'confirmed',
                pending_reason: null,
                balance_due: 0
              }
            },
            { session }
          )
        })
      } finally {
        await session.endSession()
      }

      walletDebited = newOrderValue
      newStatus = 'confirmed'
      affectedOrders.push({
        orderId,
        customerId,
        newStatus,
        newOrderValue
      })
      continue
    }

    const orderUpdate = {
      order_value: newOrderValue,
      wallet_debited: walletDebited,
      wallet_txn_id: walletTxnId,
      status: newStatus
    }
    if (newStatus === 'pending_payment') {
      orderUpdate.pending_reason = 'Price change — wallet shortfall'
      orderUpdate.balance_due = newOrderValue
    } else {
      orderUpdate.pending_reason = null
      orderUpdate.balance_due = 0
    }

    await CustomerOrder.updateOne(
      { order_id: orderId, week_id: weekId },
      { $set: orderUpdate }
    )

    affectedOrders.push({
      orderId,
      customerId,
      newStatus,
      newOrderValue
    })
  }

  return affectedOrders
}

/**
 * @param {object} order
 * @param {typeof WalletEngine} walletEngine
 * @param {string} operatorId
 */
async function reverseOriginalOrderDebit (order, walletEngine, operatorId, log) {
  const originalDebitTxnId = requireConfirmedOrderWalletTxnId(order, log)
  await walletEngine.reverseOrderDebit({
    idempotencyKey: randomUUID(),
    customerId: order.customer_id,
    originalDebitTxnId,
    orderId: order.order_id,
    createdBy: operatorId
  })
}

/**
 * @param {object} body
 * @returns {'delete_produce_item'|'edit_produce_price'|null}
 */
function resolvePatchProduceAction (body) {
  if (body?.active === false) {
    return 'delete_produce_item'
  }
  if (body?.pricePerUnit != null || body?.displayOrder != null) {
    return 'edit_produce_price'
  }
  return null
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function produceRoutes (fastify) {
  fastify.get('/weeks/:weekId/produce', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: {
          weekId: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request) => {
    const { weekId } = request.params
    const week = await loadMarketWeek(weekId)

    const filter = { week_id: weekId }
    if (week.state === 'setup' || week.state === 'open') {
      filter.active = true
    }

    const produceItems = await WeeklyProduceItem.find(filter)
      .sort({ display_order: 1 })
      .lean()

    const productIds = [...new Set(produceItems.map(row => row.product_id))]
    const products = await ProductCatalogue.find({
      product_id: { $in: productIds }
    }).lean()
    const productById = new Map(products.map(p => [p.product_id, p]))

    return {
      items: produceItems.map(row =>
        toProduceItemResponse(row, productById.get(row.product_id) ?? null)
      )
    }
  })

  fastify.post('/weeks/:weekId/produce', {
    config: { action: 'add_produce_item' },
    schema: {
      params: {
        type: 'object',
        required: ['weekId'],
        properties: {
          weekId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        required: ['productId', 'unit', 'pricePerUnit', 'displayOrder'],
        additionalProperties: false,
        properties: {
          productId: { type: 'string', minLength: 1 },
          unit: { type: 'string', enum: PRODUCE_UNITS },
          pricePerUnit: { type: 'integer', exclusiveMinimum: 0 },
          displayOrder: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request, reply) => {
    const { weekId } = request.params
    const { productId, unit, pricePerUnit, displayOrder } = request.body

    await loadMarketWeek(weekId)

    const catalogueProduct = await ProductCatalogue.findOne({
      product_id: productId,
      active: true
    }).lean()
    if (!catalogueProduct) {
      throw new AppError(
        'PRODUCT_NOT_FOUND',
        400,
        `Product not found in catalogue: ${productId}`,
        { productId }
      )
    }

    const produceItemId = randomUUID()
    try {
      const doc = await WeeklyProduceItem.create({
        produce_item_id: produceItemId,
        week_id: weekId,
        product_id: productId,
        unit,
        price_per_unit: pricePerUnit,
        display_order: displayOrder,
        created_by: request.user.uid,
        active: true
      })

      return reply.code(201).send(
        toProduceItemResponse(doc.toObject(), catalogueProduct)
      )
    } catch (err) {
      if (err?.code === 11000) {
        return reply.code(409).send({
          code: 'DUPLICATE_PRODUCE_ITEM',
          httpStatus: 409,
          message: 'Produce item already exists for this product in this week',
          details: { weekId, productId }
        })
      }
      throw err
    }
  })

  fastify.patch('/weeks/:weekId/produce/:itemId', {
    schema: {
      params: {
        type: 'object',
        required: ['weekId', 'itemId'],
        properties: {
          weekId: { type: 'string', minLength: 1 },
          itemId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pricePerUnit: { type: 'integer', exclusiveMinimum: 0 },
          displayOrder: { type: 'integer', minimum: 0 },
          active: { type: 'boolean', enum: [false] }
        }
      }
    }
  }, async (request) => {
    const { weekId, itemId } = request.params
    const body = request.body ?? {}
    const operatorId = request.user.uid

    if (Object.keys(body).length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'At least one of pricePerUnit, displayOrder, or active must be provided',
        {}
      )
    }

    const week = await loadMarketWeek(weekId)
    const patchAction = resolvePatchProduceAction(body)
    if (!patchAction) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Invalid patch body',
        { body }
      )
    }

    try {
      enforceActionAllowed(patchAction, week.state, { weekId })
    } catch (err) {
      if (err instanceof ActionNotAllowedError) {
        throw err
      }
      throw err
    }

    const produceItem = await WeeklyProduceItem.findOne({
      produce_item_id: itemId,
      week_id: weekId
    })
    if (!produceItem) {
      throw new AppError(
        'PRODUCE_ITEM_NOT_FOUND',
        404,
        `Produce item not found: ${itemId}`,
        { weekId, itemId }
      )
    }

    const product = await ProductCatalogue.findOne({
      product_id: produceItem.product_id
    }).lean()

    const isSoftDelete = body.active === false
    const isPriceChange =
      !isSoftDelete && body.pricePerUnit != null && week.state === 'open'

    const updateFields = {}
    if (body.pricePerUnit != null) {
      updateFields.price_per_unit = body.pricePerUnit
    }
    if (body.displayOrder != null) {
      updateFields.display_order = body.displayOrder
    }
    if (isSoftDelete) {
      updateFields.active = false
    }

    if (Object.keys(updateFields).length > 0) {
      Object.assign(produceItem, updateFields)
      await produceItem.save()
    }

    if (isPriceChange) {
      const affectedOrders = await applyPriceChangeSideEffects(
        weekId,
        itemId,
        body.pricePerUnit,
        fastify.db,
        WalletEngine,
        operatorId,
        produceItem.product_id,
        fastify
      )

      return {
        ok: true,
        produceItemId: itemId,
        pricePerUnit: body.pricePerUnit,
        affectedOrders
      }
    }

    return toProduceItemResponse(
      produceItem.toObject(),
      product
    )
  })
}

module.exports = produceRoutes
