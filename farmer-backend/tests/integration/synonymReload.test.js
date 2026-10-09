'use strict'

require('./helpers/setup')

const mongoose = require('mongoose')
const { getSynonymCache } = require('../../server/modules/parser')
const { http, authHeaders } = require('./helpers/setup')

const TABLE = [
  { canonical: 'Tomato', aliases: ['thakkali'], language: 'mixed' },
  { canonical: 'Potato', aliases: ['urulai'], language: 'mixed' }
]

describe('POST /api/v1/admin/synonyms/reload', () => {
  it('re-reads config/synonyms into the parser cache', async () => {
    await mongoose.connection.db.collection('config').updateOne(
      { _id: 'synonyms' },
      { $set: { table: TABLE, updated_at: new Date(), updated_by: 'test' } },
      { upsert: true }
    )

    const res = await http().post('/api/v1/admin/synonyms/reload').set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ entries: 2 })
    expect(getSynonymCache()).toHaveLength(2)
  })

  it('yields an empty cache when the config document is missing', async () => {
    await mongoose.connection.db.collection('config').deleteMany({})

    const res = await http().post('/api/v1/admin/synonyms/reload').set(authHeaders())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ entries: 0 })
  })

  it('rejects a volunteer', async () => {
    const res = await http()
      .post('/api/v1/admin/synonyms/reload')
      .set({ Authorization: 'Bearer test-token-volunteer' })

    expect(res.status).toBe(403)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await http().post('/api/v1/admin/synonyms/reload')
    expect(res.status).toBe(401)
  })
})
