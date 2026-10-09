'use strict'

// Restore a backup made by backup-db.js. DESTRUCTIVE: for every collection in the
// backup it deletes the current contents and re-inserts the backed-up documents.
// Usage: MONGODB_URI=... node scripts/restore-db.js <backupDir> [--confirm]
// Without --confirm it only prints what it would do.

const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')
const { EJSON } = require('bson')

const DB_NAME = process.env.MONGODB_DB_NAME || 'farmer-market'
const CONFIRM = process.argv.includes('--confirm')

async function main () {
  const uri = process.env.MONGODB_URI
  const dir = process.argv[2]
  if (!uri) throw new Error('MONGODB_URI is not defined')
  if (!dir || dir.startsWith('--')) throw new Error('Usage: restore-db.js <backupDir> [--confirm]')

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const indexes = EJSON.parse(fs.readFileSync(path.join(dir, 'indexes.json'), 'utf8'))
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 15000 })
  const db = client.db(DB_NAME)

  console.log(`Backup of "${manifest.db}" taken ${manifest.taken_at}; restoring into "${DB_NAME}"`)
  for (const [name, count] of Object.entries(manifest.collections)) {
    const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
    if (docs.length !== count) throw new Error(`${name}: file has ${docs.length} docs, manifest says ${count}`)
    const now = await db.collection(name).countDocuments({})
    console.log(`  ${name.padEnd(26)} current=${now}  ->  restore=${count}`)
    if (!CONFIRM) continue
    await db.collection(name).deleteMany({})
    if (docs.length) await db.collection(name).insertMany(docs)
    for (const idx of indexes[name] ?? []) {
      if (idx.name === '_id_') continue
      const { key, name: idxName, v, ns, ...options } = idx
      await db.collection(name).createIndex(key, { name: idxName, ...options })
    }
  }
  console.log(CONFIRM ? '\nRestore complete.' : '\nDry run only. Re-run with --confirm to restore.')
  await client.close()
}

main().catch((err) => { console.error(err.message); process.exit(1) })
