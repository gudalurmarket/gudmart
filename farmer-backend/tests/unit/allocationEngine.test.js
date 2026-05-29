'use strict'

const CustomerOrder = require('../../server/models/CustomerOrder')
const WeeklyProduceItem = require('../../server/models/WeeklyProduceItem')
const { allocate } = require('../../server/modules/fcfs/allocationEngine')

const WEEK_ID = 'week-fcfs-adapter-001'
const PRODUCE_ITEM_ID = 'produce-tomato-adapter'
const PRODUCT_ID = 'product-tomato-adapter'
const CREATED_BY = 'test-operator'

function fcfsDate (offsetMs) {
  return new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + offsetMs)
}

describe('allocationEngine adapter', () => {
  beforeEach(async () => {
    await CustomerOrder.deleteMany({ week_id: WEEK_ID })
    await WeeklyProduceItem.deleteMany({ week_id: WEEK_ID })
  })

  it('delegates to fcfsEngine and maps allocation field names', async () => {
    await WeeklyProduceItem.create({
      produce_item_id: PRODUCE_ITEM_ID,
      week_id: WEEK_ID,
      product_id: PRODUCT_ID,
      unit: 'kg',
      price_per_unit: 5000,
      display_order: 1,
      created_by: CREATED_BY
    })

    await CustomerOrder.create({
      order_id: 'order-early',
      week_id: WEEK_ID,
      customer_id: 'cust-early',
      status: 'confirmed',
      fcfs_timestamp: fcfsDate(0),
      order_value: 10000,
      wallet_debited: 10000,
      balance_due: 0,
      balance_cleared: false,
      line_items: [{
        line_item_id: 'line-early',
        product_id: PRODUCT_ID,
        ordered_qty: 2,
        delivered_qty: 0,
        unit: 'kg',
        price_per_unit: 5000,
        line_value: 10000,
        difference_confirmed: false
      }],
      created_by: CREATED_BY
    })

    const { allocations, shortfall } = await allocate({
      weekId: WEEK_ID,
      produceItemId: PRODUCE_ITEM_ID,
      availableQty: 1
    })

    expect(shortfall).toBe(true)
    expect(allocations[0]).toMatchObject({
      order_id: 'order-early',
      item_id: PRODUCE_ITEM_ID,
      allocated_qty: 1,
      requested_qty: 2,
      unit: 'kg'
    })
  })
})
