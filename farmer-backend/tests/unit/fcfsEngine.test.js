'use strict'

const mongoose = require('mongoose')
const CustomerOrder = require('../../server/models/CustomerOrder')
const WeeklyProduceItem = require('../../server/models/WeeklyProduceItem')
const { AppError } = require('../../server/lib/errors')
const {
  runFcfsAllocation,
  sortByFcfs,
  allocate,
  roundQty
} = require('../../server/modules/fcfsEngine')

const WEEK_ID = 'week-fcfs-engine-001'
const PRODUCT_ID = 'product-fcfs-engine-tomato'
const ORDER_PREFIX = 'fcfs-engine'
const CREATED_BY = 'test-operator'

const db = { CustomerOrder, WeeklyProduceItem }

function fcfsDate (offsetMs) {
  return new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + offsetMs)
}

async function createProduceItem ({ unit = 'kg' } = {}) {
  await WeeklyProduceItem.create({
    produce_item_id: `produce-${PRODUCT_ID}`,
    week_id: WEEK_ID,
    product_id: PRODUCT_ID,
    unit,
    price_per_unit: 5000,
    display_order: 1,
    created_by: CREATED_BY
  })
}

async function createConfirmedOrder ({
  orderId,
  fcfsTimestamp,
  orderedQty,
  unit = 'kg',
  status = 'confirmed'
}) {
  const fullOrderId = `${ORDER_PREFIX}-${orderId}`
  const lineValue = Math.round(orderedQty * 5000)
  return CustomerOrder.create({
    order_id: fullOrderId,
    week_id: WEEK_ID,
    customer_id: `cust-${fullOrderId}`,
    status,
    fcfs_timestamp: fcfsTimestamp,
    order_value: lineValue,
    wallet_debited: lineValue,
    balance_due: 0,
    balance_cleared: false,
    line_items: [{
      line_item_id: `line-${fullOrderId}`,
      product_id: PRODUCT_ID,
      ordered_qty: orderedQty,
      delivered_qty: 0,
      unit,
      price_per_unit: 5000,
      line_value: lineValue,
      difference_confirmed: false
    }],
    created_by: CREATED_BY
  })
}

async function readDeliveredQty (orderId) {
  const doc = await CustomerOrder.findOne({ order_id: `${ORDER_PREFIX}-${orderId}` }).lean()
  return doc.line_items.find((l) => l.product_id === PRODUCT_ID).delivered_qty
}

describe('fcfsEngine', () => {
  beforeEach(async () => {
    await CustomerOrder.deleteMany({ week_id: WEEK_ID })
    await WeeklyProduceItem.deleteMany({ week_id: WEEK_ID })
  })

  describe('sortByFcfs', () => {
    it('sorts ascending by fcfs_timestamp', () => {
      const input = [
        { order_id: 'late', fcfs_timestamp: fcfsDate(2000), _id: 'c' },
        { order_id: 'early', fcfs_timestamp: fcfsDate(0), _id: 'a' },
        { order_id: 'mid', fcfs_timestamp: fcfsDate(1000), _id: 'b' }
      ]
      expect(sortByFcfs(input).map((o) => o.order_id)).toEqual(['early', 'mid', 'late'])
    })

    it('tie-breaks equal timestamps by _id ASC', () => {
      const ts = fcfsDate(0)
      const input = [
        { order_id: 'z', fcfs_timestamp: ts, _id: '000000000000000000000003' },
        { order_id: 'a', fcfs_timestamp: ts, _id: '000000000000000000000001' },
        { order_id: 'm', fcfs_timestamp: ts, _id: '000000000000000000000002' }
      ]
      expect(sortByFcfs(input).map((o) => o.order_id)).toEqual(['a', 'm', 'z'])
    })
  })

  describe('roundQty', () => {
    it('rounds weight units to two decimal places', () => {
      expect(roundQty(1.234, 'kg')).toBe(1.23)
      expect(roundQty(1.235, 'kg')).toBe(1.24)
      expect(roundQty(1.236, '100g')).toBe(1.24)
    })

    it('floors count units', () => {
      expect(roundQty(3.9, 'piece')).toBe(3)
      expect(roundQty(2.1, 'bunch')).toBe(2)
    })
  })

  describe('allocate (pure)', () => {
    const unit = 'kg'
    const productId = PRODUCT_ID

    it('allocates in FCFS order until stock is exhausted', () => {
      const sorted = [
        {
          order_id: 'early',
          customer_id: 'c1',
          line_items: [{ product_id: productId, ordered_qty: 2 }]
        },
        {
          order_id: 'late',
          customer_id: 'c2',
          line_items: [{ product_id: productId, ordered_qty: 2 }]
        }
      ]

      const rows = allocate(sorted, 3, unit, productId)
      expect(rows).toEqual([
        { customerId: 'c1', orderId: 'early', allocatedQty: 2, requestedQty: 2, unit },
        { customerId: 'c2', orderId: 'late', allocatedQty: 1, requestedQty: 2, unit }
      ])
    })
  })

  describe('runFcfsAllocation', () => {
    it('throws PRODUCE_ITEM_NOT_FOUND when product is not on the week list', async () => {
      await expect(
        runFcfsAllocation(WEEK_ID, 'missing-product', 5, db)
      ).rejects.toThrow(AppError)
    })

    it('allocates to earlier fcfs_timestamp before later orders when stock is short', async () => {
      await createProduceItem()
      await createConfirmedOrder({ orderId: 'order-late', fcfsTimestamp: fcfsDate(2000), orderedQty: 2 })
      await createConfirmedOrder({ orderId: 'order-mid', fcfsTimestamp: fcfsDate(1000), orderedQty: 2 })
      await createConfirmedOrder({ orderId: 'order-early', fcfsTimestamp: fcfsDate(0), orderedQty: 2 })

      const { allocated, shortfall } = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 3, db)

      expect(shortfall).toBe(true)
      const byOrder = Object.fromEntries(allocated.map((r) => [r.orderId, r.allocatedQty]))
      expect(byOrder[`${ORDER_PREFIX}-order-early`]).toBe(2)
      expect(byOrder[`${ORDER_PREFIX}-order-mid`]).toBe(1)
      expect(byOrder[`${ORDER_PREFIX}-order-late`]).toBe(0)
      expect(await readDeliveredQty('order-early')).toBe(2)
      expect(await readDeliveredQty('order-mid')).toBe(1)
      expect(await readDeliveredQty('order-late')).toBe(0)
    })

    it('includes only confirmed orders containing the product', async () => {
      await createProduceItem()
      await createConfirmedOrder({ orderId: 'order-confirmed', fcfsTimestamp: fcfsDate(0), orderedQty: 1 })
      await createConfirmedOrder({
        orderId: 'order-pending',
        fcfsTimestamp: fcfsDate(500),
        orderedQty: 5,
        status: 'pending_payment'
      })

      const { allocated } = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 10, db)

      expect(allocated).toHaveLength(1)
      expect(allocated[0].orderId).toBe(`${ORDER_PREFIX}-order-confirmed`)
    })

    it('returns shortfall false and full ordered_qty when delivered meets demand', async () => {
      await createProduceItem()
      await createConfirmedOrder({ orderId: 'order-a', fcfsTimestamp: fcfsDate(0), orderedQty: 2 })
      await createConfirmedOrder({ orderId: 'order-b', fcfsTimestamp: fcfsDate(1000), orderedQty: 3 })

      const { allocated, shortfall } = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 10, db)

      expect(shortfall).toBe(false)
      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-a`).allocatedQty).toBe(2)
      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-b`).allocatedQty).toBe(3)
      expect(await readDeliveredQty('order-a')).toBe(2)
      expect(await readDeliveredQty('order-b')).toBe(3)
    })

    it('exhausts stock at the cutoff customer and assigns zero below', async () => {
      await createProduceItem()
      await createConfirmedOrder({ orderId: 'order-a', fcfsTimestamp: fcfsDate(0), orderedQty: 4 })
      await createConfirmedOrder({ orderId: 'order-b', fcfsTimestamp: fcfsDate(1000), orderedQty: 4 })

      const { allocated } = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 5, db)

      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-a`).allocatedQty).toBe(4)
      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-b`).allocatedQty).toBe(1)
    })

    it('returns identical allocations when run twice with the same input', async () => {
      await createProduceItem()
      await createConfirmedOrder({ orderId: 'order-1', fcfsTimestamp: fcfsDate(0), orderedQty: 3 })
      await createConfirmedOrder({ orderId: 'order-2', fcfsTimestamp: fcfsDate(1000), orderedQty: 3 })

      const first = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 4, db)
      const second = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 4, db)

      expect(second.allocated).toEqual(first.allocated)
    })

    it('overwrites prior delivered_qty on re-run', async () => {
      await createProduceItem()
      await createConfirmedOrder({ orderId: 'order-1', fcfsTimestamp: fcfsDate(0), orderedQty: 2 })
      await createConfirmedOrder({ orderId: 'order-2', fcfsTimestamp: fcfsDate(1000), orderedQty: 2 })

      await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 10, db)
      expect(await readDeliveredQty('order-1')).toBe(2)
      expect(await readDeliveredQty('order-2')).toBe(2)

      await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 1, db)
      expect(await readDeliveredQty('order-1')).toBe(1)
      expect(await readDeliveredQty('order-2')).toBe(0)
    })

    it('does not update removed orders on re-run', async () => {
      await createProduceItem()
      await createConfirmedOrder({ orderId: 'order-kept', fcfsTimestamp: fcfsDate(0), orderedQty: 1 })
      await createConfirmedOrder({ orderId: 'order-removed', fcfsTimestamp: fcfsDate(1000), orderedQty: 1 })

      await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 5, db)
      await CustomerOrder.deleteOne({ order_id: `${ORDER_PREFIX}-order-removed` })

      const { allocated } = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 5, db)

      expect(allocated).toHaveLength(1)
      expect(allocated[0].orderId).toBe(`${ORDER_PREFIX}-order-kept`)
    })

    it('floors available count stock and partial allocations for piece units', async () => {
      await createProduceItem({ unit: 'piece' })
      await createConfirmedOrder({
        orderId: 'order-pieces-a',
        fcfsTimestamp: fcfsDate(0),
        orderedQty: 3,
        unit: 'piece'
      })
      await createConfirmedOrder({
        orderId: 'order-pieces-b',
        fcfsTimestamp: fcfsDate(1000),
        orderedQty: 3,
        unit: 'piece'
      })

      const { allocated } = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 4.9, db)

      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-pieces-a`).allocatedQty).toBe(3)
      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-pieces-b`).allocatedQty).toBe(1)
    })

    it('rounds weight allocations to two decimal places at the cutoff', async () => {
      await createProduceItem({ unit: 'kg' })
      await createConfirmedOrder({ orderId: 'order-kg-a', fcfsTimestamp: fcfsDate(0), orderedQty: 1 })
      await createConfirmedOrder({ orderId: 'order-kg-b', fcfsTimestamp: fcfsDate(1000), orderedQty: 1 })

      const { allocated } = await runFcfsAllocation(WEEK_ID, PRODUCT_ID, 1.236, db)

      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-kg-a`).allocatedQty).toBe(1)
      expect(allocated.find((r) => r.orderId === `${ORDER_PREFIX}-order-kg-b`).allocatedQty).toBe(0.24)
    })
  })
})
