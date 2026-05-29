export function assertPaise (value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`assertPaise: expected non-negative integer paise, got: ${value}`)
  }
}

export function formatINR (paise) {
  assertPaise(paise)
  const rupees = (paise / 100).toFixed(2)
  return `₹${rupees}`
}

/** Display helper — never throws; use when API data may be incomplete. */
export function formatINROptional (paise) {
  if (!Number.isInteger(paise) || paise < 0) return '—'
  return formatINR(paise)
}

export function paiseToRupees (paise) {
  assertPaise(paise)
  return paise / 100
}

export function rupeesToPaise (rupees) {
  return Math.floor(rupees * 100)
}

/**
 * Parses a rupee string entered by the operator and returns
 * integer paise, or null if the input is invalid.
 * Accepts: "500", "1,200", "49.50", " 100 "
 * Rejects: empty string, NaN, negative values
 *
 * @param {string} value
 * @returns {number|null} integer paise, or null if invalid
 */
export function parseINR (value) {
  if (value == null) return null
  const cleaned = String(value).trim().replace(/,/g, '')
  if (cleaned === '') return null
  const rupees = Number(cleaned)
  if (!Number.isFinite(rupees) || rupees < 0) return null
  return rupeesToPaise(rupees)
}
