'use strict'

const { randomUUID } = require('node:crypto')
const WalletEngine = require('../../server/modules/walletEngine')
const Customer = require('../../server/models/Customer')
const WalletTransaction = require('../../server/models/WalletTransaction')
const {
  WalletInsufficientError,
  CustomerNotFoundError
} = require('../../server/lib/errors')

const WEEK_ID = 'week-test-001'
const CREATED_BY = 'system'
const TEST_CREATOR = 'jest-wallet-debit-test'

function debitParams (overrides = {}) {
  return {
    idempotencyKey: randomUUID(),
    customerId: overrides.customerId,
    orderId: overrides.orderId ?? `order-${randomUUID()}`,
    weekId: WEEK_ID,
    amount: overrides.amount ?? 2000,
    createdBy: CREATED_BY,
    ...overrides
  }
}

async function createCustomer ({ customerId, walletBalance }) {
  const unique = randomUUID().replace(/-/g, '').slice(0, 10)
  return Customer.create({
    customer_id: customerId ?? `cust-${randomUUID()}`,
    name: 'Test Customer',
    phone: `+9199${unique}`,
    wallet_balance: walletBalance,
    created_by: TEST_CREATOR
  })
}

async function cleanupWalletTestData () {
  const customers = await Customer.find({ created_by: TEST_CREATOR })
    .select('customer_id')
    .lean()
  const ids = customers.map(c => c.customer_id)
  if (ids.length > 0) {
    await WalletTransaction.deleteMany({ customer_id: { $in: ids } })
  }
  await Customer.deleteMany({ created_by: TEST_CREATOR })
}

describe('WalletEngine.debitForOrder', () => {
  beforeEach(async () => {
    await cleanupWalletTestData()
  })

  describe('successful debit', () => {
    it('debits balance atomically and appends order_debit ledger row with correct running_balance', async () => {
      const customer = await createCustomer({ walletBalance: 10000 })
      const idempotencyKey = randomUUID()
      const amount = 2000

      const result = await WalletEngine.debitForOrder(debitParams({
        idempotencyKey,
        customerId: customer.customer_id,
        amount
      }))

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id }).lean()

      expect(updated.wallet_balance).toBe(8000)
      expect(txns).toHaveLength(1)
      expect(txns[0].type).toBe('order_debit')
      expect(txns[0].running_balance).toBe(8000)
      expect(result).toEqual({ txnId: idempotencyKey, newBalance: 8000 })
      expect(result.txnId).toBe(txns[0].txn_id)
    })
  })

  describe('insufficient balance', () => {
    it('throws WalletInsufficientError without changing balance or ledger', async () => {
      const customer = await createCustomer({ walletBalance: 1000 })

      await expect(
        WalletEngine.debitForOrder(debitParams({
          customerId: customer.customer_id,
          amount: 5000
        }))
      ).rejects.toBeInstanceOf(WalletInsufficientError)

      const unchanged = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id }).lean()

      expect(unchanged.wallet_balance).toBe(1000)
      expect(txns).toHaveLength(0)
    })
  })

  describe('customer not found', () => {
    it('throws CustomerNotFoundError for unknown customerId', async () => {
      await expect(
        WalletEngine.debitForOrder(debitParams({
          customerId: 'non-existent-customer-id'
        }))
      ).rejects.toBeInstanceOf(CustomerNotFoundError)

      expect(await WalletTransaction.countDocuments({})).toBe(0)
    })
  })

  describe('idempotency', () => {
    it('deducts balance only once when the same idempotencyKey is reused', async () => {
      const customer = await createCustomer({ walletBalance: 10000 })
      const idempotencyKey = randomUUID()
      const params = debitParams({
        idempotencyKey,
        customerId: customer.customer_id,
        orderId: 'order-idempotent-1',
        amount: 2000
      })

      const first = await WalletEngine.debitForOrder(params)
      const second = await WalletEngine.debitForOrder(params)

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id }).lean()

      expect(txns).toHaveLength(1)
      expect(first.txnId).toBe(second.txnId)
      expect(first.txnId).toBe(idempotencyKey)
      expect(first.newBalance).toBe(second.newBalance)
      expect(updated.wallet_balance).toBe(8000)
    })
  })

  describe('concurrency', () => {
    it('allows only one debit when two concurrent debits exceed available balance', async () => {
      const customer = await createCustomer({ walletBalance: 3000 })
      const amount = 2000

      const results = await Promise.allSettled([
        WalletEngine.debitForOrder(debitParams({
          customerId: customer.customer_id,
          idempotencyKey: randomUUID(),
          orderId: 'order-concurrent-a',
          amount
        })),
        WalletEngine.debitForOrder(debitParams({
          customerId: customer.customer_id,
          idempotencyKey: randomUUID(),
          orderId: 'order-concurrent-b',
          amount
        }))
      ])

      const fulfilled = results.filter(r => r.status === 'fulfilled')
      const rejected = results.filter(r => r.status === 'rejected')

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(WalletInsufficientError)

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id }).lean()

      expect(updated.wallet_balance).toBeGreaterThanOrEqual(0)
      expect(updated.wallet_balance).toBe(1000)
      expect(txns).toHaveLength(1)

      const initialBalance = 3000
      const deducted = initialBalance - updated.wallet_balance
      expect(deducted).toBeLessThanOrEqual(initialBalance)
      expect(deducted).toBe(amount)
    })
  })

  describe('running balance consistency', () => {
    it('sets running_balance equal to customer wallet_balance after debit', async () => {
      const customer = await createCustomer({ walletBalance: 10000 })

      await WalletEngine.debitForOrder(debitParams({
        customerId: customer.customer_id,
        amount: 2500
      }))

      const latestTxn = await WalletTransaction.findOne({ customer_id: customer.customer_id })
        .sort({ created_at: -1 })
        .lean()
      const refreshed = await Customer.findOne({ customer_id: customer.customer_id }).lean()

      expect(latestTxn.running_balance).toBe(refreshed.wallet_balance)
      expect(latestTxn.running_balance).toBe(7500)
    })
  })

  describe('ledger append-only', () => {
    it('creates distinct immutable transactions for two separate debits', async () => {
      const customer = await createCustomer({ walletBalance: 10000 })
      const key1 = randomUUID()
      const key2 = randomUUID()

      await WalletEngine.debitForOrder(debitParams({
        customerId: customer.customer_id,
        idempotencyKey: key1,
        orderId: 'order-ledger-1',
        amount: 1000
      }))
      await WalletEngine.debitForOrder(debitParams({
        customerId: customer.customer_id,
        idempotencyKey: key2,
        orderId: 'order-ledger-2',
        amount: 1500
      }))

      const txns = await WalletTransaction.find({ customer_id: customer.customer_id })
        .sort({ created_at: 1 })
        .lean()

      expect(txns).toHaveLength(2)
      expect(txns[0].txn_id).toBe(key1)
      expect(txns[1].txn_id).toBe(key2)
      expect(txns[0].amount).toBe(1000)
      expect(txns[1].amount).toBe(1500)

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      expect(updated.wallet_balance).toBe(7500)
      expect(txns[1].running_balance).toBe(updated.wallet_balance)

      const schemaPaths = WalletTransaction.schema.paths
      expect(schemaPaths.txn_id.options.immutable).toBe(true)
      expect(schemaPaths.amount.options.immutable).toBe(true)
    })
  })

  describe('txn_id uniqueness', () => {
    it('enforces unique txn_id at DB level', async () => {
      const customer = await createCustomer({ walletBalance: 10000 })
      const key = randomUUID()

      await WalletEngine.debitForOrder(debitParams({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 1000
      }))

      // Force duplicate insert directly (bypassing engine)
      await expect(
        WalletTransaction.create({
          txn_id: key,
          customer_id: customer.customer_id,
          week_id: WEEK_ID,
          amount: 1000,
          type: 'order_debit',
          channel: 'system',
          running_balance: 9000,
          created_by: CREATED_BY
        })
      ).rejects.toMatchObject({ code: 11000 })
    })
  })

  describe('zero-floor invariant', () => {
    it('never persists a negative wallet_balance after failed or partial debits', async () => {
      const customer = await createCustomer({ walletBalance: 500 })

      await expect(
        WalletEngine.debitForOrder(debitParams({
          customerId: customer.customer_id,
          amount: 5000
        }))
      ).rejects.toBeInstanceOf(WalletInsufficientError)

      const allCustomers = await Customer.find({}).lean()
      for (const c of allCustomers) {
        expect(c.wallet_balance).toBeGreaterThanOrEqual(0)
      }
    })
  })
})
