'use strict'

const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')

const SEED_DATA_DIR = path.join(__dirname, 'seed-data')

const FARMER_TYPES = new Set(['outstation', 'local'])
const DEFAULT_UNITS = new Set(['kg', 'piece', 'bunch', '100g'])
const SYNONYM_LANGUAGES = new Set(['en', 'ta', 'mixed'])

function readJsonFile (filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function assertRequired (record, fields, fileLabel, recordIndex) {
  for (const field of fields) {
    const value = record[field]
    if (value === undefined || value === null || value === '') {
      throw new Error(
        `${fileLabel}: record at index ${recordIndex} is missing required field "${field}"`
      )
    }
  }
}

function tallyUpsert (totals, result) {
  const inserted = result.upsertedCount ?? 0
  const matched = result.matchedCount ?? 0
  totals.inserted += inserted
  totals.alreadyExisted += matched > 0 && inserted === 0 ? matched : 0
}

async function seedCustomers (db) {
  const filePath = path.join(SEED_DATA_DIR, 'customers.json')
  const fileLabel = 'scripts/seed-data/customers.json'

  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${fileLabel} not found — skipping customers`)
    return
  }

  const records = readJsonFile(filePath)
  if (!Array.isArray(records)) {
    throw new Error(`${fileLabel}: expected a JSON array`)
  }

  records.forEach((record, index) => {
    assertRequired(record, ['name', 'phone'], fileLabel, index)
    const balance = record.wallet_balance ?? 0
    if (!Number.isInteger(balance)) {
      throw new Error(
        `${fileLabel}: customer "${record.name ?? record.phone}" (index ${index}) wallet_balance must be an integer paise value`
      )
    }
    if (balance < 0) {
      throw new Error(
        `${fileLabel}: customer "${record.name}" (index ${index}) wallet_balance must be >= 0`
      )
    }
  })

  const collection = db.collection('customers')
  const totals = { inserted: 0, alreadyExisted: 0 }

  for (const record of records) {
    const result = await collection.updateOne(
      { phone: record.phone },
      {
        $setOnInsert: {
          customer_id: randomUUID(),
          name: record.name,
          phone: record.phone,
          active: true,
          wallet_balance: record.wallet_balance ?? 0,
          created_at: new Date(),
          created_by: 'seed'
        }
      },
      { upsert: true }
    )
    tallyUpsert(totals, result)
  }

  console.log(
    `[customers]         inserted: ${totals.inserted}, already existed: ${totals.alreadyExisted}`
  )
}

async function seedFarmers (db) {
  const filePath = path.join(SEED_DATA_DIR, 'farmers.json')
  const fileLabel = 'scripts/seed-data/farmers.json'

  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${fileLabel} not found — skipping farmers`)
    return
  }

  const records = readJsonFile(filePath)
  if (!Array.isArray(records)) {
    throw new Error(`${fileLabel}: expected a JSON array`)
  }

  records.forEach((record, index) => {
    assertRequired(record, ['name', 'phone', 'location', 'farmer_type'], fileLabel, index)
    if (!FARMER_TYPES.has(record.farmer_type)) {
      throw new Error(
        `${fileLabel}: farmer "${record.name}" (index ${index}) farmer_type must be "outstation" or "local"`
      )
    }
  })

  const collection = db.collection('farmers')
  const totals = { inserted: 0, alreadyExisted: 0 }

  for (const record of records) {
    const result = await collection.updateOne(
      { phone: record.phone },
      {
        $setOnInsert: {
          farmer_id: randomUUID(),
          name: record.name,
          phone: record.phone,
          location: record.location,
          farmer_type: record.farmer_type,
          active: true,
          created_at: new Date(),
          created_by: 'seed'
        }
      },
      { upsert: true }
    )
    tallyUpsert(totals, result)
  }

  console.log(
    `[farmers]           inserted: ${totals.inserted}, already existed: ${totals.alreadyExisted}`
  )
}

async function seedProductCatalogue (db) {
  const filePath = path.join(SEED_DATA_DIR, 'catalogue.json')
  const fileLabel = 'scripts/seed-data/catalogue.json'

  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${fileLabel} not found — skipping product_catalogue`)
    return
  }

  const records = readJsonFile(filePath)
  if (!Array.isArray(records)) {
    throw new Error(`${fileLabel}: expected a JSON array`)
  }

  records.forEach((record, index) => {
    assertRequired(record, ['name_en', 'default_unit'], fileLabel, index)
    if (!DEFAULT_UNITS.has(record.default_unit)) {
      throw new Error(
        `${fileLabel}: item "${record.name_en}" (index ${index}) default_unit must be one of: kg, piece, bunch, 100g`
      )
    }
  })

  const collection = db.collection('product_catalogue')
  const totals = { inserted: 0, alreadyExisted: 0 }

  for (const record of records) {
    const result = await collection.updateOne(
      { name_en: record.name_en },
      {
        $setOnInsert: {
          product_id: randomUUID(),
          name_en: record.name_en,
          name_ta: record.name_ta ?? null,
          default_unit: record.default_unit,
          active: true,
          created_at: new Date(),
          created_by: 'seed'
        }
      },
      { upsert: true }
    )
    tallyUpsert(totals, result)
  }

  console.log(
    `[product_catalogue] inserted: ${totals.inserted}, already existed: ${totals.alreadyExisted}`
  )
}

async function seedSynonyms (db) {
  const filePath = path.join(SEED_DATA_DIR, 'synonyms.json')
  const fileLabel = 'scripts/seed-data/synonyms.json'

  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${fileLabel} not found — skipping config/synonyms`)
    return
  }

  const data = readJsonFile(filePath)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${fileLabel}: expected a JSON object`)
  }

  if (data.table === undefined || data.table === null) {
    throw new Error(`${fileLabel}: missing required field "table"`)
  }

  if (!Array.isArray(data.table)) {
    throw new Error(`${fileLabel}: field "table" must be an array`)
  }

  data.table.forEach((entry, index) => {
    assertRequired(entry, ['canonical', 'aliases'], fileLabel, index)
    if (!Array.isArray(entry.aliases)) {
      throw new Error(
        `${fileLabel}: record at index ${index} field "aliases" must be an array`
      )
    }
    if (entry.language !== undefined && entry.language !== null && entry.language !== '') {
      if (!SYNONYM_LANGUAGES.has(entry.language)) {
        throw new Error(
          `${fileLabel}: record at index ${index} language must be one of: en, ta, mixed`
        )
      }
    }
  })

  await db.collection('config').replaceOne(
    { _id: 'synonyms' },
    {
      _id: 'synonyms',
      table: data.table,
      updated_at: new Date(),
      updated_by: 'seed'
    },
    { upsert: true }
  )

  console.log(`[config/synonyms]   replaced (table entries: ${data.table.length})`)
}

async function run () {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI environment variable is required')
    process.exit(1)
  }

  let client
  try {
    client = new MongoClient(uri)
    await client.connect()
    const db = client.db()

    await seedCustomers(db)
    await seedFarmers(db)
    await seedProductCatalogue(db)
    await seedSynonyms(db)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
    }
  }

  process.exit(0)
}

run()
