'use strict'

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
  applyCreditMutation,
  resolveIdempotentDuplicate
} = require('./_helpers')

/**
 * topUp — credit a customer's wallet (operator records cash/UPI advance payment).
 *
 * Spec: B2 Wallet Engine §4.1, §5.6 (idempotency)
 */
async function topUp ({
  idempotencyKey,
  customerId,
  amount,
  channel,
  referenceNote,
  weekId,
  createdBy
}) {
  assertIdempotencyKey(idempotencyKey)
  assertString(customerId, 'customerId')
  assertPositive(amount, 'amount')
  assertString(createdBy, 'createdBy')
  if (channel !== 'cash' && channel !== 'upi') {
    throw new WalletValidationError(
      `topUp channel must be 'cash' or 'upi'; received '${channel}'`,
      { channel }
    )
  }

  const expected = { type: 'top_up', customer_id: customerId, amount }

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
          week_id: weekId ?? null,
          type: 'top_up',
          amount,
          channel,
          reference_note: referenceNote,
          running_balance: runningBalance,
          created_by: createdBy
        })
      })
    })

    return { txnId: txn.txn_id, newBalance }
  } catch (error) {
    return resolveIdempotentDuplicate(error, idempotencyKey, expected, (existing) => ({
      txnId: existing.txn_id,
      newBalance: existing.running_balance
    }))
  }
}

module.exports = topUp
