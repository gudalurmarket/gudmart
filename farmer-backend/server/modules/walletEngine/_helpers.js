'use strict'

const mongoose = require('mongoose')
const Customer = require('../../models/Customer')
const WalletTransaction = require('../../models/WalletTransaction')
const {
  CustomerNotFoundError,
  WalletValidationError,
  WalletDuplicateOperationError
} = require('../../lib/errors')

/**
 * MongoDB transaction options — snapshot reads + majority writes (B2 §5.1, §5.6).
 */
const WALLET_SESSION_OPTIONS = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' }
}

const MAX_TXN_ATTEMPTS = 5

function customerUpdateOptions (session) {
  return {
    returnDocument: 'after',
    session,
    runValidators: true,
    updatePipeline: true
  }
}

/**
 * Assert that a monetary parameter is a non-negative integer (paise).
 * Per B2 §5.7: floats in any money field are rejected at boundary.
 */
function assertInteger (value, paramName) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new WalletValidationError(
      `${paramName} must be a non-negative integer (paise); received ${typeof value}: ${value}`,
      { paramName, value }
    )
  }
}

/**
 * Assert that an amount is strictly positive (paise > 0).
 * Per B2 §5.7: amount = 0 for movement types is rejected.
 */
function assertPositive (value, paramName) {
  assertInteger(value, paramName)
  if (value === 0) {
    throw new WalletValidationError(
      `${paramName} must be greater than zero`,
      { paramName, value }
    )
  }
}

/**
 * Assert that a required string param is a non-empty string.
 */
function assertString (value, paramName) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WalletValidationError(
      `${paramName} must be a non-empty string`,
      { paramName }
    )
  }
}

/**
 * Assert that idempotencyKey is a non-empty string.
 */
function assertIdempotencyKey (key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new WalletValidationError(
      'idempotencyKey must be a non-empty string',
      { paramName: 'idempotencyKey' }
    )
  }
}

function assertNonNegativeBalance (balance, context) {
  if (!Number.isInteger(balance) || balance < 0) {
    throw new WalletValidationError(
      'Wallet invariant violated: balance must be a non-negative integer (paise)',
      { ...context, balance }
    )
  }
}

/**
 * B2 §5.2 — running_balance after credit/debit from previous wallet balance.
 */
function computeRunningBalance (previousBalance, amount, effect) {
  assertNonNegativeBalance(previousBalance, { field: 'previousBalance' })
  assertPositive(amount, 'amount')
  const running = effect === 'credit'
    ? previousBalance + amount
    : previousBalance - amount
  assertNonNegativeBalance(running, { field: 'running_balance', effect })
  return running
}

/**
 * Verify post-update wallet_balance matches B2 arithmetic (detect drift / corruption).
 */
function verifyPostUpdateBalance (previousBalance, amount, effect, actualBalance) {
  const expected = computeRunningBalance(previousBalance, amount, effect)
  if (actualBalance !== expected) {
    throw new WalletValidationError(
      'wallet_balance does not match expected running_balance after atomic update',
      { previousBalance, amount, effect, expected, actualBalance }
    )
  }
  return expected
}

function assertSameOperation (existing, expected, idempotencyKey) {
  if (
    existing.type !== expected.type ||
    existing.customer_id !== expected.customer_id ||
    existing.amount !== expected.amount
  ) {
    throw new WalletDuplicateOperationError(
      `Idempotency key ${idempotencyKey} already used with different parameters`,
      {
        idempotencyKey,
        expected,
        actual: {
          type: existing.type,
          customer_id: existing.customer_id,
          amount: existing.amount
        }
      }
    )
  }
}

/**
 * Build a wallet_transactions document.
 */
function buildTxnDoc (params) {
  assertNonNegativeBalance(params.running_balance, { field: 'running_balance' })
  return {
    txn_id: params.txn_id,
    customer_id: params.customer_id,
    week_id: params.week_id ?? null,
    type: params.type,
    amount: params.amount,
    channel: params.channel,
    reference_note: params.reference_note,
    running_balance: params.running_balance,
    created_at: new Date(),
    created_by: params.created_by
  }
}

/**
 * Run handler inside a MongoDB transaction with snapshot isolation and retries.
 */
async function withWalletSession (handler) {
  const session = await mongoose.startSession()
  try {
    let lastError
    for (let attempt = 0; attempt < MAX_TXN_ATTEMPTS; attempt++) {
      try {
        let result
        await session.withTransaction(async () => {
          result = await handler(session)
        }, WALLET_SESSION_OPTIONS)
        return result
      } catch (err) {
        lastError = err
        const transient =
          err.hasErrorLabel?.('TransientTransactionError') ||
          err.hasErrorLabel?.('UnknownTransactionCommitResult') ||
          err.code === 112
        if (transient) continue
        throw err
      }
    }
    throw lastError
  } finally {
    await session.endSession()
  }
}

async function findTxnByIdempotencyKey (session, idempotencyKey) {
  return WalletTransaction.findOne({ txn_id: idempotencyKey }, null, { session })
}

async function insertLedgerRow (session, doc) {
  const created = await WalletTransaction.create([doc], { session })
  return created[0]
}

/**
 * Atomic credit — pipeline $add (no read-then-write). Returns running_balance.
 */
async function atomicCreditCustomer (session, customerId, amount) {
  const updated = await Customer.findOneAndUpdate(
    { customer_id: customerId },
    [{ $set: { wallet_balance: { $add: ['$wallet_balance', amount] } } }],
    customerUpdateOptions(session)
  )
  if (!updated) {
    throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
  }

  const previousBalance = updated.wallet_balance - amount
  const runningBalance = verifyPostUpdateBalance(
    previousBalance,
    amount,
    'credit',
    updated.wallet_balance
  )
  return { updated, previousBalance, runningBalance }
}

/**
 * Atomic gated debit — filter wallet_balance >= amount, pipeline $subtract (B2 §4.2, §5.6).
 * Returns null when insufficient (caller distinguishes not-found vs insufficient).
 */
async function atomicGatedDebitCustomer (session, customerId, amount) {
  const updated = await Customer.findOneAndUpdate(
    { customer_id: customerId, wallet_balance: { $gte: amount } },
    [{ $set: { wallet_balance: { $subtract: ['$wallet_balance', amount] } } }],
    customerUpdateOptions(session)
  )
  if (!updated) return null

  const previousBalance = updated.wallet_balance + amount
  const runningBalance = verifyPostUpdateBalance(
    previousBalance,
    amount,
    'debit',
    updated.wallet_balance
  )
  return { updated, previousBalance, runningBalance }
}

/**
 * Drain exact wallet remainder to zero (overdelivery step A — B2 §5.4).
 */
async function atomicDrainWallet (session, customerId, drainAmount) {
  if (drainAmount === 0) {
    const exists = await Customer.exists({ customer_id: customerId }).session(session)
    if (!exists) {
      throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
    }
    return { previousBalance: 0, runningBalance: 0 }
  }

  const updated = await Customer.findOneAndUpdate(
    { customer_id: customerId, wallet_balance: { $gte: drainAmount } },
    [{ $set: { wallet_balance: { $subtract: ['$wallet_balance', drainAmount] } } }],
    customerUpdateOptions(session)
  )
  if (!updated) return null

  const previousBalance = updated.wallet_balance + drainAmount
  const runningBalance = verifyPostUpdateBalance(
    previousBalance,
    drainAmount,
    'debit',
    updated.wallet_balance
  )
  if (runningBalance !== 0) {
    throw new WalletValidationError(
      'Overdelivery drain must leave wallet_balance at exactly zero',
      { customerId, drainAmount, runningBalance }
    )
  }
  return { previousBalance, runningBalance }
}

/**
 * Credit path: idempotency → atomic balance → ledger insert (single session).
 */
async function applyCreditMutation (session, {
  idempotencyKey,
  customerId,
  amount,
  expected,
  buildDoc
}) {
  const existing = await findTxnByIdempotencyKey(session, idempotencyKey)
  if (existing) {
    assertSameOperation(existing, expected, idempotencyKey)
    return { txn: existing, newBalance: existing.running_balance }
  }

  const { runningBalance } = await atomicCreditCustomer(session, customerId, amount)
  const txn = await insertLedgerRow(session, buildDoc(runningBalance))
  return { txn, newBalance: runningBalance }
}

/**
 * Gated debit path: idempotency → atomic balance → ledger insert (single session).
 */
async function applyGatedDebitMutation (session, {
  idempotencyKey,
  customerId,
  amount,
  expected,
  buildDoc,
  onInsufficient
}) {
  const existing = await findTxnByIdempotencyKey(session, idempotencyKey)
  if (existing) {
    assertSameOperation(existing, expected, idempotencyKey)
    return { txn: existing, newBalance: existing.running_balance }
  }

  const debitResult = await atomicGatedDebitCustomer(session, customerId, amount)
  if (!debitResult) {
    return onInsufficient(session)
  }

  const txn = await insertLedgerRow(session, buildDoc(debitResult.runningBalance))
  return { txn, newBalance: debitResult.runningBalance }
}

async function resolveIdempotentDuplicate (error, idempotencyKey, expected, toResult) {
  if (!error || error.code !== 11000) throw error
  const existing = await WalletTransaction.findOne({ txn_id: idempotencyKey }).lean()
  if (!existing) throw error
  assertSameOperation(existing, expected, idempotencyKey)
  return toResult(existing)
}

function buildOrderDebitReferenceNote (orderId) {
  return `order_id:${orderId}`
}

function buildReversalReferenceNote (originalDebitTxnId, orderId) {
  return `original_txn:${originalDebitTxnId}; order_id:${orderId}`
}

module.exports = {
  WALLET_SESSION_OPTIONS,
  assertInteger,
  assertPositive,
  assertString,
  assertIdempotencyKey,
  assertSameOperation,
  assertNonNegativeBalance,
  computeRunningBalance,
  verifyPostUpdateBalance,
  buildTxnDoc,
  withWalletSession,
  findTxnByIdempotencyKey,
  insertLedgerRow,
  atomicCreditCustomer,
  atomicGatedDebitCustomer,
  atomicDrainWallet,
  applyCreditMutation,
  applyGatedDebitMutation,
  resolveIdempotentDuplicate,
  buildOrderDebitReferenceNote,
  buildReversalReferenceNote
}
