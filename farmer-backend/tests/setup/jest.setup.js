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
    await mongoose.connect(uri, { dbName: 'farmer-market-test' })
  }
})

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
})
