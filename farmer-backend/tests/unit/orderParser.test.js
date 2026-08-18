'use strict'

const { parseMessage } = require('../../server/modules/parser')

const PRODUCE_LIST = [
  { product_id: 'prod-tomato', name_en: 'Tomato', name_ta: 'தக்காளி', unit: 'kg' },
  { product_id: 'prod-onion', name_en: 'Onion', name_ta: null, unit: 'kg' },
  { product_id: 'prod-banana', name_en: 'Banana', name_ta: null, unit: 'piece' }
]

const SYNONYM_TABLE = [
  { canonical: 'onion', aliases: ['onions', 'vengayam'], language: 'en' },
  { canonical: 'tomato', aliases: ['tom', 'thakkali'], language: 'mixed' },
  { canonical: 'kg', aliases: ['kilo', 'kilos', 'kilogram'], language: 'en' },
  { canonical: 'piece', aliases: ['pcs', 'pieces', 'nos'], language: 'en' },
  { canonical: '100g', aliases: ['gm', 'gms', 'gram', 'grams', 'g'], language: 'en' },
  { canonical: 'bunch', aliases: ['bun', 'bund', 'bunches'], language: 'en' }
]

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

describe('parseMessage', () => {
  test('1. basic parse — tomato 2kg', () => {
    const result = parseMessage('tomato 2kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      productId: 'prod-tomato',
      quantity: 2,
      unit: 'kg',
      confidence: 'clean',
      rawProductText: 'tomato'
    })
    expect(result[0].rawText).toBe('tomato 2kg')
  })

  test('2. multiple segments via newline', () => {
    const result = parseMessage('tomato 2kg\nonion 1kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(2)
    expect(result[0].productId).toBe('prod-tomato')
    expect(result[1].productId).toBe('prod-onion')
  })

  test('3. multiple segments via comma', () => {
    const result = parseMessage('tomato 2kg, onion 1kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(2)
    expect(result.map((item) => item.productId)).toEqual(['prod-tomato', 'prod-onion'])
  })

  test('4. multiple segments via semicolon', () => {
    const result = parseMessage('tomato 2kg; onion 1kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(2)
    expect(result.map((item) => item.productId)).toEqual(['prod-tomato', 'prod-onion'])
  })

  test('5. messy spacing', () => {
    const result = parseMessage('  tomato   2 kg  ', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      quantity: 2,
      unit: 'kg',
      confidence: 'clean'
    })
  })

  test('6. fraction — numeric 1/2', () => {
    const result = parseMessage('tomato 1/2 kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result[0]).toMatchObject({
      productId: 'prod-tomato',
      quantity: 0.5,
      unit: 'kg',
      confidence: 'clean'
    })
  })

  test('7. fraction — word half', () => {
    const result = parseMessage('tomato half kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result[0]).toMatchObject({
      productId: 'prod-tomato',
      quantity: 0.5,
      unit: 'kg',
      confidence: 'clean'
    })
  })

  test('8. fraction — word quarter', () => {
    const result = parseMessage('tomato quarter kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result[0]).toMatchObject({
      productId: 'prod-tomato',
      quantity: 0.25,
      unit: 'kg',
      confidence: 'clean'
    })
  })

  test('9. unknown product', () => {
    const result = parseMessage('dragonfruit 2kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      productId: null,
      quantity: 2,
      confidence: 'manual_required',
      rawProductText: 'dragonfruit'
    })
  })

  test('10. invalid quantity', () => {
    const result = parseMessage('tomato abc', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      productId: 'prod-tomato',
      quantity: null,
      unit: null,
      confidence: 'partial'
    })
  })

  test('11. case insensitivity', () => {
    const lower = parseMessage('tomato 2kg', PRODUCE_LIST, SYNONYM_TABLE)
    const upper = parseMessage('TOMATO 2KG', PRODUCE_LIST, SYNONYM_TABLE)
    expect(upper[0].productId).toBe(lower[0].productId)
    expect(upper[0].quantity).toBe(lower[0].quantity)
    expect(upper[0].unit).toBe(lower[0].unit)
    expect(upper[0].confidence).toBe(lower[0].confidence)
  })

  test('12. synonym match — onions → onion', () => {
    const result = parseMessage('onions 1kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result[0]).toMatchObject({
      productId: 'prod-onion',
      quantity: 1,
      unit: 'kg',
      confidence: 'clean'
    })
  })

  test('13. repeat order — English', () => {
    const result = parseMessage('same as last week', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      rawText: 'same as last week',
      productId: null,
      rawProductText: null,
      quantity: null,
      unit: null,
      confidence: 'manual_required',
      reason: 'repeat_order'
    })
  })

  test('14. repeat order — Tamil', () => {
    const result = parseMessage('வழக்கம் போல', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      confidence: 'manual_required',
      reason: 'repeat_order'
    })
  })

  test('15. no mutation of input arrays', () => {
    const produceBefore = clone(PRODUCE_LIST)
    const synonymBefore = clone(SYNONYM_TABLE)
    parseMessage('tomato 2kg\nonion 1kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(PRODUCE_LIST).toEqual(produceBefore)
    expect(SYNONYM_TABLE).toEqual(synonymBefore)
  })

  test('16. duplicate segments are not merged', () => {
    const result = parseMessage('tomato 1kg\ntomato 2kg', PRODUCE_LIST, SYNONYM_TABLE)
    expect(result).toHaveLength(2)
    expect(result[0].quantity).toBe(1)
    expect(result[1].quantity).toBe(2)
    expect(result[0].productId).toBe('prod-tomato')
    expect(result[1].productId).toBe('prod-tomato')
  })

  test('empty message returns empty array', () => {
    expect(parseMessage('', PRODUCE_LIST, SYNONYM_TABLE)).toEqual([])
    expect(parseMessage('   ', PRODUCE_LIST, SYNONYM_TABLE)).toEqual([])
  })
})
