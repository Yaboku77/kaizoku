import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  TMDB_API_KEY: string
  TMDB_API_BASE_URL: string
  PROXY_SECRET: string
}

const CACHE_TTL = 60 * 60 // 1 hour
const cache = caches.default

function buildCacheKey(requestUrl: URL): Request {
  const url = new URL(requestUrl)
  url.searchParams.delete('api_key')
  // Use a synthetic origin so keys don't collide with real TMDB URLs
  url.protocol = 'https'
  url.hostname = 'tmdb-proxy-cache'
  return new Request(url.toString())
}

function isCacheable(method: string, status: number): boolean {
  return method === 'GET' && status >= 200 && status < 300
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

app.use('/3/*', async (c, next) => {
  const secret = c.req.header('X-Proxy-Secret')
  if (!secret || secret !== c.env.PROXY_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

app.get('/', (c) => c.json({ message: 'TMDB Proxy is running! Use /3/... endpoints.' }))
app.get('/health', (c) => c.json({ status: 'ok' }))

app.all('/t/p/*', async (c) => {
  const url = new URL(c.req.url)
  url.protocol = 'https'
  url.hostname = 'image.tmdb.org'
  url.port = ''

  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  headers.delete('authorization')
  headers.delete('cf-connecting-ip')
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')

  // Cache check for images
  const cacheKey = buildCacheKey(url)
  let response = await cache.match(cacheKey)
  if (response) {
    return new Response(response.body, { ...response })
  }

  response = await fetch(url.toString(), {
    method: c.req.method,
    headers,
  })

  const responseHeaders = new Headers(response.headers)
  responseHeaders.set('cache-control', `public, max-age=${CACHE_TTL * 24 * 7}, s-maxage=${CACHE_TTL * 24 * 7}`) // Cache images longer (1 week)
  
  const body = await response.bytes()
  const cached = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })

  if (isCacheable(c.req.method, response.status)) {
    c.executionCtx.waitUntil(cache.put(cacheKey, cached.clone()))
  }

  return cached
})

app.all('/3/*', async (c) => {
  const path = c.req.path.replace('/3/', '')
  const url = new URL(c.req.url)
  url.protocol = 'https'
  url.hostname = new URL(c.env.TMDB_API_BASE_URL).hostname
  url.pathname = `/3/${path}`
  url.port = ''
  url.searchParams.set('api_key', c.env.TMDB_API_KEY)

  const headers = new Headers(c.req.raw.headers)
  headers.set('Accept', 'application/json')
  headers.delete('host')
  headers.delete('authorization')
  headers.delete('cf-connecting-ip')
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')

  // ── Cache check ──────────────────────────────────────────
  const cacheKey = buildCacheKey(url)
  let response = await cache.match(cacheKey)
  if (response) {
    return new Response(response.body, { ...response })
  }

  // ── Upstream fetch ───────────────────────────────────────
  response = await fetch(url.toString(), {
    method: c.req.method,
    headers,
    body: ['GET', 'HEAD'].includes(c.req.method) ? null : c.req.raw.body,
  })

  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('set-cookie')
  responseHeaders.delete('x-powered-by')
  responseHeaders.delete('server')
  responseHeaders.set('cache-control', `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`)

  const body = await response.bytes()
  const cached = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })

  // ── Store in cache if eligible ───────────────────────────
  if (isCacheable(c.req.method, response.status)) {
    c.executionCtx.waitUntil(cache.put(cacheKey, cached.clone()))
  }

  return cached
})

export default app
