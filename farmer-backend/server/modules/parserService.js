'use strict'

const { parseInboundMessage } = require('./parseInboundMessage')

/**
 * @param {Array<{ confidence: string }>} parsedItems
 * @returns {'clean' | 'partial' | 'manual_required' | 'voice_note' | 'image' | 'no_active_week'}
 */
function deriveParseStatus (parsedItems) {
  if (!parsedItems.length) return 'manual_required'

  const allClean = parsedItems.every((item) => item.confidence === 'clean')
  if (allClean) return 'clean'

  const noneParsed = parsedItems.every((item) => item.confidence === 'manual_required')
  if (noneParsed) return 'manual_required'

  return 'partial'
}

/**
 * Build B1-shaped parse fields for insert (parsed_items immutable after write).
 *
 * @param {{
 *   body?: string | null,
 *   media_type: string,
 *   week_id?: string | null
 * }} inboundDraft
 * @returns {{ parsed_items: object[], parse_status: string }}
 */
function buildInboundParseFields (inboundDraft) {
  if (inboundDraft.media_type !== 'text' || !inboundDraft.week_id) {
    return { parsed_items: [], parse_status: inboundDraft.parse_status ?? 'manual_required' }
  }

  const parsed_items = parseInboundMessage(inboundDraft)
  const parse_status = deriveParseStatus(parsed_items)
  return { parsed_items, parse_status }
}

module.exports = {
  deriveParseStatus,
  buildInboundParseFields
}
