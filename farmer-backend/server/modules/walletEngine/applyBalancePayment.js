'use strict'

const {
  WalletValidationError
} = require('../../lib/errors')
const CustomerOrder = require('../../models/CustomerOrder')
const {
  assertPositive,
  assertString,
  assertIdempotencyKey,
  buildTxnDoc,
  withWalletSession,
  applyCreditMutation,
  resolveIdempotentDuplicate
} = require('./_helpers')

/**
 * applyBalancePayment — market-day balance settlement (B2 §4.7).
 */
async function applyBalancePayment ({
  idempotencyKey,
  customerId,
  amount,
  channel,
  orderId,
  weekId,
  createdBy
}) {
  assertIdempotencyKey(idempotencyKey)
  assertString(customerId, 'customerId')
  assertPositive(amount, 'amount')
  assertString(orderId, 'orderId')
  assertString(weekId, 'weekId')
  assertString(createdBy, 'createdBy')
  if (channel !== 'cash' && channel !== 'upi') {
    throw new WalletValidationError(
      `applyBalancePayment channel must be 'cash' or 'upi'; received '${channel}'`,
      { channel }
    )
  }

  // Validate order EXISTS before touching wallet
  const order = await CustomerOrder.findOne({
    order_id: orderId,
    week_id: weekId
  })
  if (!order) {
    throw new WalletValidationError(
      `applyBalancePayment order not found: ${orderId}`,
      { orderId, weekId }
    )
  }

  const expected = { type: 'balance_payment', customer_id: customerId, amount }

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
          type: 'balance_payment',
          amount,
          channel,
          reference_note: `order_id:${orderId}`,
          running_balance: runningBalance,
          created_by: createdBy
        })
      })
    })

    const remainingDue = Math.max(0, order.balance_due - amount)
    await CustomerOrder.updateOne(
      { order_id: orderId, week_id: weekId },
      { $set: { balance_due: remainingDue, balance_cleared: remainingDue === 0 } }
    )

    return { txnId: txn.txn_id, newBalance }
  } catch (error) {
    return resolveIdempotentDuplicate(error, idempotencyKey, expected, (existing) => ({
      txnId: existing.txn_id,
      newBalance: existing.running_balance
    }))
  }
}

module.exports = applyBalancePayment
