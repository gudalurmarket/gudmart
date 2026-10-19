'use strict'

const WalletTransaction = require('../../models/WalletTransaction')
const {
  WalletDuplicateOperationError
} = require('../../lib/errors')
const {
  assertPositive,
  assertString,
  assertIdempotencyKey,
  buildTxnDoc,
  withWalletSession,
  applyDebitMutation,
  resolveIdempotentDuplicate,
  buildOrderDebitReferenceNote
} = require('./_helpers')

/**
 * debitForOrder — debit wallet at order confirmation.
 *
 * Spec: B2 Wallet Engine §4.2, §5.6
 * - Atomic debit (pipeline $subtract); no floor — a negative balance is what the customer owes
 * - At most one order_debit per order_id (B2 §4.2)
 */
async function debitForOrder ({
  idempotencyKey,
  customerId,
  orderId,
  weekId,
  amount,
  createdBy,
  session = null
}) {
  assertIdempotencyKey(idempotencyKey)
  assertString(customerId, 'customerId')
  assertString(orderId, 'orderId')
  assertString(weekId, 'weekId')
  assertPositive(amount, 'amount')
  if (createdBy !== 'system') {
    assertString(createdBy, 'createdBy')
  }

  const expected = { type: 'order_debit', customer_id: customerId, amount }
  const orderRef = buildOrderDebitReferenceNote(orderId)

  const runInSession = async (activeSession) => {
    const priorOrderDebit = await WalletTransaction.findOne({
      customer_id: customerId,
      type: 'order_debit',
      reference_note: orderRef
    }, null, { session: activeSession }).lean()

    if (priorOrderDebit && priorOrderDebit.txn_id !== idempotencyKey) {
      throw new WalletDuplicateOperationError(
        `Idempotency key ${idempotencyKey} already used with different parameters`,
        {
          idempotencyKey,
          expected,
          actual: {
            type: priorOrderDebit.type,
            customer_id: priorOrderDebit.customer_id,
            amount: priorOrderDebit.amount,
            existing_txn_id: priorOrderDebit.txn_id
          }
        }
      )
    }

    return applyDebitMutation(activeSession, {
      idempotencyKey,
      customerId,
      amount,
      expected,
      buildDoc: (runningBalance) => buildTxnDoc({
        txn_id: idempotencyKey,
        customer_id: customerId,
        week_id: weekId,
        type: 'order_debit',
        amount,
        channel: 'system',
        reference_note: orderRef,
        running_balance: runningBalance,
        created_by: createdBy
      })
    })
  }

  try {
    const { txn, newBalance } = session
      ? await runInSession(session)
      : await withWalletSession(runInSession)

    return { txnId: txn.txn_id, newBalance }
  } catch (error) {
    return resolveIdempotentDuplicate(error, idempotencyKey, expected, (existing) => ({
      txnId: existing.txn_id,
      newBalance: existing.running_balance
    }))
  }
}

module.exports = debitForOrder
