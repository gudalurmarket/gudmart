'use strict'

process.env.NODE_ENV = 'test'

const mongoose = require('mongoose')

beforeAll(async () => {
  const uri = process.env.MONGODB_TEST_URI
  if (!uri) {
    throw new Error(
      'MONGODB_TEST_URI is not set. Use tests/setup/globalSetup.js or set MONGODB_TEST_URI to a replica-set URI.'
    )
  }
  if (mongoose.connection.readyState === 0) {
    // Each Jest worker gets its own database on the shared mongodb-memory-server
    // instance — test files running concurrently in different workers must not
    // share collections, since integration tests wipe the entire database between tests.
    const dbName = `farmer-market-test-${process.env.JEST_WORKER_ID ?? '1'}`
    await mongoose.connect(uri, { dbName })

    // On a brand-new per-worker database, mongoose builds indexes (incl. unique
    // constraints) asynchronously after connect — routes that rely on a unique
    // index throwing E11000 (rather than a pre-insert query) can otherwise race
    // ahead of index creation. Every model needed by this test file is already
    // registered by the time this hook runs, so block until indexes are ready.
    await Promise.all(Object.values(mongoose.connection.models).map(m => m.init()))
  }
})

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
})
