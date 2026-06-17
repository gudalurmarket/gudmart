'use strict'

const MIN_SCORE = 0.6

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance (a, b) {
  const rows = a.length + 1
  const cols = b.length + 1
  /** @type {number[][]} */
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0))

  for (let i = 0; i < rows; i++) matrix[i][0] = i
  for (let j = 0; j < cols; j++) matrix[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[a.length][b.length]
}

/**
 * Normalised similarity in [0, 1] from Levenshtein edit distance.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function similarityScore (a, b) {
  const left = String(a || '').trim().toLowerCase()
  const right = String(b || '').trim().toLowerCase()
  if (!left || !right) return 0
  if (left === right) return 1

  const distance = levenshteinDistance(left, right)
  const maxLen = Math.max(left.length, right.length)
  return maxLen === 0 ? 1 : 1 - distance / maxLen
}

/**
 * @param {string} query
 * @param {{ id: string, nameEn: string, nameTa?: string | null }} candidate
 * @returns {number}
 */
function scoreCandidate (query, candidate) {
  const scores = [similarityScore(query, candidate.nameEn)]
  if (candidate.nameTa) {
    scores.push(similarityScore(query, candidate.nameTa))
  }
  return Math.max(...scores)
}

/**
 * @param {string} query
 * @param {Array<{ id: string, nameEn: string, nameTa?: string | null }>} candidates
 * @returns {{ id: string, nameEn: string, nameTa: string | null, score: number } | null}
 */
function bestMatch (query, candidates) {
  const normalizedQuery = query?.trim()
  if (!normalizedQuery || !Array.isArray(candidates) || candidates.length === 0) {
    return null
  }

  /** @type {{ id: string, nameEn: string, nameTa: string | null, score: number } | null} */
  let best = null

  for (const candidate of candidates) {
    const score = scoreCandidate(normalizedQuery, candidate)
    if (!best || score > best.score) {
      best = {
        id: candidate.id,
        nameEn: candidate.nameEn,
        nameTa: candidate.nameTa || null,
        score
      }
    }
  }

  if (!best || best.score < MIN_SCORE) return null
  return best
}

module.exports = {
  levenshteinDistance,
  similarityScore,
  bestMatch,
  MIN_SCORE
}
