'use strict'

const { bestMatch } = require('../lib/similarity')

const CANONICAL_UNITS = new Set(['kg', '100g', 'piece', 'bunch'])

const UNIT_ALIASES = {
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  '100g': ['100g', 'g', 'gm', 'gms', 'gram', 'grams'],
  piece: ['piece', 'pieces', 'pc', 'pcs'],
  bunch: ['bunch', 'bun', 'bns', 'bund', 'bunches']
}

const REPEAT_ORDER_PHRASES = [
  'same as last week',
  'as before',
  'usual',
  'repeat',
  'same',
  // Tamil — operator session (tests / PRD)
  'வழக்கம் போல',
  'முன்பு போல'
]

const UNICODE_FRACTIONS = [
  { char: '½', value: 0.5 },
  { char: '¼', value: 0.25 }
]

const FRACTION_PATTERNS = [
  { pattern: /\b1\/2\b/i, value: 0.5, raw: '1/2' },
  { pattern: /\bhalf\b/i, value: 0.5, raw: 'half' },
  { pattern: /\b1\/4\b/i, value: 0.25, raw: '1/4' },
  { pattern: /\bquarter\b/i, value: 0.25, raw: 'quarter' }
]

const QTY_NUMBER_PATTERN = /(\d+(?:\.\d+)?)/

/**
 * Longest-token-first alternation so "gm" wins over "g" and "pcs" over "pc".
 * @returns {RegExp}
 */
function buildQtyUnitCombinedPattern () {
  const tokens = new Set([...CANONICAL_UNITS])
  for (const aliases of Object.values(UNIT_ALIASES)) {
    for (const alias of aliases) tokens.add(alias)
  }
  const unitPart = [...tokens]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|')
  return new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitPart})?`, 'i')
}

const QTY_UNIT_COMBINED_PATTERN = buildQtyUnitCombinedPattern()

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex (value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeText (text) {
  const protectedDecimals = text.replace(/(\d)\.(\d)/g, '$1<DECIMAL>$2')
  return protectedDecimals
    .toLowerCase()
    .replace(/[,.!?]/g, ' ')
    .replace(/<decimal>/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {unknown} synonymTable
 * @returns {Array<{ canonical: string, aliases: string[] }>}
 */
function normalizeSynonymTable (synonymTable) {
  if (Array.isArray(synonymTable)) {
    return synonymTable.map((entry) => ({
      canonical: entry.canonical,
      aliases: entry.aliases || []
    }))
  }

  if (synonymTable && typeof synonymTable === 'object') {
    return Object.entries(synonymTable).map(([canonical, aliases]) => ({
      canonical,
      aliases: Array.isArray(aliases) ? aliases : []
    }))
  }

  return []
}

/**
 * @param {string} token
 * @returns {string | null}
 */
function canonicalizeUnitToken (token) {
  if (!token) return null
  const lower = token.toLowerCase()
  for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    if (aliases.includes(lower)) return canonical
  }
  return CANONICAL_UNITS.has(lower) ? lower : null
}

/**
 * @param {string} rawText
 * @returns {string[]}
 */
function segmentMessage (rawText) {
  if (!rawText || typeof rawText !== 'string') return []
  return rawText
    .split(/[\n,;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

/**
 * @param {string} segment
 * @returns {{ value: number, rawToken: string } | null}
 */
function extractQuantity (segment) {
  const normalized = normalizeText(segment)
  if (!normalized) return null

  for (const { char, value } of UNICODE_FRACTIONS) {
    const index = normalized.indexOf(char)
    if (index === -1) continue
    return { value, rawToken: char }
  }

  for (const { pattern, value, raw } of FRACTION_PATTERNS) {
    const match = normalized.match(pattern)
    if (!match) continue
    return { value, rawToken: match[0] || raw }
  }

  const combined = normalized.match(QTY_UNIT_COMBINED_PATTERN)
  if (combined) {
    const value = Number(combined[1])
    if (Number.isFinite(value) && value > 0) {
      return { value, rawToken: combined[0].trim() }
    }
  }

  const match = normalized.match(QTY_NUMBER_PATTERN)
  if (!match) return null

  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null

  return { value, rawToken: match[1] }
}

/**
 * Collect unit tokens from built-in aliases and synonym table entries.
 *
 * @param {Array<{ canonical: string, aliases: string[] }>} synonymEntries
 * @returns {Array<{ canonical: string, token: string }>}
 */
function buildUnitTokenIndex (synonymEntries) {
  const tokens = []

  for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    for (const token of aliases) {
      tokens.push({ canonical, token })
    }
  }

  for (const entry of synonymEntries) {
    const canonical = canonicalizeUnitToken(entry.canonical)
    if (!canonical) continue
    tokens.push({ canonical, token: entry.canonical })
    for (const alias of entry.aliases) {
      tokens.push({ canonical, token: alias })
    }
  }

  return tokens.sort((a, b) => b.token.length - a.token.length)
}

/**
 * @param {string} segment
 * @param {unknown} synonymTable
 * @returns {{ canonical: string, rawToken: string } | null}
 */
function extractUnit (segment, synonymTable) {
  const normalized = normalizeText(segment)
  if (!normalized) return null

  const synonymEntries = normalizeSynonymTable(synonymTable)
  const unitTokens = buildUnitTokenIndex(synonymEntries)

  let best = null
  let bestIndex = -1

  for (const { canonical, token } of unitTokens) {
    const escaped = escapeRegex(token.toLowerCase())
    const regex = new RegExp(`(?:^|[\\s\\d])(${escaped})(?=\\s|$)`, 'i')
    const match = regex.exec(normalized)
    if (!match) continue
    const rawToken = match[1]
    const index = match.index + match[0].indexOf(rawToken)
    if (best == null || index < bestIndex) {
      best = { canonical, rawToken }
      bestIndex = index
    }
  }

  if (best) return best

  const combined = normalized.match(QTY_UNIT_COMBINED_PATTERN)
  if (combined && combined[2]) {
    const canonical = canonicalizeUnitToken(combined[2])
    if (canonical) {
      return { canonical, rawToken: combined[2] }
    }
  }

  return null
}

/**
 * @param {string} segment
 * @param {string | undefined} qtyToken
 * @param {string | undefined} unitToken
 * @returns {string}
 */
function extractProductText (segment, qtyToken, unitToken) {
  let text = normalizeText(segment)

  if (qtyToken) {
    const qtyRegex = new RegExp(escapeRegex(qtyToken), 'gi')
    text = text.replace(qtyRegex, ' ')
  }

  if (unitToken && (!qtyToken || !qtyToken.toLowerCase().includes(unitToken.toLowerCase()))) {
    const unitRegex = new RegExp(`(?:^|[\\s\\d])${escapeRegex(unitToken)}(?=\\s|$)`, 'gi')
    text = text.replace(unitRegex, ' ')
  }

  for (const { char } of UNICODE_FRACTIONS) {
    text = text.replace(char, ' ')
  }

  return text.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} productText
 * @param {Array<{ canonical: string, aliases: string[] }>} synonymEntries
 * @returns {string | null}
 */
function resolveProductCanonical (productText, synonymEntries) {
  const needle = productText.trim().toLowerCase()
  if (!needle) return null

  for (const entry of synonymEntries) {
    if (canonicalizeUnitToken(entry.canonical)) continue

    const canonical = entry.canonical.toLowerCase()
    if (needle === canonical) return entry.canonical

    for (const alias of entry.aliases) {
      if (needle === alias.toLowerCase()) return entry.canonical
    }
  }

  return null
}

/**
 * @param {string} productText
 * @param {Array<{ product_id: string, name_en: string, name_ta?: string | null, unit: string }>} produceList
 * @param {unknown} synonymTable
 * @returns {{ product_id: string, unit: string } | null}
 */
function matchProduct (productText, produceList, synonymTable) {
  const needle = productText.trim().toLowerCase()
  if (!needle) return null

  const synonymEntries = normalizeSynonymTable(synonymTable)
  const canonical = resolveProductCanonical(productText, synonymEntries)

  if (canonical) {
    const canonLower = canonical.toLowerCase()
    for (const product of produceList) {
      if (product.name_en.toLowerCase() === canonLower) {
        return { product_id: product.product_id, unit: product.unit }
      }
    }
  }

  for (const product of produceList) {
    if (product.name_en.toLowerCase() === needle) {
      return { product_id: product.product_id, unit: product.unit }
    }
    if (product.name_ta && product.name_ta.toLowerCase() === needle) {
      return { product_id: product.product_id, unit: product.unit }
    }
  }

  let best = null
  let bestScore = 0

  for (const product of produceList) {
    const name = product.name_en.toLowerCase()
    if (name.length < 2 || needle.length < 2) continue
    if (needle.startsWith(name + ' ') || needle === name || name.startsWith(needle)) {
      const score = name.length
      if (score > bestScore) {
        bestScore = score
        best = { product_id: product.product_id, unit: product.unit }
      }
    }
  }

  return best
}

/**
 * @param {{ product_id: string, unit: string } | null} match
 * @param {{ value: number, rawToken: string } | null} qty
 * @param {{ canonical: string, rawToken: string } | null} unit
 * @returns {'clean' | 'partial' | 'manual_required'}
 */
function deriveConfidence (match, qty, unit) {
  if (!match) return 'manual_required'
  if (qty != null && unit != null) return 'clean'
  return 'partial'
}

/**
 * @param {string} rawText
 * @returns {boolean}
 */
function isRepeatOrderMessage (rawText) {
  const normalized = rawText.toLowerCase()
  return REPEAT_ORDER_PHRASES.some((phrase) => normalized.includes(phrase.toLowerCase()))
}

/**
 * @param {string | null} productText
 * @param {Array<{ product_id: string, name_en: string, name_ta?: string | null, unit: string }>} produceList
 * @returns {{
 *   suggestedProductId: string | null,
 *   suggestedProductName: string | null,
 *   suggestedProductNameTa: string | null,
 *   similarityScore: number | null
 * }}
 */
function buildSimilaritySuggestion (productText, produceList) {
  const emptySuggestion = {
    suggestedProductId: null,
    suggestedProductName: null,
    suggestedProductNameTa: null,
    similarityScore: null
  }

  const query = productText?.trim()
  if (!query || !Array.isArray(produceList) || produceList.length === 0) {
    return emptySuggestion
  }

  const candidates = produceList.map((item) => ({
    id: item.product_id,
    nameEn: item.name_en,
    nameTa: item.name_ta || null
  }))
  const suggestion = bestMatch(query, candidates)
  if (!suggestion) return emptySuggestion

  return {
    suggestedProductId: suggestion.id,
    suggestedProductName: suggestion.nameEn,
    suggestedProductNameTa: suggestion.nameTa,
    similarityScore: suggestion.score
  }
}

/**
 * @param {string} segment
 * @param {Array<{ product_id: string, name_en: string, name_ta?: string | null, unit: string }>} produceList
 * @param {unknown} synonymTable
 * @returns {{
 *   rawText: string,
 *   productId: string | null,
 *   rawProductText: string,
 *   quantity: number | null,
 *   unit: string | null,
 *   confidence: 'clean' | 'partial' | 'manual_required',
 *   suggestedProductId: string | null,
 *   suggestedProductName: string | null,
 *   suggestedProductNameTa: string | null,
 *   similarityScore: number | null,
 *   reason?: string
 * }}
 */
function parseSegment (segment, produceList, synonymTable) {
  const qty = extractQuantity(segment)
  const unitResult = extractUnit(segment, synonymTable)
  const rawProductText = extractProductText(
    segment,
    qty?.rawToken,
    unitResult?.rawToken
  )

  const match = matchProduct(rawProductText, produceList, synonymTable)
  const productId = match?.product_id ?? null
  const unit = unitResult?.canonical ?? null
  const confidence = deriveConfidence(match, qty, unitResult)

  const suggestion = productId == null
    ? buildSimilaritySuggestion(rawProductText, produceList)
    : {
        suggestedProductId: null,
        suggestedProductName: null,
        suggestedProductNameTa: null,
        similarityScore: null
      }

  return {
    rawText: segment,
    productId,
    rawProductText,
    quantity: qty?.value ?? null,
    unit,
    confidence,
    ...suggestion
  }
}

/**
 * @param {string} rawText
 * @param {Array<{ product_id: string, name_en: string, name_ta?: string | null, unit: string }>} produceList
 * @param {unknown} synonymTable
 * @returns {Array<{
 *   rawText: string,
 *   productId: string | null,
 *   rawProductText: string,
 *   quantity: number | null,
 *   unit: string | null,
 *   confidence: 'clean' | 'partial' | 'manual_required',
 *   reason?: string
 * }>}
 */
function parseMessage (rawText, produceList, synonymTable) {
  const safeProduceList = Array.isArray(produceList) ? produceList : []

  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return []
  }

  const noSuggestion = {
    suggestedProductId: null,
    suggestedProductName: null,
    suggestedProductNameTa: null,
    similarityScore: null
  }

  if (isRepeatOrderMessage(rawText)) {
    return [{
      rawText,
      productId: null,
      rawProductText: null,
      quantity: null,
      unit: null,
      confidence: 'manual_required',
      reason: 'repeat_order',
      ...noSuggestion
    }]
  }

  const segments = segmentMessage(rawText)
  if (segments.length === 0) {
    return [{
      rawText: rawText.trim(),
      productId: null,
      rawProductText: '',
      quantity: null,
      unit: null,
      confidence: 'manual_required',
      ...noSuggestion
    }]
  }

  return segments.map((segment) =>
    parseSegment(segment, safeProduceList, synonymTable)
  )
}

/** @type {unknown[]} */
let synonymCache = []

/**
 * @returns {unknown[]}
 */
function getSynonymCache () {
  return synonymCache
}

/**
 * Load synonym table from MongoDB config document into module-scope cache.
 * @param {import('mongodb').Db} db
 */
async function reloadSynonymCache (db) {
  const doc = await db.collection('config').findOne({ _id: 'synonyms' })
  synonymCache = doc?.table ?? []
}

module.exports = {
  parseMessage,
  segmentMessage,
  extractQuantity,
  extractUnit,
  extractProductText,
  matchProduct,
  deriveConfidence,
  buildSimilaritySuggestion,
  getSynonymCache,
  reloadSynonymCache
}
