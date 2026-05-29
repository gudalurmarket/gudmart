'use strict'

/**
 * WalletEngine — single public interface for all wallet operations.
 *
 * Per ARCHITECTURE §4.3 and B2 Wallet Engine §1:
 *   "The Wallet Engine is the only component permitted to create
 *    wallet_transactions documents and to update customers.wallet_balance.
 *    No route, batch job, or test helper may bypass it."
 *
 * Import shape (mandatory):
 *     const WalletEngine = require('./modules/walletEngine')
 *     await WalletEngine.debitForOrder({ ... })
 *
 * Do NOT import individual method files from outside this directory.
 */

const { assertInteger } = require('./_helpers')

const topUp = require('./topUp')
const debitForOrder = require('./debitForOrder')
const reverseOrderDebit = require('./reverseOrderDebit')
const applyPriceDiff = require('./applyPriceDiff')
const applyBalancePayment = require('./applyBalancePayment')
const manualAdjustment = require('./manualAdjustment')

// ── Startup self-check
// Per B3 spec: "on server start, WalletEngine runs a check that throws if any
// monetary argument is non-integer." This guard fires at module load time.
;(function selfCheck () {
  let threw = false
  try {
    assertInteger(1.5, '__selfcheck__')
  } catch (_) {
    threw = true
  }
  if (!threw) {
    throw new Error(
      'FATAL: WalletEngine startup self-check failed — assertInteger did not ' +
      'reject a float. Wallet integrity is not guaranteed; refusing to start.'
    )
  }
})()

module.exports = {
  topUp,
  debitForOrder,
  reverseOrderDebit,
  applyPriceDiff,
  applyBalancePayment,
  manualAdjustment
}
