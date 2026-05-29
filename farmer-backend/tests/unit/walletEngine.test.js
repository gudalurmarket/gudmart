'use strict'

const { randomUUID } = require('node:crypto')
const WalletEngine = require('../../server/modules/walletEngine')
const Customer = require('../../server/models/Customer')
const WalletTransaction = require('../../server/models/WalletTransaction')
const {
  WalletInsufficientError,
  WalletValidationError,
  WalletDuplicateReversalError,
  WalletDuplicateOperationError,
  WalletTransactionNotFoundError,
  CustomerNotFoundError
} = require('../../server/lib/errors')

const WEEK_ID = 'week-test-wallet-001'
const OPERATOR = 'test-operator-uid'
const TEST_CREATOR = 'jest-wallet-engine-test'

async function createCustomer (walletBalance) {
  const unique = randomUUID().replace(/-/g, '').slice(0, 10)
  return Customer.create({
    customer_id: `cust-${randomUUID()}`,
    name: 'Wallet Test Customer',
    phone: `+9198${unique}`,
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

function debitParams (overrides = {}) {
  return {
    idempotencyKey: randomUUID(),
    customerId: overrides.customerId,
    orderId: overrides.orderId ?? `order-${randomUUID()}`,
    weekId: WEEK_ID,
    amount: overrides.amount ?? 2000,
    createdBy: 'system',
    ...overrides
  }
}

const CREDIT_TXN_TYPES = new Set([
  'top_up',
  'order_debit_reversal',
  'price_diff_credit',
  'balance_payment'
])

/** Assert each ledger row's running_balance follows previous ± amount. */
function assertRunningBalanceChain (txns) {
  for (let i = 1; i < txns.length; i++) {
    const prev = txns[i - 1]
    const curr = txns[i]
    const expected = CREDIT_TXN_TYPES.has(curr.type)
      ? prev.running_balance + curr.amount
      : prev.running_balance - curr.amount
    expect(curr.running_balance).toBe(expected)
  }
}

describe('WalletEngine', () => {
  beforeEach(async () => {
    await cleanupWalletTestData()
  })

  describe('debitForOrder', () => {
    it('throws WalletInsufficientError when debit exceeds balance without mutating ledger', async () => {
      const customer = await createCustomer(1500)

      await expect(
        WalletEngine.debitForOrder(debitParams({
          customerId: customer.customer_id,
          amount: 5000
        }))
      ).rejects.toBeInstanceOf(WalletInsufficientError)

      const unchanged = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      expect(unchanged.wallet_balance).toBe(1500)
      expect(await WalletTransaction.countDocuments({ customer_id: customer.customer_id })).toBe(0)
    })

    it('throws CustomerNotFoundError for unknown customerId', async () => {
      await expect(
        WalletEngine.debitForOrder(debitParams({ customerId: 'missing-customer' }))
      ).rejects.toBeInstanceOf(CustomerNotFoundError)
    })

    it('concurrent debits: only one succeeds when combined amount exceeds balance', async () => {
      const customer = await createCustomer(3000)
      const amount = 2000

      const results = await Promise.allSettled([
        WalletEngine.debitForOrder(debitParams({
          customerId: customer.customer_id,
          orderId: 'order-race-a',
          amount
        })),
        WalletEngine.debitForOrder(debitParams({
          customerId: customer.customer_id,
          orderId: 'order-race-b',
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

      expect(updated.wallet_balance).toBe(1000)
      expect(txns).toHaveLength(1)
      expect(txns[0].running_balance).toBe(updated.wallet_balance)
    })

    it('concurrent debits: many parallel attempts leave balance non-negative with at most floor(balance/amount) successes', async () => {
      const customer = await createCustomer(5000)
      const amount = 2000
      const attempts = 5

      const results = await Promise.allSettled(
        Array.from({ length: attempts }, (_, i) =>
          WalletEngine.debitForOrder(debitParams({
            customerId: customer.customer_id,
            orderId: `order-race-multi-${i}`,
            amount
          }))
        )
      )

      const successes = results.filter(r => r.status === 'fulfilled')
      const failures = results.filter(r => r.status === 'rejected')

      expect(successes.length).toBe(2)
      expect(failures.length).toBe(3)
      for (const f of failures) {
        expect(f.reason).toBeInstanceOf(WalletInsufficientError)
      }

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id })
        .sort({ created_at: 1 })
        .lean()

      expect(updated.wallet_balance).toBe(1000)
      expect(txns).toHaveLength(2)
      for (const txn of txns) {
        expect(txn.running_balance).toBeGreaterThanOrEqual(0)
      }
      expect(txns[txns.length - 1].running_balance).toBe(updated.wallet_balance)
    })

    it('sets running_balance equal to wallet_balance after debit', async () => {
      const customer = await createCustomer(10000)

      await WalletEngine.debitForOrder(debitParams({
        customerId: customer.customer_id,
        amount: 2500
      }))

      const txn = await WalletTransaction.findOne({ customer_id: customer.customer_id }).lean()
      const refreshed = await Customer.findOne({ customer_id: customer.customer_id }).lean()

      expect(txn.running_balance).toBe(refreshed.wallet_balance)
      expect(txn.running_balance).toBe(7500)
    })
  })

  describe('topUp', () => {
    it('increases wallet_balance by credited amount with matching running_balance', async () => {
      const customer = await createCustomer(5000)
      const key = randomUUID()

      const result = await WalletEngine.topUp({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 3000,
        channel: 'cash',
        referenceNote: 'advance',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txn = await WalletTransaction.findOne({ txn_id: key }).lean()

      expect(result).toEqual({ txnId: key, newBalance: 8000 })
      expect(updated.wallet_balance).toBe(customer.wallet_balance + 3000)
      expect(updated.wallet_balance).toBe(8000)
      expect(txn.type).toBe('top_up')
      expect(txn.running_balance).toBe(8000)
      expect(txn.channel).toBe('cash')
    })

    it('is idempotent for the same idempotencyKey', async () => {
      const customer = await createCustomer(0)
      const key = randomUUID()
      const params = {
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 1000,
        channel: 'upi',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      }

      await WalletEngine.topUp(params)
      await WalletEngine.topUp(params)

      expect(await WalletTransaction.countDocuments({ customer_id: customer.customer_id })).toBe(1)
      expect((await Customer.findOne({ customer_id: customer.customer_id }).lean()).wallet_balance).toBe(1000)
    })

    it('rejects non-integer amount', async () => {
      const customer = await createCustomer(0)
      await expect(
        WalletEngine.topUp({
          idempotencyKey: randomUUID(),
          customerId: customer.customer_id,
          amount: 10.5,
          channel: 'cash',
          weekId: WEEK_ID,
          createdBy: OPERATOR
        })
      ).rejects.toBeInstanceOf(WalletValidationError)
    })
  })

  describe('reverseOrderDebit', () => {
    it('restores wallet_balance to pre-debit amount after reversal', async () => {
      const customer = await createCustomer(10000)
      const debitKey = randomUUID()
      const orderId = 'order-rev-1'

      const debit = await WalletEngine.debitForOrder({
        idempotencyKey: debitKey,
        customerId: customer.customer_id,
        orderId,
        weekId: WEEK_ID,
        amount: 4000,
        createdBy: 'system'
      })

      const reversal = await WalletEngine.reverseOrderDebit({
        idempotencyKey: randomUUID(),
        customerId: customer.customer_id,
        originalDebitTxnId: debit.txnId,
        orderId,
        createdBy: OPERATOR
      })

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id })
        .sort({ created_at: 1 })
        .lean()

      expect(reversal.newBalance).toBe(10000)
      expect(updated.wallet_balance).toBe(10000)
      expect(txns).toHaveLength(2)
      expect(txns[1].type).toBe('order_debit_reversal')
      expect(txns[1].amount).toBe(4000)
      expect(txns[1].running_balance).toBe(10000)
    })

    it('rejects second reversal of the same original debit', async () => {
      const customer = await createCustomer(10000)
      const debitKey = randomUUID()
      const orderId = 'order-rev-dup'

      const debit = await WalletEngine.debitForOrder({
        idempotencyKey: debitKey,
        customerId: customer.customer_id,
        orderId,
        weekId: WEEK_ID,
        amount: 2000,
        createdBy: 'system'
      })

      await WalletEngine.reverseOrderDebit({
        idempotencyKey: randomUUID(),
        customerId: customer.customer_id,
        originalDebitTxnId: debit.txnId,
        orderId,
        createdBy: OPERATOR
      })

      await expect(
        WalletEngine.reverseOrderDebit({
          idempotencyKey: randomUUID(),
          customerId: customer.customer_id,
          originalDebitTxnId: debit.txnId,
          orderId,
          createdBy: OPERATOR
        })
      ).rejects.toBeInstanceOf(WalletDuplicateReversalError)
    })

    it('throws when original debit txn does not exist', async () => {
      const customer = await createCustomer(5000)
      await expect(
        WalletEngine.reverseOrderDebit({
          idempotencyKey: randomUUID(),
          customerId: customer.customer_id,
          originalDebitTxnId: 'missing-txn-id',
          orderId: 'order-x',
          createdBy: OPERATOR
        })
      ).rejects.toBeInstanceOf(WalletTransactionNotFoundError)
    })
  })

  describe('applyPriceDiff', () => {
    it('credits wallet on price_diff credit', async () => {
      const customer = await createCustomer(2000)
      const key = randomUUID()

      const result = await WalletEngine.applyPriceDiff({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 500,
        direction: 'credit',
        lineItemId: 'line-1',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      expect(result).toEqual({ txnIds: [key], newBalance: 2500, dueAmount: 0 })
      expect((await Customer.findOne({ customer_id: customer.customer_id }).lean()).wallet_balance).toBe(2500)
    })

    it('debits wallet when balance covers the diff', async () => {
      const customer = await createCustomer(3000)
      const key = randomUUID()

      const result = await WalletEngine.applyPriceDiff({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 1000,
        direction: 'debit',
        lineItemId: 'line-2',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      expect(result).toEqual({ txnIds: [key], newBalance: 2000, dueAmount: 0 })
      const txn = await WalletTransaction.findOne({ txn_id: key }).lean()
      expect(txn.type).toBe('price_diff_debit')
    })

    it('overdelivery two-step: drains wallet to zero and records customer_due', async () => {
      const customer = await createCustomer(800)
      const key = randomUUID()

      const result = await WalletEngine.applyPriceDiff({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 2500,
        direction: 'debit',
        lineItemId: 'line-od',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const drain = await WalletTransaction.findOne({ txn_id: `${key}:drain` }).lean()
      const due = await WalletTransaction.findOne({ txn_id: `${key}:due` }).lean()

      expect(updated.wallet_balance).toBe(0)
      expect(result.newBalance).toBe(0)
      expect(result.dueAmount).toBe(1700)
      expect(result.txnIds).toEqual([`${key}:drain`, `${key}:due`])
      expect(drain.amount).toBe(800)
      expect(drain.running_balance).toBe(0)
      expect(due.type).toBe('customer_due')
      expect(due.amount).toBe(1700)
      expect(due.running_balance).toBe(0)
    })

    it('overdelivery with zero wallet creates only customer_due', async () => {
      const customer = await createCustomer(0)
      const key = randomUUID()

      const result = await WalletEngine.applyPriceDiff({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 900,
        direction: 'debit',
        lineItemId: 'line-zero',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      expect(result.txnIds).toEqual([`${key}:due`])
      expect(result.dueAmount).toBe(900)
      expect(await WalletTransaction.countDocuments({ customer_id: customer.customer_id })).toBe(1)
    })
  })

  describe('applyBalancePayment', () => {
    it('credits wallet for balance_payment', async () => {
      const customer = await createCustomer(0)
      const key = randomUUID()

      const result = await WalletEngine.applyBalancePayment({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 1500,
        channel: 'upi',
        orderId: 'order-bal-1',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      const txn = await WalletTransaction.findOne({ txn_id: key }).lean()
      expect(result.newBalance).toBe(1500)
      expect(txn.type).toBe('balance_payment')
      expect(txn.reference_note).toBe('order_id:order-bal-1')
    })
  })

  describe('manualAdjustment', () => {
    it('credits on credit direction', async () => {
      const customer = await createCustomer(1000)
      const key = randomUUID()

      const result = await WalletEngine.manualAdjustment({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 500,
        direction: 'credit',
        reason: 'goodwill',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      expect(result.newBalance).toBe(1500)
    })

    it('debits on debit direction when balance is sufficient', async () => {
      const customer = await createCustomer(2000)
      const key = randomUUID()

      const result = await WalletEngine.manualAdjustment({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 700,
        direction: 'debit',
        reason: 'correction',
        createdBy: OPERATOR
      })

      expect(result.newBalance).toBe(1300)
    })

    it('throws WalletInsufficientError on debit when balance is too low', async () => {
      const customer = await createCustomer(300)

      await expect(
        WalletEngine.manualAdjustment({
          idempotencyKey: randomUUID(),
          customerId: customer.customer_id,
          amount: 500,
          direction: 'debit',
          reason: 'over-debit attempt',
          createdBy: OPERATOR
        })
      ).rejects.toBeInstanceOf(WalletInsufficientError)

      expect((await Customer.findOne({ customer_id: customer.customer_id }).lean()).wallet_balance).toBe(300)
      expect(await WalletTransaction.countDocuments({ customer_id: customer.customer_id })).toBe(0)
    })

    it('requires a non-empty reason', async () => {
      const customer = await createCustomer(1000)
      await expect(
        WalletEngine.manualAdjustment({
          idempotencyKey: randomUUID(),
          customerId: customer.customer_id,
          amount: 100,
          direction: 'credit',
          reason: '   ',
          createdBy: OPERATOR
        })
      ).rejects.toBeInstanceOf(WalletValidationError)
    })
  })

  describe('running_balance consistency', () => {
    it('matches customer.wallet_balance on every ledger row after each operation', async () => {
      const customer = await createCustomer(8000)

      await WalletEngine.topUp({
        idempotencyKey: randomUUID(),
        customerId: customer.customer_id,
        amount: 1000,
        channel: 'cash',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      await WalletEngine.debitForOrder(debitParams({
        customerId: customer.customer_id,
        amount: 2000
      }))

      const orderId = 'order-rb-reversal'
      const debit = await WalletEngine.debitForOrder(debitParams({
        customerId: customer.customer_id,
        orderId,
        amount: 1500
      }))

      await WalletEngine.reverseOrderDebit({
        idempotencyKey: randomUUID(),
        customerId: customer.customer_id,
        originalDebitTxnId: debit.txnId,
        orderId,
        createdBy: OPERATOR
      })

      const txns = await WalletTransaction.find({ customer_id: customer.customer_id })
        .sort({ created_at: 1 })
        .lean()
      const refreshed = await Customer.findOne({ customer_id: customer.customer_id }).lean()

      assertRunningBalanceChain(txns)
      expect(txns[txns.length - 1].running_balance).toBe(refreshed.wallet_balance)
      expect(refreshed.wallet_balance).toBe(7000)
    })

    it('chains running_balance as previous ± amount across sequential operations', async () => {
      const customer = await createCustomer(10000)
      const topKey = randomUUID()
      const debitKey = randomUUID()
      const orderId = 'order-chain-1'

      await WalletEngine.topUp({
        idempotencyKey: topKey,
        customerId: customer.customer_id,
        amount: 2000,
        channel: 'cash',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      await WalletEngine.debitForOrder({
        idempotencyKey: debitKey,
        customerId: customer.customer_id,
        orderId,
        weekId: WEEK_ID,
        amount: 3500,
        createdBy: 'system'
      })

      const txns = await WalletTransaction.find({ customer_id: customer.customer_id })
        .sort({ created_at: 1 })
        .lean()

      expect(txns[0].running_balance).toBe(12000)
      expect(txns[1].running_balance).toBe(8500)
      expect(txns[1].running_balance).toBe(txns[0].running_balance - txns[1].amount)

      const refreshed = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      expect(refreshed.wallet_balance).toBe(txns[txns.length - 1].running_balance)
      expect(refreshed.wallet_balance).toBeGreaterThanOrEqual(0)
    })

    it('rejects a second order_debit for the same order_id', async () => {
      const customer = await createCustomer(8000)
      const orderId = 'order-dup-debit'

      await WalletEngine.debitForOrder({
        idempotencyKey: randomUUID(),
        customerId: customer.customer_id,
        orderId,
        weekId: WEEK_ID,
        amount: 1000,
        createdBy: 'system'
      })

      await expect(
        WalletEngine.debitForOrder({
          idempotencyKey: randomUUID(),
          customerId: customer.customer_id,
          orderId,
          weekId: WEEK_ID,
          amount: 2000,
          createdBy: 'system'
        })
      ).rejects.toBeInstanceOf(WalletDuplicateOperationError)

      expect(await WalletTransaction.countDocuments({
        customer_id: customer.customer_id,
        type: 'order_debit'
      })).toBe(1)
      expect((await Customer.findOne({ customer_id: customer.customer_id }).lean()).wallet_balance).toBe(7000)
    })
  })
})
