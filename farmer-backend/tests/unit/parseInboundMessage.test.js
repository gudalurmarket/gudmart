'use strict'

const {
  parseInboundMessage,
  extractQuantityAndUnit,
  matchProductId,
  assignConfidence
} = require('../../server/modules/parseInboundMessage')

const mockCatalogue = [
  { product_id: 'tomato', name_en: 'Tomato', name_ta: 'தக்காளி' },
  { product_id: 'beans', name_en: 'Beans', name_ta: null }
]

describe('parseInboundMessage', () => {
  it('empty body returns empty array', () => {
    expect(parseInboundMessage({ body: null })).toEqual([])
    expect(parseInboundMessage({ body: '   ' })).toEqual([])
  })

  it('extractQuantityAndUnit patterns', () => {
    expect(extractQuantityAndUnit('tomato 2kg')).toEqual({
      quantity: 2,
      unit: 'kg',
      raw_product_text: 'tomato'
    })

    expect(extractQuantityAndUnit('1 kg spinach')).toEqual({
      quantity: 1,
      unit: 'kg',
      raw_product_text: 'spinach'
    })

    expect(extractQuantityAndUnit('500g rice')).toEqual({
      quantity: 5,
      unit: '100g',
      raw_product_text: 'rice'
    })

    expect(extractQuantityAndUnit('carrot 2 bunch')).toEqual({
      quantity: 2,
      unit: 'bunch',
      raw_product_text: 'carrot'
    })

    expect(extractQuantityAndUnit('onion 3')).toEqual({
      quantity: 3,
      unit: 'piece',
      raw_product_text: 'onion'
    })
  })

  it('matchProductId lowercase exact match', () => {
    expect(matchProductId('tomato', mockCatalogue)).toBe('tomato')
    expect(matchProductId('தக்காளி', mockCatalogue)).toBe('tomato')
    expect(matchProductId('unknown', mockCatalogue)).toBeNull()
  })

  it('assignConfidence', () => {
    expect(assignConfidence({ raw_product_text: 'tomato', quantity: 2 })).toBe('clean')
    expect(assignConfidence({ raw_product_text: 'tomato', quantity: null })).toBe('partial')
    expect(assignConfidence({ raw_product_text: '', quantity: 2 })).toBe('partial')
    expect(assignConfidence({ raw_product_text: '', quantity: null })).toBe('manual_required')
  })

  it('raw_product_text extracted after quantity and unit removed', () => {
    const items = parseInboundMessage({ body: '2kg tomatoes, 1 cabbage' })

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      raw_text: '2kg tomatoes',
      raw_product_text: 'tomatoes',
      quantity: 2,
      unit: 'kg',
      confidence: 'clean',
      product_id: null
    })

    expect(items[1]).toMatchObject({
      raw_text: '1 cabbage',
      raw_product_text: 'cabbage',
      quantity: 1,
      unit: 'piece',
      confidence: 'clean'
    })
  })

  it('comma-separated multi-line order', () => {
    const items = parseInboundMessage({
      body: 'tomato 2kg, beans 1 piece'
    })

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      raw_text: 'tomato 2kg',
      raw_product_text: 'tomato',
      quantity: 2,
      unit: 'kg',
      confidence: 'clean'
    })

    expect(items[1]).toMatchObject({
      raw_product_text: 'beans',
      unit: 'piece',
      confidence: 'clean'
    })
  })

  it('text-only segment without quantity is partial', () => {
    const items = parseInboundMessage({ body: 'hello' })
    expect(items[0]).toMatchObject({
      raw_product_text: 'hello',
      quantity: null,
      confidence: 'partial'
    })
  })
})
