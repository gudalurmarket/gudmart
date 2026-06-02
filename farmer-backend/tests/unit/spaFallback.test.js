'use strict'

const path = require('path')
const fastify = require('fastify')
const fastifyStatic = require('@fastify/static')

const PWA_ROOT = path.join(__dirname, '../../../farmer-frontend/dist')

function registerSpaFallback (app) {
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0]
    if (pathname.startsWith('/api/') || pathname.startsWith('/webhook/')) {
      return reply.status(404).send({
        code: 'NOT_FOUND',
        httpStatus: 404,
        message: 'Not found',
        details: {}
      })
    }
    return reply.sendFile('index.html')
  })
}

describe('SPA fallback (production PWA shell)', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app

  beforeAll(async () => {
    app = fastify({ logger: false })
    await app.register(fastifyStatic, {
      root: PWA_ROOT,
      prefix: '/'
    })
    registerSpaFallback(app)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('serves index.html for client-side routes such as /operator/dashboard', async () => {
    const res = await app.inject({ method: 'GET', url: '/operator/dashboard' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.body).toContain('<div id="root">')
  })

  it('returns JSON 404 for unknown API paths', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/no-such-route' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND')
  })

  it('does not treat /operator/* as API routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/operator/intake' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<div id="root">')
  })
})
