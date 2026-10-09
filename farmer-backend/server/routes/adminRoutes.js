'use strict'

const { reloadSynonymCache, getSynonymCache } = require('../modules/parser')

/**
 * Operator-only maintenance endpoints. Not on the volunteer allowlist, so the
 * auth plugin rejects volunteers.
 */
async function adminRoutes (fastify) {
  // Re-read config/synonyms into the parser cache without restarting the server
  // (CLAUDE.md §12). The SIGHUP handler in server.js does the same thing.
  fastify.post('/admin/synonyms/reload', async () => {
    await reloadSynonymCache(fastify.db)
    return { entries: getSynonymCache().length }
  })
}

module.exports = adminRoutes
