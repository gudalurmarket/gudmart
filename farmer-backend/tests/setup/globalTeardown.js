'use strict'

module.exports = async function globalTeardown () {
  const replSet = globalThis.__MONGO_REPLSET__
  if (replSet) {
    await replSet.stop()
    globalThis.__MONGO_REPLSET__ = undefined
  }
}
