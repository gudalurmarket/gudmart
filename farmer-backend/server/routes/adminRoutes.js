'use strict'

const { reloadSynonymCache, getSynonymCache } = require('../modules/parser')
const ProductCatalogue = require('../models/ProductCatalogue')

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

  // Active catalogue products that have no entry in config/synonyms. The operator UI
  // shows this as a notice asking the IT manager to run the synonym (LLM) pass —
  // the system itself never calls an AI service (CLAUDE.md §18.1).
  fastify.get('/admin/synonyms/gaps', async () => {
    const [products, doc] = await Promise.all([
      ProductCatalogue.find({ active: true }).select('product_id name_en').sort({ name_en: 1 }).lean(),
      fastify.db.collection('config').findOne({ _id: 'synonyms' })
    ])
    const covered = new Set((doc?.table ?? []).map((entry) => String(entry.canonical).toLowerCase()))
    const missing = products
      .filter((p) => !covered.has(p.name_en.toLowerCase()))
      .map((p) => ({ productId: p.product_id, nameEn: p.name_en }))
    return { count: missing.length, missing }
  })
}

module.exports = adminRoutes
