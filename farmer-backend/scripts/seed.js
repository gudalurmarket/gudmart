'use strict'

const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')

const SEED_DATA_DIR = path.join(__dirname, 'seed-data')

/** Must match server/app.js DB_NAME — API reads this database, not the URI default. */
const DB_NAME = process.env.MONGODB_DB_NAME || 'farmer-market'

function loadJson (filename) {
  const filePath = path.join(SEED_DATA_DIR, filename)
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function parseDate (value) {
  if (!value) return new Date()
  return value instanceof Date ? value : new Date(value)
}

async function upsertRecords (collection, records, filterKey, toDocument) {
  for (const record of records) {
    const filter = { [filterKey]: record[filterKey] }
    await collection.updateOne(
      filter,
      { $set: toDocument(record) },
      { upsert: true }
    )
  }
  return records.length
}

async function seedProductCatalogue (db) {
  const records = loadJson('catalogue.json')
  const collection = db.collection('product_catalogue')
  const count = await upsertRecords(collection, records, 'product_id', (record) => ({
    product_id: record.product_id,
    name_en: record.name_en,
    name_ta: record.name_ta ?? null,
    default_unit: record.default_unit,
    active: record.active ?? true,
    created_at: parseDate(record.created_at),
    created_by: record.created_by
  }))
  console.log(`catalogue: ${count} upserted`)
}

async function seedCustomers (db) {
  const records = loadJson('customers.json')
  const collection = db.collection('customers')
  const count = await upsertRecords(collection, records, 'phone', (record) => ({
    customer_id: record.customer_id,
    name: record.name,
    phone: record.phone,
    active: record.active ?? true,
    wallet_balance: record.wallet_balance,
    created_at: parseDate(record.created_at),
    created_by: record.created_by
  }))
  console.log(`customers: ${count} upserted`)
}

async function seedFarmers (db) {
  const records = loadJson('farmers.json')
  const collection = db.collection('farmers')
  const count = await upsertRecords(collection, records, 'phone', (record) => ({
    farmer_id: record.farmer_id,
    name: record.name,
    phone: record.phone,
    location: record.location,
    farmer_type: record.farmer_type,
    active: record.active ?? true,
    created_at: parseDate(record.created_at),
    created_by: record.created_by
  }))
  console.log(`farmers: ${count} upserted`)
}

async function seedSynonymsConfig (db) {
  const doc = loadJson('synonyms.json')
  await db.collection('config').updateOne(
    { _id: doc._id },
    {
      $set: {
        _id: doc._id,
        table: doc.table,
        updated_at: parseDate(doc.updated_at),
        updated_by: doc.updated_by
      }
    },
    { upsert: true }
  )
  console.log('synonyms config: upserted')
}

async function run () {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI environment variable is not set')
    process.exit(1)
  }

  let client
  try {
    client = new MongoClient(uri)
    await client.connect()
    const db = client.db(DB_NAME)
    console.log(`Using database: ${DB_NAME}`)

    await seedProductCatalogue(db)
    await seedCustomers(db)
    await seedFarmers(db)
    await seedSynonymsConfig(db)

    console.log('Seed complete.')
  } catch (err) {
    console.error(err)
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
    }
  }
}

run()

