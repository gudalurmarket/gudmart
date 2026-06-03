import { WEEK_STATES } from './constants.js'

/**
 * @param {string | Date | undefined} value
 * @returns {Date | null}
 */
function toLocalCalendarDate (value) {
  if (value == null || value === '') return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

/**
 * Among non-closed weeks, pick the one whose market date is closest to today.
 * Avoids selecting far-future test weeks when the API list is sorted by market_date desc.
 *
 * @param {Array<{ state?: string, marketDate?: string, market_date?: string }>} weeks
 * @returns {object | null}
 */
export function pickActiveWeek (weeks) {
  const candidates = (weeks ?? []).filter((w) => w.state !== WEEK_STATES.CLOSED)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const today = toLocalCalendarDate(new Date())
  if (!today) return candidates[0]

  let best = candidates[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const week of candidates) {
    const marketDay = toLocalCalendarDate(week.marketDate ?? week.market_date)
    if (!marketDay) continue
    const distance = Math.abs(marketDay.getTime() - today.getTime())
    if (distance < bestDistance) {
      bestDistance = distance
      best = week
    }
  }

  return best
}

/**
 * Pick the non-closed week in the given state closest to today's market date.
 *
 * @param {Array<{ state?: string, marketDate?: string, market_date?: string }>} weeks
 * @param {string} state
 * @returns {object | null}
 */
export function pickWeekByState (weeks, state) {
  const matches = (weeks ?? []).filter((w) => w.state === state)
  if (matches.length === 0) return null
  return pickActiveWeek(matches)
}

/**
 * @param {string | Date | undefined} isoOrDate
 * @param {'en' | 'ta'} lang
 * @returns {string}
 */
export function formatMarketDate (isoOrDate, lang) {
  const date = toLocalCalendarDate(isoOrDate)
  if (!date) return ''
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
