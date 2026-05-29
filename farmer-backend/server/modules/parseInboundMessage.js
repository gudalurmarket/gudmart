'use strict'

const QTY_UNIT_PATTERN = /(\d+(?:\.\d+)?)\s*(100g|kg|g|pieces?|bunches?|bunch)?\b/i

/**
 * @param {string} text
 * @returns {{ quantity: number | null, unit: string | null, raw_product_text: string }}
 */
function extractQuantityAndUnit (text) {
  const match = text.match(QTY_UNIT_PATTERN)
  if (!match) {
    return {
      quantity: null,
      unit: null,
      raw_product_text: text.trim()
    }
  }

  let quantity = Number(match[1])
  const unitToken = (match[2] || '').toLowerCase()
  let unit = 'piece'

  if (unitToken === 'kg') {
    unit = 'kg'
  } else if (unitToken === '100g') {
    unit = '100g'
  } else if (unitToken === 'g') {
    unit = '100g'
    quantity = quantity / 100
  } else if (unitToken.startsWith('piece')) {
    unit = 'piece'
  } else if (unitToken.startsWith('bunch')) {
    unit = 'bunch'
  }

  const raw_product_text = text
    .replace(match[0], '')
    .replace(/\s+/g, ' ')
    .trim()

  return { quantity, unit, raw_product_text }
}

/**
 * @param {string} rawProductText
 * @param {Array<{ product_id: string, name_en: string, name_ta?: string }>} catalogue
 * @returns {string | null}
 */
function matchProductId (rawProductText, catalogue) {
  const needle = rawProductText.toLowerCase().trim()
  if (!needle) return null

  for (const product of catalogue) {
    if (product.name_en.toLowerCase() === needle) {
      return product.product_id
    }
    if (product.name_ta && product.name_ta.toLowerCase() === needle) {
      return product.product_id
    }
  }

  return null
}

/**
 * @param {{ raw_product_text: string, quantity: number | null }} fields
 * @returns {'clean' | 'partial' | 'manual_required'}
 */
function assignConfidence ({ raw_product_text, quantity }) {
  const hasName = Boolean(raw_product_text)
  if (hasName && quantity != null) return 'clean'
  if (hasName || quantity != null) return 'partial'
  return 'manual_required'
}

/**
 * @param {string} rawText
 * @returns {{ raw_text: string, product_id: null, raw_product_text: string, quantity: number | null, unit: string | null, confidence: string }}
 */
function parseLineItem (rawText) {
  const { quantity, unit, raw_product_text } = extractQuantityAndUnit(rawText)
  const normalized = raw_product_text.toLowerCase().trim()
  const confidence = assignConfidence({ raw_product_text: normalized, quantity })

  return {
    raw_text: rawText,
    product_id: null,
    raw_product_text: normalized || null,
    quantity,
    unit: quantity != null ? unit : null,
    confidence
  }
}

/**
 * @param {{ body?: string | null }} inboundMessage
 * @returns {Array<{ raw_text: string, product_id: null, raw_product_text: string | null, quantity: number | null, unit: string | null, confidence: string }>}
 */
function parseInboundMessage (inboundMessage) {
  const body = inboundMessage?.body
  if (!body || typeof body !== 'string' || !body.trim()) {
    return []
  }

  const segments = body
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)

  return segments.map((rawText) => parseLineItem(rawText))
}

module.exports = {
  parseInboundMessage,
  extractQuantityAndUnit,
  matchProductId,
  assignConfidence
}
