'use strict'

const Customer = require('../../models/Customer')
const {
  CustomerNotFoundError,
  WalletInsufficientError,
  WalletValidationError
} = require('../../lib/errors')
const {
  assertPositive,
  assertString,
  assertIdempotencyKey,
  buildTxnDoc,
  withWalletSession,
  applyCreditMutation,
  applyGatedDebitMutation,
  resolveIdempotentDuplicate
} = require('./_helpers')

/**
 * manualAdjustment — corrective credit or gated debit (B2 §4.8).
 */
async function manualAdjustment ({
  idempotencyKey,
  customerId,
  amount,
  direction,
  reason,
  weekId,
  createdBy
}) {
  assertIdempotencyKey(idempotencyKey)
  assertString(customerId, 'customerId')
  assertPositive(amount, 'amount')
  assertString(createdBy, 'createdBy')
  if (direction !== 'credit' && direction !== 'debit') {
    throw new WalletValidationError(
      `direction must be 'credit' or 'debit'; received '${direction}'`,
      { direction }
    )
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new WalletValidationError(
      'manualAdjustment requires a non-empty reason (B2 §4.8: mandatory)',
      {}
    )
  }

  const expected = { type: 'manual_adjustment', customer_id: customerId, amount }
  const trimmedReason = reason.trim()

  try {
    const { txn, newBalance } = await withWalletSession(async (session) => {
      if (direction === 'credit') {
        return applyCreditMutation(session, {
          idempotencyKey,
          customerId,
          amount,
          expected,
          buildDoc: (runningBalance) => buildTxnDoc({
            txn_id: idempotencyKey,
            customer_id: customerId,
            week_id: weekId ?? null,
            type: 'manual_adjustment',
            amount,
            channel: 'system',
            reference_note: `direction:credit; reason:${trimmedReason}`,
            running_balance: runningBalance,
            created_by: createdBy
          })
        })
      }

      return applyGatedDebitMutation(session, {
        idempotencyKey,
        customerId,
        amount,
        expected,
        buildDoc: (runningBalance) => buildTxnDoc({
          txn_id: idempotencyKey,
          customer_id: customerId,
          week_id: weekId ?? null,
          type: 'manual_adjustment',
          amount,
          channel: 'system',
          reference_note: `direction:debit; reason:${trimmedReason}`,
          running_balance: runningBalance,
          created_by: createdBy
        }),
        onInsufficient: async (activeSession) => {
          const fresh = await Customer.findOne({ customer_id: customerId })
            .session(activeSession)
            .lean()
          if (!fresh) {
            throw new CustomerNotFoundError(`Customer not found: ${customerId}`, { customerId })
          }
          throw new WalletInsufficientError(
            `Wallet balance insufficient for debit of ${amount} paise`,
            {
              customerId,
              requiredPaise: amount,
              currentBalancePaise: fresh.wallet_balance
            }
          )
        }
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

module.exports = manualAdjustment
