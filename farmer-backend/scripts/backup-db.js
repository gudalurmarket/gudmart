'use strict'

// Full-database backup (no mongodump needed). Read-only against the database.
// Usage: MONGODB_URI=... node scripts/backup-db.js [outDir]
// Writes <outDir>/<collection>.json (Extended JSON), indexes.json, manifest.json.

const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')
const { EJSON } = require('bson')

const DB_NAME = process.env.MONGODB_DB_NAME || 'farmer-market'

async function main () {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not defined')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = process.argv[2] || path.join(process.env.HOME, 'gudmart-backups', stamp)
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 })

  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 15000 })
  const db = client.db(DB_NAME)
  const manifest = { db: DB_NAME, taken_at: new Date().toISOString(), collections: {} }
  const indexes = {}

  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.')) continue
    const docs = await db.collection(name).find({}).toArray()
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      EJSON.stringify(docs, { relaxed: false }, 2),
      { mode: 0o600 }
    )
    indexes[name] = await db.collection(name).indexes()
    manifest.collections[name] = docs.length
    console.log(`${name.padEnd(28)} ${docs.length}`)
  }

  fs.writeFileSync(path.join(outDir, 'indexes.json'), EJSON.stringify(indexes, { relaxed: false }, 2), { mode: 0o600 })
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
  await client.close()
  console.log(`\nBackup written to ${outDir}`)
}

main().catch((err) => { console.error(err.message); process.exit(1) })
