'use strict'

const { parseMessage } = require('../../server/modules/parser')

const PRODUCE_LIST = [
  { product_id: 'prod-tomato', name_en: 'Tomato', name_ta: 'thakkali', unit: 'kg' },
  { product_id: 'prod-beans', name_en: 'Beans', name_ta: 'payir', unit: 'kg' },
  { product_id: 'prod-onion', name_en: 'Onion', name_ta: 'vengayam', unit: 'kg' },
  { product_id: 'prod-cauli', name_en: 'Cauliflower', name_ta: null, unit: 'piece' },
  { product_id: 'prod-carrot', name_en: 'Carrot', name_ta: 'gajar', unit: 'kg' }
]

const SYNONYM_TABLE = [
  { canonical: 'tomato', aliases: ['tom', 'tomato', 'thakkali'], language: 'mixed' },
  { canonical: 'beans', aliases: ['beans', 'bean', 'payir'], language: 'mixed' },
  { canonical: 'onion', aliases: ['onion', 'vengayam'], language: 'mixed' },
  { canonical: 'cauliflower', aliases: ['cauli', 'gobi', 'cauliflower'], language: 'mixed' },
  { canonical: 'carrot', aliases: ['carrot', 'gajar'], language: 'mixed' }
]

function parse (rawMessage, produceList = PRODUCE_LIST, synonymTable = SYNONYM_TABLE) {
  return parseMessage(rawMessage, produceList, synonymTable)
}

describe('parseMessage — clean parse', () => {
  it('English product name + quantity + unit → confidence clean', () => {
    const results = parse('tomato 2 kg')
    expect(results).toHaveLength(1)
    expect(results[0].productId).toBe('prod-tomato')
    expect(results[0].quantity).toBe(2)
    expect(results[0].unit).toBe('kg')
    expect(results[0].confidence).toBe('clean')
  })

  it('English abbreviation in synonym table → matched', () => {
    const results = parse('cauli 3 piece')
    expect(results[0].productId).toBe('prod-cauli')
    expect(results[0].confidence).toBe('clean')
  })

  it('unit abbreviation normalised — gm → 100g', () => {
    const results = parse('carrot 500 gm')
    expect(results[0].unit).toBe('100g')
    expect(results[0].confidence).toBe('clean')
  })

  it('unit abbreviation normalised — kgs → kg', () => {
    const results = parse('beans 1 kgs')
    expect(results[0].unit).toBe('kg')
    expect(results[0].confidence).toBe('clean')
  })

  it('unit abbreviation normalised — pcs → piece', () => {
    const results = parse('cauli 2 pcs')
    expect(results[0].unit).toBe('piece')
    expect(results[0].confidence).toBe('clean')
  })

  it('unit abbreviation normalised — bund → bunch', () => {
    const results = parse('spinach 1 bund')
    expect(results[0].productId).toBeNull()
    expect(results[0].unit).toBe('bunch')
  })
})

describe('parseMessage — multi-segment', () => {
  it('newline-separated message → one result per line', () => {
    const results = parse('tomato 1 kg\nbeans 2 kg')
    expect(results).toHaveLength(2)
    expect(results[0].productId).toBe('prod-tomato')
    expect(results[1].productId).toBe('prod-beans')
  })

  it('comma-separated segments → split correctly', () => {
    const results = parse('onion 1 kg, carrot 500 gm')
    expect(results).toHaveLength(2)
    expect(results[0].productId).toBe('prod-onion')
    expect(results[1].productId).toBe('prod-carrot')
  })

  it('semicolon-separated segments → split correctly', () => {
    const results = parse('tomato 2 kg; beans 1 kg')
    expect(results).toHaveLength(2)
  })

  it('blank lines between segments are discarded', () => {
    const results = parse('tomato 1 kg\n\nbeans 2 kg')
    expect(results).toHaveLength(2)
  })
})

describe('parseMessage — partial parse', () => {
  it('product matched but no quantity → confidence partial', () => {
    const results = parse('tomato kg')
    expect(results[0].productId).toBe('prod-tomato')
    expect(results[0].quantity).toBeNull()
    expect(results[0].confidence).toBe('partial')
  })

  it('product matched but no unit → confidence partial', () => {
    const results = parse('tomato 2')
    expect(results[0].productId).toBe('prod-tomato')
    expect(results[0].unit).toBeNull()
    expect(results[0].confidence).toBe('partial')
  })

  it('product matched, no quantity, no unit → confidence partial', () => {
    const results = parse('tomato')
    expect(results[0].productId).toBe('prod-tomato')
    expect(results[0].quantity).toBeNull()
    expect(results[0].unit).toBeNull()
    expect(results[0].confidence).toBe('partial')
  })
})

describe('parseMessage — unknown tokens / manual required', () => {
  it('product not in produce list → confidence manual_required, productId null', () => {
    const results = parse('spinach 2 kg')
    expect(results[0].productId).toBeNull()
    expect(typeof results[0].rawProductText).toBe('string')
    expect(results[0].rawProductText.length).toBeGreaterThan(0)
    expect(results[0].confidence).toBe('manual_required')
  })

  it('completely unrecognisable segment → manual_required', () => {
    const results = parse('xyzabc123')
    expect(results[0].confidence).toBe('manual_required')
  })

  it('abbreviation not in synonym table → unmatched product, manual_required', () => {
    const results = parse('beet 1 kg')
    expect(results[0].productId).toBeNull()
    expect(results[0].confidence).toBe('manual_required')
  })
})

describe('parseMessage — Tamil / mixed language tokens', () => {
  it('Tamil token via synonym table → matches correct product', () => {
    const results = parse('thakkali 1 kg')
    expect(results[0].productId).toBe('prod-tomato')
    expect(results[0].confidence).toBe('clean')
  })

  it('Tamil token for onion → matched', () => {
    const results = parse('vengayam 2 kg')
    expect(results[0].productId).toBe('prod-onion')
    expect(results[0].confidence).toBe('clean')
  })

  it('Tamil token for beans → matched', () => {
    const results = parse('payir 500 gm')
    expect(results[0].productId).toBe('prod-beans')
    expect(results[0].unit).toBe('100g')
    expect(results[0].confidence).toBe('clean')
  })

  it('mixed Tamil-English in same segment → product matched via Tamil token', () => {
    const results = parse('thakkali 2kg')
    expect(results[0].productId).toBe('prod-tomato')
  })

  it('Tamil token not in synonym table → manual_required', () => {
    const results = parse('முருங்கக்காய் 1 kg')
    expect(results[0].productId).toBeNull()
    expect(results[0].confidence).toBe('manual_required')
  })
})

describe('parseMessage — "same as last week" pre-parse check', () => {
  it('"same as last week" → early return, single manual_required result with reason', () => {
    const results = parse('same as last week')
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('manual_required')
    expect(results[0].reason).toBe('repeat_order')
  })

  it('"same" alone → repeat_order flag', () => {
    const results = parse('same')
    expect(results[0].confidence).toBe('manual_required')
    expect(results[0].reason).toBe('repeat_order')
  })

  it('"usual" → repeat_order flag', () => {
    const results = parse('usual order please')
    expect(results[0].confidence).toBe('manual_required')
    expect(results[0].reason).toBe('repeat_order')
  })

  it('repeat order phrase with other content → whole message flagged, not partially parsed', () => {
    const results = parse('same as last week\ntomato 2 kg')
    expect(results).toHaveLength(1)
    expect(results[0].reason).toBe('repeat_order')
  })
})

describe('parseMessage — empty and edge cases', () => {
  it('empty string → returns empty array', () => {
    expect(parse('')).toEqual([])
  })

  it('whitespace only → returns empty array', () => {
    expect(parse('   \n  \t  ')).toEqual([])
  })

  it('fraction quantity — "half kg" → quantity 0.5', () => {
    const results = parse('tomato half kg')
    expect(results[0].quantity).toBe(0.5)
    expect(results[0].confidence).toBe('clean')
  })

  it('decimal quantity → parsed correctly', () => {
    const results = parse('tomato 1.5 kg')
    expect(results[0].quantity).toBe(1.5)
    expect(results[0].confidence).toBe('clean')
  })

  it('empty produceList → all segments manual_required', () => {
    const results = parse('tomato 2 kg', [])
    expect(results[0].productId).toBeNull()
    expect(results[0].confidence).toBe('manual_required')
  })

  it('empty synonymTable → English product name still matched via name_en direct match', () => {
    const results = parse('tomato 2 kg', PRODUCE_LIST, [])
    expect(results[0].productId).toBe('prod-tomato')
  })
})
