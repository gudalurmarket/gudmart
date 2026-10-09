'use strict'

// One-off pre-launch cleanup. DESTRUCTIVE with --confirm; a dry run otherwise.
//
//   MONGODB_URI=... node scripts/reset-test-data.js \
//     --weeks wk-2026-08-19,wk-2026-10-07 --backup <dir made by backup-db.js> [--confirm]
//
// 1. Deletes every document linked (by week_id) to the named weeks, and the weeks
//    themselves. Each named week must be in state 'closed' or the script aborts.
//    NOTE: this deletes wallet_transactions rows, an operator-sanctioned exception
//    to the immutability rule in CLAUDE.md §9 (one-off, test data only).
// 2. Deletes catalogue products whose name starts with "zz" (aborts if one is used
//    by a week that is being kept).
// 3. Sets every customer's wallet balance to 0 via WalletEngine.manualAdjustment
//    (a debit per customer) — never by writing wallet_balance directly (CLAUDE.md §3.2).

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const WalletEngine = require('../server/modules/walletEngine')

const DB_NAME = process.env.MONGODB_DB_NAME || 'farmer-market'
const CONFIRM = process.argv.includes('--confirm')
const argValue = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : undefined
}

const WEEK_LINKED = [
  'customer_orders', 'farmer_order_assignments', 'farmer_payments', 'inbound_messages',
  'weekly_produce_items', 'weekly_summaries', 'wallet_transactions', 'walkin_sales',
  'local_farmer_inbound', 'order_allocations'
]

async function main () {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not defined')
  const weekIds = (argValue('--weeks') || '').split(',').map(s => s.trim()).filter(Boolean)
  const backupDir = argValue('--backup')
  if (weekIds.length === 0) throw new Error('--weeks <id,id> is required')
  if (!backupDir || !fs.existsSync(path.join(backupDir, 'manifest.json'))) {
    throw new Error('--backup <dir> must point at a backup made by scripts/backup-db.js')
  }

  await mongoose.connect(uri, { dbName: DB_NAME })
  const db = mongoose.connection.db

  // ── Guard: every named week exists and is closed
  const weeks = await db.collection('market_weeks').find({ week_id: { $in: weekIds } }).toArray()
  const found = weeks.map(w => w.week_id)
  const missing = weekIds.filter(id => !found.includes(id))
  const notClosed = weeks.filter(w => w.state !== 'closed').map(w => `${w.week_id} (${w.state})`)
  if (missing.length) throw new Error(`Weeks not found: ${missing.join(', ')}`)
  if (notClosed.length) throw new Error(`Refusing: weeks not closed: ${notClosed.join(', ')}`)

  // ── Plan
  const plan = []
  for (const name of WEEK_LINKED) {
    plan.push({ name, n: await db.collection(name).countDocuments({ week_id: { $in: weekIds } }) })
  }
  plan.push({ name: 'market_weeks', n: weeks.length })

  const zz = await db.collection('product_catalogue').find({ name_en: /^zz/i }).toArray()
  const zzIds = zz.map(p => p.product_id)
  if (zzIds.length) {
    const keptUse = await db.collection('weekly_produce_items').countDocuments({ product_id: { $in: zzIds }, week_id: { $nin: weekIds } })
    if (keptUse) throw new Error(`Refusing: ${keptUse} produce items in kept weeks use a "zz" product`)
  }

  const customers = await db.collection('customers').find({ wallet_balance: { $gt: 0 } }).toArray()

  console.log(`Mode: ${CONFIRM ? 'CONFIRMED — WILL DELETE' : 'DRY RUN (no changes)'}   db=${DB_NAME}`)
  console.log(`Backup: ${backupDir}`)
  plan.forEach(p => console.log(`  delete ${p.name.padEnd(26)} ${p.n}`))
  console.log(`  delete product_catalogue (zz*)   ${zz.length}`)
  console.log(`  zero balance of ${customers.length} customers, total ${customers.reduce((s, c) => s + c.wallet_balance, 0)} paise`)
  customers.forEach(c => console.log(`    ${c.name.padEnd(16)} ${c.wallet_balance} paise`))

  if (!CONFIRM) {
    console.log('\nDry run only. Re-run with --confirm to apply.')
    await mongoose.disconnect()
    return
  }

  // ── Apply: week data first, then products, then balances
  for (const p of plan.filter(x => x.name !== 'market_weeks')) {
    const r = await db.collection(p.name).deleteMany({ week_id: { $in: weekIds } })
    console.log(`deleted ${p.name}: ${r.deletedCount}`)
  }
  const rw = await db.collection('market_weeks').deleteMany({ week_id: { $in: weekIds } })
  console.log(`deleted market_weeks: ${rw.deletedCount}`)
  if (zzIds.length) {
    const rp = await db.collection('product_catalogue').deleteMany({ product_id: { $in: zzIds } })
    console.log(`deleted product_catalogue: ${rp.deletedCount}`)
  }

  for (const c of customers) {
    const r = await WalletEngine.manualAdjustment({
      idempotencyKey: `cleanup-zero-${c.customer_id}`,
      customerId: c.customer_id,
      amount: c.wallet_balance,
      direction: 'debit',
      reason: 'Pre-launch cleanup: reset test balance to zero',
      weekId: null,
      createdBy: 'system-cleanup'
    })
    console.log(`zeroed ${c.name}: new balance ${r.newBalance}`)
  }

  const left = await db.collection('customers').countDocuments({ wallet_balance: { $ne: 0 } })
  console.log(`\nDone. Customers with non-zero balance remaining: ${left}`)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
