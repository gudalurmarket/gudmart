'use strict'

const doc = require('../../scripts/seed-data/synonyms.json')

const UNITS = ['kg', '100g', 'piece', 'bunch']

describe('seed-data/synonyms.json', () => {
  it('is the config/synonyms document', () => {
    expect(doc._id).toBe('synonyms')
    expect(Array.isArray(doc.table)).toBe(true)
    expect(doc.table.length).toBeGreaterThan(0)
  })

  it('has well-formed entries', () => {
    for (const entry of doc.table) {
      expect(typeof entry.canonical).toBe('string')
      expect(entry.canonical.length).toBeGreaterThan(0)
      expect(['en', 'ta', 'mixed']).toContain(entry.language)
      expect(entry.aliases.length).toBeGreaterThan(0)
    }
  })

  it('has no alias claimed by two different entries, and no alias containing separators', () => {
    const seen = new Map()
    for (const entry of doc.table) {
      for (const alias of entry.aliases) {
        const key = alias.toLowerCase()
        expect(key).not.toMatch(/[,.;!?\n]/)
        if (seen.has(key)) expect(seen.get(key)).toBe(entry.canonical)
        seen.set(key, entry.canonical)
      }
    }
  })

  it('only uses built-in unit names as unit entries', () => {
    const unitEntries = doc.table.filter(e => UNITS.includes(e.canonical))
    expect(unitEntries.map(e => e.canonical).sort()).toEqual([...UNITS].sort())
  })
})
