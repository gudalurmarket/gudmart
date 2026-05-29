'use strict'

const { MongoMemoryReplSet } = require('mongodb-memory-server')

module.exports = async function globalSetup () {
  if (process.env.MONGODB_TEST_URI) return

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  })
  await replSet.waitUntilRunning()

  process.env.MONGODB_TEST_URI = replSet.getUri()
  globalThis.__MONGO_REPLSET__ = replSet
}
