'use strict'

// Zero every customer's wallet balance. A dry run unless --confirm is given.
//
//   MONGODB_URI=... node scripts/zero-wallet-balances.js [--confirm] [--run-id <id>]
//
// Intended for the testing → production switch, and safe to run again later. Each customer with
// a non-zero balance gets one WalletEngine.manualAdjustment: a debit for a positive balance, a
// credit for a negative one (debt). Nothing is deleted — the ledger keeps the adjustment rows
// and the original history — and wallet_balance is never written directly (CLAUDE.md §3.2).
//
// Idempotency keys include the run id, so a re-run (default: a fresh timestamp id) adjusts
// whatever balances are non-zero at that moment. Re-running with the same --run-id after a
// partial failure resumes without double-adjusting. Back up the database first (backup-db.js).

const mongoose = require('mongoose')
const WalletEngine = require('../server/modules/walletEngine')
const Customer = require('../server/models/Customer')

const DB_NAME = process.env.MONGODB_DB_NAME || 'farmer-market'
const REASON = 'Zero all wallet balances (one-time reset)'

/**
 * @param {{ confirm: boolean, runId: string, log?: (line: string) => void, filter?: object }} options
 *   filter narrows which customers are touched (tests only; the CLI always zeroes everyone)
 * @returns {Promise<{ adjusted: number, skipped: number, remainingNonZero: number }>}
 */
async function zeroWalletBalances ({ confirm, runId, log = () => {}, filter = {} }) {
  const nonZero = { ...filter, wallet_balance: { $ne: 0 } }
  const customers = await Customer.find(nonZero)
    .select('customer_id name wallet_balance')
    .sort({ customer_id: 1 })
    .lean()

  const owed = customers.filter(c => c.wallet_balance < 0)
  const credit = customers.filter(c => c.wallet_balance > 0)
  const sum = (rows) => rows.reduce((total, c) => total + Math.abs(c.wallet_balance), 0)
  log(`${confirm ? 'APPLYING' : 'DRY RUN'} (run id ${runId}): ${customers.length} customer(s) with a non-zero balance`)
  log(`  prepaid credit to clear: ${credit.length} customer(s), ${sum(credit)} paise`)
  log(`  debt to clear:           ${owed.length} customer(s), ${sum(owed)} paise`)
  customers.forEach(c => log(`    ${c.customer_id}  ${c.name ?? ''}  ${c.wallet_balance} paise`))

  let adjusted = 0
  if (confirm) {
    for (const c of customers) {
      const { newBalance } = await WalletEngine.manualAdjustment({
        idempotencyKey: `zero-wallet-${runId}-${c.customer_id}`,
        customerId: c.customer_id,
        amount: Math.abs(c.wallet_balance),
        direction: c.wallet_balance > 0 ? 'debit' : 'credit',
        reason: REASON,
        weekId: null,
        createdBy: 'system-zero-wallets'
      })
      adjusted += 1
      log(`  zeroed ${c.customer_id}: new balance ${newBalance}`)
    }
  }

  const remainingNonZero = await Customer.countDocuments(nonZero)
  return { adjusted, skipped: customers.length - adjusted, remainingNonZero }
}

async function main () {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not defined')
  const i = process.argv.indexOf('--run-id')
  const runId = i > -1 ? process.argv[i + 1] : new Date().toISOString().replace(/[-:.TZ]/g, '')

  await mongoose.connect(uri, { dbName: DB_NAME })
  const result = await zeroWalletBalances({
    confirm: process.argv.includes('--confirm'),
    runId,
    log: console.log
  })
  console.log(`Done. adjusted=${result.adjusted} remaining non-zero=${result.remainingNonZero}`)
  if (!process.argv.includes('--confirm')) console.log('Dry run only. Re-run with --confirm to apply.')
  await mongoose.disconnect()
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
  })
}

module.exports = { zeroWalletBalances }
