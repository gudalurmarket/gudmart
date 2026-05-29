'use strict'

const Customer = require('../../models/Customer')
const WalletTransaction = require('../../models/WalletTransaction')
const {
  CustomerNotFoundError,
  WalletValidationError
} = require('../../lib/errors')
const {
  assertPositive,
  assertString,
  assertIdempotencyKey,
  buildTxnDoc,
  withWalletSession,
  findTxnByIdempotencyKey,
  applyCreditMutation,
  applyGatedDebitMutation,
  atomicDrainWallet,
  insertLedgerRow,
  assertSameOperation,
  resolveIdempotentDuplicate
} = require('./_helpers')

/**
 * applyPriceDiff — price_diff_credit, price_diff_debit, or overdelivery two-step.
 *
 * Spec: B2 §4.4–4.6, §5.4
 * Debit path selection inside session after atomic full-debit attempt (no pre-read).
 */
async function applyPriceDiff ({
  idempotencyKey,
  customerId,
  amount,
  direction,
  lineItemId,
  weekId,
  createdBy
}) {
  assertIdempotencyKey(idempotencyKey)
  assertString(customerId, 'customerId')
  assertPositive(amount, 'amount')
  assertString(lineItemId, 'lineItemId')
  assertString(weekId, 'weekId')
  assertString(createdBy, 'createdBy')
  if (direction !== 'credit' && direction !== 'debit') {
    throw new WalletValidationError(
      `direction must be 'credit' or 'debit'; received '${direction}'`,
      { direction }
    )
  }

  if (direction === 'credit') {
    return _applyCredit({
      idempotencyKey, customerId, amount, lineItemId, weekId, createdBy
    })
  }

  return _applyDebit({
    idempotencyKey, customerId, amount, lineItemId, weekId, createdBy
  })
}

async function _applyCredit (params) {
  const { idempotencyKey, customerId, amount, lineItemId, weekId, createdBy } = params
  const expected = { type: 'price_diff_credit', customer_id: customerId, amount }

  try {
    const { txn, newBalance } = await withWalletSession(async (session) => {
      return applyCreditMutation(session, {
        idempotencyKey,
        customerId,
        amount,
        expected,
        buildDoc: (runningBalance) => buildTxnDoc({
          txn_id: idempotencyKey,
          customer_id: customerId,
          week_id: weekId,
          type: 'price_diff_credit',
          amount,
          channel: 'system',
          reference_note: `line_item_id:${lineItemId}`,
          running_balance: runningBalance,
          created_by: createdBy
        })
      })
    })

    return { txnIds: [txn.txn_id], newBalance, dueAmount: 0 }
  } catch (error) {
    return resolveIdempotentDuplicate(error, idempotencyKey, expected, (existing) => ({
      txnIds: [existing.txn_id],
      newBalance: existing.running_balance,
      dueAmount: 0
    }))
  }
}

async function _applyDebit (params) {
  const { idempotencyKey, customerId, amount, lineItemId, weekId, createdBy } = params
  const expected = { type: 'price_diff_debit', customer_id: customerId, amount }
  const drainKey = `${idempotencyKey}:drain`
  const dueKey = `${idempotencyKey}:due`

  try {
    return await withWalletSession(async (session) => {
      const existingSimple = await findTxnByIdempotencyKey(session, idempotencyKey)
      if (existingSimple) {
        assertSameOperation(existingSimple, expected, idempotencyKey)
        return {
          txnIds: [existingSimple.txn_id],
          newBalance: existingSimple.running_balance,
          dueAmount: 0
        }
      }

      const existingDrain = await findTxnByIdempotencyKey(session, drainKey)
      if (existingDrain) {
        const existingDue = await findTxnByIdempotencyKey(session, dueKey)
        if (!existingDue || existingDue.type !== 'customer_due') {
          throw new WalletValidationError(
            'Overdelivery drain exists without paired customer_due row',
            { drainKey, dueKey }
          )
        }
        return {
          txnIds: existingDrain.amount > 0 ? [drainKey, dueKey] : [dueKey],
          newBalance: 0,
          dueAmount: existingDue.amount
        }
      }

      const simpleDebit = await applyGatedDebitMutation(session, {
        idempotencyKey,
        customerId,
        amount,
        expected,
        buildDoc: (runningBalance) => buildTxnDoc({
          txn_id: idempotencyKey,
          customer_id: customerId,
          week_id: weekId,
          type: 'price_diff_debit',
          amount,
          channel: 'system',
          reference_note: `line_item_id:${lineItemId}`,
          running_balance: runningBalance,
          created_by: createdBy
        }),
        onInsufficient: async () => null
      })

      if (simpleDebit) {
        return {
          txnIds: [simpleDebit.txn.txn_id],
          newBalance: simpleDebit.newBalance,
          dueAmount: 0
        }
      }

      return _overdeliveryTwoStep(session, {
        drainKey,
        dueKey,
        customerId,
        totalAmount: amount,
        lineItemId,
        weekId,
        createdBy
      })
    })
  } catch (error) {
    if (error && error.code === 11000) {
      const simple = await WalletTransaction.findOne({ txn_id: idempotencyKey }).lean()
      if (simple) {
        assertSameOperation(simple, expected, idempotencyKey)
        return {
          txnIds: [simple.txn_id],
          newBalance: simple.running_balance,
          dueAmount: 0
        }
      }
      const drain = await WalletTransaction.findOne({ txn_id: drainKey }).lean()
      if (drain) {
        const due = await WalletTransaction.findOne({ txn_id: dueKey }).lean()
        return {
          txnIds: drain.amount > 0 ? [drainKey, dueKey] : [dueKey],
          newBalance: 0,
          dueAmount: due?.amount ?? 0
        }
      }
    }
    throw error
  }
}

/**
 * B2 §5.4 overdelivery — drain wallet to zero, then customer_due for remainder (one session).
 */
async function _overdeliveryTwoStep (session, {
  drainKey,
  dueKey,
  customerId,
  totalAmount,
  lineItemId,
  weekId,
  createdBy
}) {
  const customer = await Customer.findOne({ customer_id: customerId })
    .session(session)
    .lean()

  if (!customer) {
    throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
  }

  const drainAmount = customer.wallet_balance
  const dueAmount = totalAmount - drainAmount

  if (dueAmount <= 0) {
    throw new WalletValidationError(
      'Concurrent balance change during applyPriceDiff debit; retry the operation',
      { customerId, totalAmount, walletBalance: drainAmount }
    )
  }

  if (drainAmount > 0) {
    const drainResult = await atomicDrainWallet(session, customerId, drainAmount)
    if (!drainResult) {
      throw new WalletValidationError(
        'Concurrent balance change during overdelivery drain; retry the operation',
        { customerId, drainAmount }
      )
    }

    await insertLedgerRow(session, buildTxnDoc({
      txn_id: drainKey,
      customer_id: customerId,
      week_id: weekId,
      type: 'price_diff_debit',
      amount: drainAmount,
      channel: 'system',
      reference_note: `line_item_id:${lineItemId}; overdelivery_drain`,
      running_balance: drainResult.runningBalance,
      created_by: createdBy
    }))
  }

  await insertLedgerRow(session, buildTxnDoc({
    txn_id: dueKey,
    customer_id: customerId,
    week_id: weekId,
    type: 'customer_due',
    amount: dueAmount,
    channel: 'system',
    reference_note: drainAmount > 0
      ? `line_item_id:${lineItemId}; paired_drain_txn:${drainKey}`
      : `line_item_id:${lineItemId}; overdelivery_full_due`,
    running_balance: 0,
    created_by: createdBy
  }))

  return {
    txnIds: drainAmount > 0 ? [drainKey, dueKey] : [dueKey],
    newBalance: 0,
    dueAmount
  }
}

module.exports = applyPriceDiff
