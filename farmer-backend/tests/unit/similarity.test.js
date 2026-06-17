'use strict'

const { similarityScore, bestMatch, MIN_SCORE } = require('../../server/lib/similarity')

describe('similarity', () => {
  describe('similarityScore', () => {
    it('returns 1 for identical strings', () => {
      expect(similarityScore('Tomato', 'tomato')).toBe(1)
    })

    it('returns 0 for empty input', () => {
      expect(similarityScore('', 'Tomato')).toBe(0)
    })

    it('scores typos above threshold', () => {
      expect(similarityScore('Tomatoe', 'Tomato')).toBeGreaterThanOrEqual(MIN_SCORE)
    })
  })

  describe('bestMatch', () => {
    const candidates = [
      { id: 'prod-1', nameEn: 'Tomato', nameTa: 'தக்காளி' },
      { id: 'prod-2', nameEn: 'Beans', nameTa: null },
    ]

    it('returns best match at or above MIN_SCORE', () => {
      const match = bestMatch('Tomatoe', candidates)
      expect(match).not.toBeNull()
      expect(match.id).toBe('prod-1')
      expect(match.score).toBeGreaterThanOrEqual(MIN_SCORE)
    })

    it('matches Tamil names', () => {
      const match = bestMatch('தக்காளி', candidates)
      expect(match).not.toBeNull()
      expect(match.id).toBe('prod-1')
    })

    it('returns null when no candidate meets threshold', () => {
      expect(bestMatch('Carrot', candidates)).toBeNull()
    })
  })
})
