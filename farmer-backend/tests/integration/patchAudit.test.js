'use strict'

require('./helpers/setup')

const Customer = require('../../server/models/Customer')
const ProductCatalogue = require('../../server/models/ProductCatalogue')
const { http, authHeaders } = require('./helpers/setup')

const OPERATOR_UID = 'test-operator-uid'

describe('PATCH audit fields (updated_at / updated_by)', () => {
  it('customer PATCH stamps updated_by and updated_at', async () => {
    await Customer.create({
      customer_id: 'cust-audit-1',
      name: 'Before',
      phone: '+919000000001',
      wallet_balance: 0,
      created_by: 'creator-uid'
    })

    const res = await http()
      .patch('/api/v1/customers/cust-audit-1')
      .set(authHeaders())
      .send({ name: 'After' })

    expect(res.status).toBe(200)
    const doc = await Customer.findOne({ customer_id: 'cust-audit-1' }).lean()
    expect(doc.name).toBe('After')
    expect(doc.active).toBe(true)
    expect(doc.updated_by).toBe(OPERATOR_UID)
    expect(doc.updated_at).toBeInstanceOf(Date)
  })

  it('catalogue PATCH stamps updated_by and updated_at', async () => {
    await ProductCatalogue.create({
      product_id: 'prod-audit-1',
      name_en: 'Tomato',
      default_unit: 'kg',
      created_by: 'creator-uid'
    })

    const res = await http()
      .patch('/api/v1/catalogue/prod-audit-1')
      .set(authHeaders())
      .send({ active: false })

    expect(res.status).toBe(200)
    const doc = await ProductCatalogue.findOne({ product_id: 'prod-audit-1' }).lean()
    expect(doc.active).toBe(false)
    expect(doc.updated_by).toBe(OPERATOR_UID)
    expect(doc.updated_at).toBeInstanceOf(Date)
  })

  it('farmer PATCH stamps updated_by and updated_at', async () => {
    const created = await http()
      .post('/api/v1/farmers')
      .set(authHeaders())
      .send({ name: 'Farmer', phone: '+919000000002', location: 'Gudalur', farmerType: 'outstation' })
    expect(created.status).toBe(201)

    const res = await http()
      .patch(`/api/v1/farmers/${created.body.farmerId}`)
      .set(authHeaders())
      .send({ location: 'Ooty' })

    expect(res.status).toBe(200)
    const Farmer = require('../../server/models/Farmer')
    const doc = await Farmer.findOne({ farmer_id: created.body.farmerId }).lean()
    expect(doc.location).toBe('Ooty')
    expect(doc.updated_by).toBe(OPERATOR_UID)
    expect(doc.updated_at).toBeInstanceOf(Date)
  })
})
