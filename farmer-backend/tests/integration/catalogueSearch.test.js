'use strict'

require('./helpers/setup')

const ProductCatalogue = require('../../server/models/ProductCatalogue')
const { http, authHeaders } = require('./helpers/setup')

const PRODUCT_ID = 'prod-search-test'

beforeEach(async () => {
  await ProductCatalogue.create({
    product_id: PRODUCT_ID,
    name_en: 'Tomato',
    name_ta: 'தக்காளி',
    default_unit: 'kg',
    active: true,
    created_by: 'test-operator-uid',
  })
})

afterEach(async () => {
  await ProductCatalogue.deleteMany({ product_id: PRODUCT_ID })
})

describe('GET /api/v1/catalogue/search', () => {
  it('returns similar active products for a typo query', async () => {
    const res = await http()
      .get('/api/v1/catalogue/search?q=Tomatoe')
      .set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body.results).toHaveLength(1)
    expect(res.body.results[0].productId).toBe(PRODUCT_ID)
    expect(res.body.results[0].nameEn).toBe('Tomato')
    expect(res.body.results[0].score).toBeGreaterThanOrEqual(0.6)
  })

  it('returns empty results when no similar product exists', async () => {
    const res = await http()
      .get('/api/v1/catalogue/search?q=Carrot')
      .set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body.results).toEqual([])
  })
})
