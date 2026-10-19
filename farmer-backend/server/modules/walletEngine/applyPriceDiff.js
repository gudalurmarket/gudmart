'use strict'

const { WalletValidationError } = require('../../lib/errors')
const {
  assertPositive,
  assertString,
  assertIdempotencyKey,
  buildTxnDoc,
  withWalletSession,
  applyCreditMutation,
  applyDebitMutation,
  resolveIdempotentDuplicate
} = require('./_helpers')

/**
 * applyPriceDiff — price_diff_credit or price_diff_debit.
 *
 * Spec: B2 §4.4–4.6
 * A debit larger than the balance leaves a negative balance (the customer owes the remainder).
 * dueAmount is kept in the return shape for callers and is always 0.
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

  try {
    const { txn, newBalance } = await withWalletSession(async (session) => {
      return applyDebitMutation(session, {
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

module.exports = applyPriceDiff
