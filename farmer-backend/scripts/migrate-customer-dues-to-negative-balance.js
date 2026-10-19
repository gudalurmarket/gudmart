'use strict'

// One-off migration for the negative-wallet model. A dry run unless --confirm is given.
//
//   MONGODB_URI=... node scripts/migrate-customer-dues-to-negative-balance.js [--confirm]
//
// Before this change an overdelivery that exceeded the wallet drained the wallet to zero and
// recorded the remainder as a `customer_due` ledger row, which never touched wallet_balance.
// Debt now lives in wallet_balance (negative = customer owes), so each customer's legacy dues
// are moved there with one WalletEngine.manualAdjustment debit — never by writing
// wallet_balance directly (CLAUDE.md §3.2). The `customer_due` rows stay as history.
//
// Review the dry-run output first: the old model had no way to mark a due as settled, so a due
// the customer already paid in cash would be counted here. Use --skip <customer_id,...> to
// leave those customers out. Idempotent: re-running does not debit a customer twice.

const mongoose = require('mongoose')
const WalletEngine = require('../server/modules/walletEngine')
const WalletTransaction = require('../server/models/WalletTransaction')

const DB_NAME = process.env.MONGODB_DB_NAME || 'farmer-market'
const CONFIRM = process.argv.includes('--confirm')
const argValue = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : undefined
}

async function main () {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not defined')
  const skip = new Set((argValue('--skip') || '').split(',').map(s => s.trim()).filter(Boolean))

  await mongoose.connect(uri, { dbName: DB_NAME })

  const rows = await WalletTransaction.aggregate([
    { $match: { type: 'customer_due' } },
    { $group: { _id: '$customer_id', total: { $sum: '$amount' }, rows: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ])

  console.log(`${CONFIRM ? 'APPLYING' : 'DRY RUN'}: ${rows.length} customer(s) with customer_due rows`)

  for (const row of rows) {
    const customerId = row._id
    if (skip.has(customerId)) {
      console.log(`  skip   ${customerId}`)
      continue
    }
    console.log(`  ${customerId}: ${row.rows} due row(s), total ${row.total} paise`)
    if (!CONFIRM) continue

    const { newBalance } = await WalletEngine.manualAdjustment({
      idempotencyKey: `migrate-customer-due-${customerId}`,
      customerId,
      amount: row.total,
      direction: 'debit',
      reason: 'Migrated legacy customer_due rows into negative wallet balance',
      createdBy: 'system'
    })
    console.log(`    -> wallet_balance now ${newBalance}`)
  }

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
