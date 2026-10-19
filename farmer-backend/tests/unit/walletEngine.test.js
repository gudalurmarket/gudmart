'use strict'

const { randomUUID } = require('node:crypto')
const WalletEngine = require('../../server/modules/walletEngine')
const Customer = require('../../server/models/Customer')
const CustomerOrder = require('../../server/models/CustomerOrder')
const WalletTransaction = require('../../server/models/WalletTransaction')
const {
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
  await CustomerOrder.deleteMany({ week_id: WEEK_ID, created_by: TEST_CREATOR })
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
    it('debit exceeding balance drives wallet_balance negative (customer owes the remainder)', async () => {
      const customer = await createCustomer(1500)

      const result = await WalletEngine.debitForOrder(debitParams({
        customerId: customer.customer_id,
        amount: 5000
      }))

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id }).lean()
      expect(updated.wallet_balance).toBe(-3500)
      expect(result.newBalance).toBe(-3500)
      expect(txns).toHaveLength(1)
      expect(txns[0].running_balance).toBe(-3500)
    })

    it('throws CustomerNotFoundError for unknown customerId', async () => {
      await expect(
        WalletEngine.debitForOrder(debitParams({ customerId: 'missing-customer' }))
      ).rejects.toBeInstanceOf(CustomerNotFoundError)
    })

    it('concurrent debits: both succeed and the balance reflects both', async () => {
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

      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2)

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id })
        .sort({ created_at: 1 })
        .lean()

      expect(updated.wallet_balance).toBe(-1000)
      expect(txns).toHaveLength(2)
      expect(txns.map(t => t.running_balance).sort((x, y) => y - x)).toEqual([1000, -1000])
    })

    it('concurrent debits: many parallel attempts all apply atomically', async () => {
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

      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(attempts)

      const updated = await Customer.findOne({ customer_id: customer.customer_id }).lean()
      const txns = await WalletTransaction.find({ customer_id: customer.customer_id }).lean()

      expect(updated.wallet_balance).toBe(5000 - attempts * amount)
      expect(txns).toHaveLength(attempts)
      // every running_balance is distinct: no two debits saw the same previous balance
      expect(new Set(txns.map(t => t.running_balance)).size).toBe(attempts)
      expect(Math.min(...txns.map(t => t.running_balance))).toBe(updated.wallet_balance)
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

    it('debit larger than balance goes negative with a single price_diff_debit row', async () => {
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
      const txn = await WalletTransaction.findOne({ txn_id: key }).lean()

      expect(updated.wallet_balance).toBe(-1700)
      expect(result).toEqual({ txnIds: [key], newBalance: -1700, dueAmount: 0 })
      expect(txn.type).toBe('price_diff_debit')
      expect(txn.amount).toBe(2500)
      expect(txn.running_balance).toBe(-1700)
      expect(await WalletTransaction.countDocuments({ customer_id: customer.customer_id })).toBe(1)
    })

    it('debit against a zero wallet leaves a negative balance', async () => {
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

      expect(result.txnIds).toEqual([key])
      expect(result.newBalance).toBe(-900)
      expect((await Customer.findOne({ customer_id: customer.customer_id }).lean()).wallet_balance).toBe(-900)
    })

    it('a top-up against a negative balance reduces the debt', async () => {
      const customer = await createCustomer(-900)

      const result = await WalletEngine.topUp({
        idempotencyKey: randomUUID(),
        customerId: customer.customer_id,
        amount: 500,
        channel: 'cash',
        referenceNote: 'part payment of old debt',
        weekId: WEEK_ID,
        createdBy: OPERATOR
      })

      expect(result.newBalance).toBe(-400)
    })
  })

  describe('applyBalancePayment', () => {
    it('credits wallet for balance_payment', async () => {
      const customer = await createCustomer(0)
      const key = randomUUID()
      const orderId = 'order-bal-1'

      // Create a CustomerOrder with balance_due for this payment
      await CustomerOrder.create({
        order_id: orderId,
        week_id: WEEK_ID,
        customer_id: customer.customer_id,
        status: 'pending_payment',
        fcfs_timestamp: new Date(),
        order_value: 1500,
        balance_due: 1500,
        line_items: [
          {
            line_item_id: 'line-bal-1',
            product_id: 'prod-test',
            ordered_qty: 1,
            delivered_qty: 1,
            unit: 'kg',
            price_per_unit: 1500,
            line_value: 1500
          }
        ],
        created_by: TEST_CREATOR
      })

      const result = await WalletEngine.applyBalancePayment({
        idempotencyKey: key,
        customerId: customer.customer_id,
        amount: 1500,
        channel: 'upi',
        orderId,
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

    it('debit larger than balance goes negative', async () => {
      const customer = await createCustomer(300)

      const result = await WalletEngine.manualAdjustment({
        idempotencyKey: randomUUID(),
        customerId: customer.customer_id,
        amount: 500,
        direction: 'debit',
        reason: 'over-debit',
        createdBy: OPERATOR
      })

      expect(result.newBalance).toBe(-200)
      expect((await Customer.findOne({ customer_id: customer.customer_id }).lean()).wallet_balance).toBe(-200)
      expect(await WalletTransaction.countDocuments({ customer_id: customer.customer_id })).toBe(1)
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

describe('zero-wallet-balances script', () => {
  const { zeroWalletBalances } = require('../../scripts/zero-wallet-balances')
  // other suites share this database; only touch this suite's customers
  const ONLY_TEST_CUSTOMERS = { created_by: TEST_CREATOR }

  beforeEach(async () => {
    await Customer.deleteMany({ created_by: TEST_CREATOR })
    await WalletTransaction.deleteMany({ created_by: 'system-zero-wallets' })
  })

  it('dry run changes nothing', async () => {
    const credit = await createCustomer(5000)
    const result = await zeroWalletBalances({ confirm: false, runId: 'dry', filter: ONLY_TEST_CUSTOMERS })

    expect(result.adjusted).toBe(0)
    expect((await Customer.findOne({ customer_id: credit.customer_id }).lean()).wallet_balance).toBe(5000)
  })

  it('zeroes positive and negative balances, and can be run again', async () => {
    const credit = await createCustomer(5000)
    const debt = await createCustomer(-3000)
    const clear = await createCustomer(0)

    const first = await zeroWalletBalances({ confirm: true, runId: 'r1', filter: ONLY_TEST_CUSTOMERS })
    expect(first.remainingNonZero).toBe(0)

    const balanceOf = async (c) =>
      (await Customer.findOne({ customer_id: c.customer_id }).lean()).wallet_balance
    expect(await balanceOf(credit)).toBe(0)
    expect(await balanceOf(debt)).toBe(0)
    expect(await balanceOf(clear)).toBe(0)

    const creditTxn = await WalletTransaction.findOne({ customer_id: credit.customer_id }).lean()
    const debtTxn = await WalletTransaction.findOne({ customer_id: debt.customer_id }).lean()
    expect(creditTxn.type).toBe('manual_adjustment')
    expect(creditTxn.running_balance).toBe(0)
    expect(debtTxn.running_balance).toBe(0)
    expect(await WalletTransaction.countDocuments({ customer_id: clear.customer_id })).toBe(0)

    // later, balances move again; a second run (new run id) zeroes them again
    await WalletEngine.topUp({
      idempotencyKey: randomUUID(),
      customerId: credit.customer_id,
      amount: 700,
      channel: 'cash',
      weekId: WEEK_ID,
      createdBy: OPERATOR
    })
    const second = await zeroWalletBalances({ confirm: true, runId: 'r2', filter: ONLY_TEST_CUSTOMERS })
    expect(second.adjusted).toBe(1)
    expect(await balanceOf(credit)).toBe(0)
  })
})

