'use strict'

const WalletTransaction = require('../../models/WalletTransaction')
const {
  CustomerNotFoundError,
  WalletValidationError,
  WalletTransactionNotFoundError,
  WalletDuplicateReversalError,
  WalletDuplicateOperationError
} = require('../../lib/errors')
const {
  assertString,
  assertIdempotencyKey,
  buildTxnDoc,
  withWalletSession,
  findTxnByIdempotencyKey,
  atomicCreditCustomer,
  insertLedgerRow,
  resolveIdempotentDuplicate,
  buildReversalReferenceNote
} = require('./_helpers')

/**
 * reverseOrderDebit — full reversal of a previous order_debit.
 *
 * Spec: B2 §4.3 — MVP: full reversal of a single order_debit only.
 */
async function reverseOrderDebit ({
  idempotencyKey,
  customerId,
  originalDebitTxnId,
  orderId,
  createdBy,
  session = null
}) {
  assertIdempotencyKey(idempotencyKey)
  assertString(customerId, 'customerId')
  assertString(originalDebitTxnId, 'originalDebitTxnId')
  assertString(orderId, 'orderId')
  assertString(createdBy, 'createdBy')

  const reversalRef = buildReversalReferenceNote(originalDebitTxnId, orderId)

  const runInSession = async (activeSession) => {
    const existing = await findTxnByIdempotencyKey(activeSession, idempotencyKey)
    if (existing) {
      if (
        existing.type !== 'order_debit_reversal' ||
        existing.customer_id !== customerId
      ) {
        throw new WalletDuplicateOperationError(
          `Idempotency key ${idempotencyKey} already used with different parameters`,
          {
            idempotencyKey,
            expected: { type: 'order_debit_reversal', customer_id: customerId },
            actual: { type: existing.type, customer_id: existing.customer_id }
          }
        )
      }
      return { txn: existing, newBalance: existing.running_balance }
    }

    const existingReversal = await WalletTransaction.findOne({
      customer_id: customerId,
      type: 'order_debit_reversal',
      reference_note: reversalRef
    }, null, { session: activeSession }).lean()

    if (existingReversal) {
      throw new WalletDuplicateReversalError(
        `Original debit already reversed: ${originalDebitTxnId}`,
        { originalTxnId: originalDebitTxnId }
      )
    }

    const original = await WalletTransaction.findOne(
      { txn_id: originalDebitTxnId },
      null,
      { session: activeSession }
    ).lean()

    if (!original) {
      throw new WalletTransactionNotFoundError(
        `WalletTransaction not found: ${originalDebitTxnId}`,
        { txnId: originalDebitTxnId }
      )
    }

    if (original.type !== 'order_debit') {
      throw new WalletValidationError(
        `Original txn ${originalDebitTxnId} is not an order_debit (type=${original.type})`,
        { originalDebitTxnId, actualType: original.type }
      )
    }
    if (original.customer_id !== customerId) {
      throw new WalletValidationError(
        `Original txn ${originalDebitTxnId} does not belong to customer ${customerId}`,
        {
          originalDebitTxnId,
          expectedCustomer: customerId,
          actualCustomer: original.customer_id
        }
      )
    }

    const { runningBalance } = await atomicCreditCustomer(
      activeSession,
      customerId,
      original.amount
    )

    const txn = await insertLedgerRow(activeSession, buildTxnDoc({
      txn_id: idempotencyKey,
      customer_id: customerId,
      week_id: original.week_id,
      type: 'order_debit_reversal',
      amount: original.amount,
      channel: 'system',
      reference_note: reversalRef,
      running_balance: runningBalance,
      created_by: createdBy
    }))

    return { txn, newBalance: runningBalance }
  }

  try {
    const { txn, newBalance } = session
      ? await runInSession(session)
      : await withWalletSession(runInSession)

    return { txnId: txn.txn_id, newBalance }
  } catch (error) {
    if (error && error.code === 11000) {
      const existing = await WalletTransaction.findOne({
        customer_id: customerId,
        type: 'order_debit_reversal',
        reference_note: reversalRef
      }).lean()
      if (existing) {
        return { txnId: existing.txn_id, newBalance: existing.running_balance }
      }
    }
    const existing = await WalletTransaction.findOne({ txn_id: idempotencyKey }).lean()
    if (existing) {
      if (
        existing.type !== 'order_debit_reversal' ||
        existing.customer_id !== customerId
      ) {
        throw error
      }
      return { txnId: existing.txn_id, newBalance: existing.running_balance }
    }
    throw error
  }
}

module.exports = reverseOrderDebit
