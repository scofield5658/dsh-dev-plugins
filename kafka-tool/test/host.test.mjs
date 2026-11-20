import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  HttpError, asBrokers, asSasl, clampOffset, encodeHeaders, encodeMessage, mapPool, readBody, sendJson, apply,
} from '../index.js'

const mountedCleanups = []
after(() => { for (const cleanup of mountedCleanups) cleanup?.() })

test('asBrokers: trims and validates', () => {
  assert.deepEqual(asBrokers([' a:9092 ', 'b:9092']), ['a:9092', 'b:9092'])
  assert.throws(() => asBrokers([]), HttpError)
  assert.throws(() => asBrokers('a:9092'), HttpError)
  assert.throws(() => asBrokers(['  ']), HttpError)
  try {
    asBrokers('nope')
    assert.unreachable('must throw')
  } catch (err) {
    assert.equal(err.status, 400)
  }
})

test('asSasl: supported mechanisms and rejection', () => {
  assert.equal(asSasl(undefined), undefined)
  assert.equal(asSasl(null), undefined)
  assert.deepEqual(asSasl({ mechanism: 'plain', username: 'u', password: 'p' }), { mechanism: 'plain', username: 'u', password: 'p' })
  assert.deepEqual(asSasl({ mechanism: 'scram-sha-256' }), { mechanism: 'scram-sha-256', username: '', password: '' })
  assert.throws(() => asSasl({ mechanism: 'oauthbearer' }), /unsupported sasl mechanism/)
  assert.throws(() => asSasl('plain'), HttpError)
})

test('clampOffset: stays within [low, high]', () => {
  assert.equal(clampOffset('5', 0n, 10n), 5n)
  assert.equal(clampOffset('0', 3n, 10n), 3n)
  assert.equal(clampOffset('99', 3n, 10n), 10n)
  assert.equal(clampOffset(7n, 0n, 10n), 7n)
})

test('encodeHeaders: buffer, string, and array values', () => {
  const headers = encodeHeaders({
    headers: {
      buf: Buffer.from('abc'),
      str: 'trace-1',
      arr: [Buffer.from('x'), Buffer.from('y')],
      strArr: ['s1'],
      bad: undefined,
    },
  })
  assert.equal(Buffer.from(headers.buf, 'base64').toString(), 'abc')
  assert.equal(Buffer.from(headers.str, 'base64').toString(), 'trace-1')
  assert.equal(Buffer.from(headers.arr, 'base64').toString(), 'x')
  assert.equal(Buffer.from(headers.strArr, 'base64').toString(), 's1')
  assert.equal('bad' in headers, false)
})

test('encodeMessage: list rows carry no value; detail rows do', () => {
  const message = {
    key: Buffer.from('k'),
    value: Buffer.from('{"a":1}'),
    offset: '42',
    timestamp: '1700000000000',
    headers: { h: 'v' },
  }
  const list = encodeMessage(7, 't', 2, message)
  assert.equal(list.seq, 7)
  assert.equal(list.topic, 't')
  assert.equal(list.partition, 2)
  assert.equal(list.offset, '42')
  assert.equal('value' in list, false)
  assert.equal('truncated' in list, false)
  assert.equal(list.valueSize, 7)
  assert.equal(Buffer.from(list.key, 'base64').toString(), 'k')
  assert.equal(list.keyTruncated, false)

  const full = encodeMessage(7, 't', 2, message, { withValue: true })
  assert.equal(Buffer.from(full.value, 'base64').toString(), '{"a":1}')
  assert.equal(full.truncated, false)

  const nullish = encodeMessage(1, 't', 0, { key: null, value: null, offset: '0', timestamp: '0' })
  assert.equal(nullish.key, null)
  assert.equal(nullish.keySize, 0)
  assert.equal(nullish.valueSize, 0)
})

test('mapPool: bounded concurrency, order preserved', async () => {
  let active = 0
  let peak = 0
  const items = Array.from({ length: 50 }, (_, i) => i)
  const results = await mapPool(items, 4, async n => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active -= 1
    return n * 2
  })
  assert.deepEqual(results, items.map(n => n * 2))
  assert.ok(peak <= 4, `concurrency ${peak} exceeded the pool size`)
})

test('readBody: JSON object, empty body, and failures', async () => {
  const streamOf = chunks => (async function* () { for (const c of chunks) yield c })()
  assert.deepEqual(await readBody(streamOf([])), {})
  assert.deepEqual(await readBody(streamOf([Buffer.from('{"a":1}')])), { a: 1 })
  await assert.rejects(() => readBody(streamOf([Buffer.from('not json')])), /must be a JSON object/)
  await assert.rejects(
    () => readBody(streamOf([Buffer.alloc(1024 * 1024 + 1)])),
    err => err.status === 413,
  )
})

test('sendJson: status, headers, and body', () => {
  const calls = {}
  const res = {
    writeHead(status, headers) { calls.status = status; calls.headers = headers },
    end(body) { calls.body = body },
  }
  sendJson(res, 418, { a: 1 })
  assert.equal(calls.status, 418)
  assert.equal(calls.headers['content-type'], 'application/json; charset=utf-8')
  assert.deepEqual(JSON.parse(calls.body), { a: 1 })
})

function mount(config = {}) {
  const listeners = []
  const effects = []
  const ctx = {
    logger: () => ({ warn: () => {} }),
    on: (name, fn) => listeners.push([name, fn]),
    effect: fn => { effects.push(fn()) },
    get: () => undefined,
    // Cordis semantics: fire once every dependency is available, else stay pending.
    inject(deps, cb) { if (deps.every(d => ctx.get(d) !== undefined)) cb(ctx) },
  }
  apply(ctx, config)
  const handler = listeners.find(([name]) => name === 'connection/request')?.[1]
  assert.ok(handler, 'connection/request listener must be registered')
  // Run effect cleanups (sweep timer) at process teardown so tests can exit.
  mountedCleanups.push(...effects.filter(one => typeof one === 'function'))
  return { handler, effects }
}

function makeReq(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return Object.assign((async function* () { for (const c of chunks) yield c })(), { method, url })
}

function makeRes() {
  return {
    status: 0,
    body: '',
    writeHead(s) { this.status = s },
    end(b) { this.body = b ?? '' },
  }
}

async function call(handler, method, path, body) {
  const req = makeReq(method, `/api/kafka-tool${path}`, body)
  const res = makeRes()
  let delegated = false
  await handler(req, res, async () => { delegated = true })
  const data = res.body === '' ? null : JSON.parse(res.body)
  return { delegated, status: res.status, data }
}

test('routes: foreign paths delegate to the shared bridge', async () => {
  const { handler } = mount()
  const req = makeReq('GET', '/api/remote.mux')
  const res = makeRes()
  let delegated = false
  await handler(req, res, async () => { delegated = true })
  assert.equal(delegated, true)
})

test('routes: GET /defaults returns sanitized plugin config', async () => {
  const { handler } = mount({
    brokers: ['a:9092', 'b:9092'],
    ssl: true,
    sasl: { mechanism: 'plain', username: 'u', password: 'must-not-leak' },
  })
  const result = await call(handler, 'GET', '/defaults')
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.brokers, ['a:9092', 'b:9092'])
  assert.equal(result.data.ssl, true)
  assert.deepEqual(result.data.sasl, { mechanism: 'plain', username: 'u' })
  assert.equal(JSON.stringify(result.data).includes('must-not-leak'), false)
})

test('routes: validation failures return 4xx JSON', async () => {
  const { handler } = mount()
  const badBrokers = await call(handler, 'POST', '/connections', { brokers: [] })
  assert.equal(badBrokers.status, 400)
  assert.match(badBrokers.data.error, /brokers/)

  const badBody = await call(handler, 'POST', '/connections', undefined)
  // Empty body is valid JSON-wise but still fails broker validation.
  assert.equal(badBody.status, 400)

  const unknown = await call(handler, 'GET', '/nope')
  assert.equal(unknown.status, 404)

  const missingConn = await call(handler, 'GET', '/topics?c=does-not-exist')
  assert.equal(missingConn.status, 404)
  assert.match(missingConn.data.error, /connection not found/)

  const missingSub = await call(handler, 'GET', '/subscriptions/nope/messages?after=0')
  assert.equal(missingSub.status, 404)
  assert.match(missingSub.data.error, /subscription not found/)

  // Unknown connections are rejected before body validation runs.
  const badSubscribe = await call(handler, 'POST', '/subscriptions', { c: 'x', topics: [] })
  assert.equal(badSubscribe.status, 404)

  const connProbe = await call(handler, 'GET', '/connections/nope')
  assert.equal(connProbe.status, 404)
  const subProbe = await call(handler, 'GET', '/subscriptions/nope')
  assert.equal(subProbe.status, 404)
})

test('kafka_query tool registers when the tools service exists', async () => {
  const registered = []
  const listeners = []
  const effects = []
  const tools = { register: def => { registered.push(def); return () => {} } }
  const ctx = {
    logger: () => ({ warn: () => {} }),
    on: (name, fn) => listeners.push([name, fn]),
    effect: fn => { effects.push(fn()) },
    get: name => (name === 'tools' ? tools : undefined),
    inject(deps, cb) { if (deps.every(d => ctx.get(d) !== undefined)) cb(ctx) },
  }
  apply(ctx)
  mountedCleanups.push(...effects.filter(one => typeof one === 'function'))
  const tool = registered.find(def => def.name === 'kafka_query')
  assert.ok(tool, 'kafka_query tool must be registered')
  assert.equal(tool.isConcurrencySafe(), true)
  await assert.rejects(() => tool.execute({ action: 'list_topics' }), /connection is required/)
  await assert.rejects(() => tool.execute({ action: 'list_topics', connection: 'nope' }), /connection not found/)
  await assert.rejects(() => tool.execute({ action: 'wat', connection: 'nope' }), /connection not found/)
  const list = await tool.execute({ action: 'list_connections' })
  assert.deepEqual(list.connections, [])
})

test('Config rejects a bad document before any route is registered', () => {
  const listeners = []
  const ctx = {
    logger: () => ({ warn: () => {} }),
    on: (name, fn) => listeners.push([name, fn]),
    effect: () => {},
    get: () => undefined,
    inject() {},
  }
  assert.throws(() => apply(ctx, { ssl: 'yes' }), /ssl/)
  assert.equal(listeners.length, 0)
})

test('unload disposer stops the sweep timer and does not throw', async () => {
  const { effects } = mount()
  const dispose = effects.find(one => typeof one === 'function')
  assert.equal(typeof dispose, 'function')
  await dispose()
  await dispose()
})

test('plugin stays active without the tools service', () => {
  const { handler } = mount()
  assert.equal(typeof handler, 'function')
})

test('connection finishing after unload is disconnected and not retained', async (t) => {
  const { Kafka } = await import('kafkajs')
  let release
  const waiting = new Promise(resolve => { release = resolve })
  let disconnected = 0
  t.mock.method(Kafka.prototype, 'admin', () => ({
    connect: () => waiting,
    describeCluster: async () => ({ brokers: [] }),
    disconnect: async () => { disconnected++ },
  }))
  const { handler, effects } = mount()
  const pending = call(handler, 'POST', '/connections', { brokers: ['localhost:9092'] })
  await new Promise(resolve => setImmediate(resolve))
  await effects.find(fn => typeof fn === 'function')()
  release()
  const result = await pending
  assert.equal(result.status, 503)
  assert.equal(disconnected, 1)
})
