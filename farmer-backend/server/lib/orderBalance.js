'use strict'

/**
 * Part of a just-applied wallet debit that the wallet could not cover (paise).
 * A debit may leave wallet_balance negative; the portion of `amount` that pushed it below
 * zero is what the customer still owes for that debit (the order's balance_due).
 *
 * @param {number} amount - debit amount in paise
 * @param {number} newBalance - wallet_balance after the debit
 * @returns {number}
 */
function uncoveredByWallet (amount, newBalance) {
  return Math.max(0, Math.min(amount, -newBalance))
}

module.exports = { uncoveredByWallet }
