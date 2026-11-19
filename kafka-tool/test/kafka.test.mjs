/**
 * Integration tests against a real Kafka broker. They are skipped when no
 * broker is reachable; point KAFKA_TOOL_TEST_BROKERS at another cluster to
 * run them elsewhere. The suite creates and deletes its own topic and
 * consumer group, so it is safe to run repeatedly.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Kafka, logLevel } from 'kafkajs'
import { apply } from '../index.js'

const BROKERS = (process.env.KAFKA_TOOL_TEST_BROKERS ?? 'localhost:9092').split(',').map(one => one.trim())

let available = false
let seedKafka
let seedAdmin
const topic = `kafka-tool-it-${Date.now().toString(36)}`
const groupId = `kafka-tool-it-group-${Date.now().toString(36)}`

const listeners = []
const effects = []
const registeredTools = []
const ctx = {
  logger: () => ({ warn: () => {} }),
  on: (name, fn) => listeners.push([name, fn]),
  effect: fn => { effects.push(fn()) },
  get: name => (name === 'tools' ? { register: def => { registeredTools.push(def); return () => {} } } : undefined),
  // Cordis semantics: fire once every dependency is available, else stay pending.
  inject(deps, cb) { if (deps.every(d => ctx.get(d) !== undefined)) cb(ctx) },
}
apply(ctx)
const handler = listeners.find(([name]) => name === 'connection/request')[1]
const kafkaTool = registeredTools.find(def => def.name === 'kafka_query')

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

async function call(method, path, body) {
  const req = makeReq(method, `/api/kafka-tool${path}`, body)
  const res = makeRes()
  let delegated = false
  await handler(req, res, async () => { delegated = true })
  assert.equal(delegated, false, `route must handle ${method} ${path}`)
  return { status: res.status, data: JSON.parse(res.body) }
}

async function produce(messages, batchTopic = topic) {
  const producer = seedKafka.producer()
  await producer.connect()
  try {
    await producer.send({ topic: batchTopic, messages })
  } finally {
    await producer.disconnect()
  }
}

before(async () => {
  seedKafka = new Kafka({ clientId: 'kafka-tool-test', brokers: BROKERS, connectionTimeout: 2000, requestTimeout: 4000, retry: { retries: 1 }, logLevel: logLevel.NOTHING })
  seedAdmin = seedKafka.admin()
  try {
    await seedAdmin.connect()
    available = true
  } catch {
    console.warn(`[integration] no Kafka broker at ${BROKERS.join(', ')}; skipping`)
    return
  }
  await seedAdmin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] })
  // 20 JSON + 1 binary messages; then a group that consumes the first 20.
  const messages = []
  for (let i = 0; i < 20; i++) messages.push({ key: `key-${i}`, value: JSON.stringify({ n: i }) })
  messages.push({ key: Buffer.from([0, 1, 2, 3]), value: Buffer.from([0, 159, 146, 150]) })
  await produce(messages)
  const consumer = seedKafka.consumer({ groupId })
  await consumer.connect()
  await consumer.subscribe({ topic, fromBeginning: true })
  let seen = 0
  await consumer.run({
    autoCommit: true,
    autoCommitInterval: 500,
    eachMessage: async () => { seen += 1 },
  })
  await new Promise(resolve => {
    const timer = setInterval(() => { if (seen >= 21) { clearInterval(timer); resolve() } }, 100)
    setTimeout(() => { clearInterval(timer); resolve() }, 8000)
  })
  await consumer.stop()
  await consumer.disconnect()
  // 5 more messages arrive after the group stopped: lag becomes 5.
  await produce(Array.from({ length: 5 }, (_, i) => ({ key: `late-${i}`, value: `late ${i}` })))
})

after(async () => {
  for (const cleanup of effects) cleanup?.()
  if (!available) return
  try { await seedAdmin.deleteTopics({ topics: [topic] }) } catch { /* best effort */ }
  try { await seedAdmin.deleteGroups([groupId]) } catch { /* best effort */ }
  await seedAdmin.disconnect()
})

function skipUnlessAvailable(t) {
  if (!available) {
    t.skip(`no Kafka broker at ${BROKERS.join(', ')}`)
    return true
  }
  return false
}

test('connect, topics, groups, and lag', async t => {
  if (skipUnlessAvailable(t)) return
  const conn = await call('POST', '/connections', { brokers: BROKERS })
  assert.equal(conn.status, 200)
  assert.ok(conn.data.clusterId)
  const c = conn.data.id

  // Same parameters connect again: the live connection is reused.
  const again = await call('POST', '/connections', { brokers: BROKERS })
  assert.equal(again.data.id, c)

  const topics = await call('GET', `/topics?c=${c}`)
  assert.equal(topics.status, 200)
  const ours = topics.data.topics.find(one => one.name === topic)
  assert.ok(ours, 'test topic must be listed')
  assert.equal(ours.partitionCount, 1)
  assert.equal(ours.partitions[0].partition, 0)
  assert.equal('size' in ours, false, 'topic list stays metadata-only; offsets load lazily')

  const topicOffs = await call('GET', `/topic-offsets?c=${c}&topic=${encodeURIComponent(topic)}`)
  assert.equal(topicOffs.status, 200)
  assert.equal(topicOffs.data.partitions[0].size, '26')

  const groups = await call('GET', `/groups?c=${c}`)
  assert.equal(groups.status, 200)
  assert.ok(groups.data.groups.some(one => one.groupId === groupId))

  const offsets = await call('GET', `/group-offsets?c=${c}&group=${groupId}`)
  assert.equal(offsets.status, 200)
  const part = offsets.data.topics.find(one => one.topic === topic)?.partitions[0]
  assert.ok(part)
  assert.equal(part.lag, '5')

  await call('DELETE', `/connections/${c}`)
})

test('subscription lifecycle: latest, live poll, backfill, seek, detail', async t => {
  if (skipUnlessAvailable(t)) return
  const conn = await call('POST', '/connections', { brokers: BROKERS })
  const c = conn.data.id

  const sub = await call('POST', '/subscriptions', { c, topics: [topic], start: { mode: 'latest' } })
  assert.equal(sub.status, 200)
  assert.equal(sub.data.partitions.length, 1)
  const sid = sub.data.id

  // Nothing old at "latest".
  let page = await call('GET', `/subscriptions/${sid}/messages?after=0&limit=500`)
  assert.equal(page.data.messages.length, 0)
  assert.equal(page.data.dropped, 0)

  // Live messages arrive through the poll.
  await produce([{ key: 'live', value: '{"live":true}' }])
  await new Promise(resolve => setTimeout(resolve, 4000))
  page = await call('GET', `/subscriptions/${sid}/messages?after=0&limit=500`)
  assert.equal(page.data.messages.length, 1)
  assert.equal(page.data.messages[0].keySize, 4)
  assert.equal('value' in page.data.messages[0], false, 'list rows must not carry the value payload')

  // Detail fetch returns the value on demand.
  const detail = await call('POST', '/message', {
    c, topic, partition: 0, offset: page.data.messages[0].offset,
  })
  assert.equal(detail.status, 200)
  assert.equal(Buffer.from(detail.data.message.value, 'base64').toString(), '{"live":true}')
  const missing = await call('POST', '/message', { c, topic, partition: 0, offset: '999999' })
  assert.equal(missing.status, 404)

  // Backfill pages the history before the live offset.
  const backfill = await call('POST', '/backfill', { c, topic, partition: 0, before: page.data.messages[0].offset, count: 5 })
  assert.equal(backfill.status, 200)
  assert.equal(backfill.data.messages.length, 5)
  assert.equal(BigInt(backfill.data.messages.at(-1).offset), BigInt(page.data.messages[0].offset) - 1n)

  // Seek to earliest replays the whole partition.
  const seek = await call('POST', `/subscriptions/${sid}/seek`, { mode: 'earliest' })
  assert.equal(seek.status, 200)
  await new Promise(resolve => setTimeout(resolve, 9000))
  page = await call('GET', `/subscriptions/${sid}/messages?after=0&limit=1000`)
  assert.equal(page.data.epoch, seek.data.epoch)
  assert.ok(page.data.messages.length >= 27, `expected the full partition, got ${page.data.messages.length}`)
  assert.equal(page.data.messages[0].offset, '0')
  const binary = page.data.messages.find(one => one.keySize === 4 && one.offset === '20')
  assert.ok(binary, 'binary message must appear after seeking to earliest')

  // Remount resume: subscription info probe + tail refill from the buffer.
  const info = await call('GET', `/subscriptions/${sid}`)
  assert.equal(info.status, 200)
  assert.equal(info.data.id, sid)
  assert.equal(info.data.partitions.length, 1)
  const tail = await call('GET', `/subscriptions/${sid}/messages?tail=3`)
  assert.equal(tail.status, 200)
  assert.equal(tail.data.messages.length, 3)
  assert.deepEqual(
    tail.data.messages.map(one => one.offset),
    page.data.messages.slice(-3).map(one => one.offset),
    'tail must be the buffer end',
  )
  assert.equal(tail.data.latest, page.data.latest)

  await call('DELETE', `/subscriptions/${sid}`)
  await call('DELETE', `/connections/${c}`)
})

test('agent tool end-to-end: connect, list, peek, message, disconnect', async t => {
  if (skipUnlessAvailable(t)) return
  assert.ok(kafkaTool, 'kafka_query tool must be registered')
  const connected = await kafkaTool.execute({ action: 'connect', brokers: BROKERS })
  assert.ok(connected.connection)
  const c = connected.connection

  const listed = await kafkaTool.execute({ action: 'list_connections' })
  assert.ok(listed.connections.some(one => one.id === c))

  const topics = await kafkaTool.execute({ action: 'list_topics', connection: c })
  assert.ok(topics.topics.some(one => one.name === topic))

  const offsets = await kafkaTool.execute({ action: 'topic_offsets', connection: c, topic })
  assert.ok(BigInt(offsets.partitions[0].size) >= 26n, `expected at least the seeded messages, got ${offsets.partitions[0].size}`)

  const peeked = await kafkaTool.execute({ action: 'peek', connection: c, topic, count: 3 })
  assert.equal(peeked.messages.length, 3)
  const end = BigInt(offsets.partitions[0].high)
  assert.deepEqual(
    peeked.messages.map(one => BigInt(one.offset)),
    [end - 3n, end - 2n, end - 1n],
    'peek must return the latest messages',
  )
  assert.ok('text' in (peeked.messages[0].value ?? {}) || 'base64' in (peeked.messages[0].value ?? {}))

  const one = await kafkaTool.execute({ action: 'message', connection: c, topic, partition: 0, offset: peeked.messages[0].offset })
  assert.equal(one.message.offset, peeked.messages[0].offset)

  const gone = await kafkaTool.execute({ action: 'disconnect', connection: c })
  assert.equal(gone.ok, true)
  await assert.rejects(() => kafkaTool.execute({ action: 'list_topics', connection: c }), /connection not found/)
})

test('timestamp start positions the subscription', async t => {
  if (skipUnlessAvailable(t)) return
  const conn = await call('POST', '/connections', { brokers: BROKERS })
  const c = conn.data.id
  const marker = Date.now()
  await new Promise(resolve => setTimeout(resolve, 1100))
  await produce([{ key: 'after-marker', value: 'after' }])
  const sub = await call('POST', '/subscriptions', { c, topics: [topic], start: { mode: 'timestamp', timestamp: marker } })
  const sid = sub.data.id
  await new Promise(resolve => setTimeout(resolve, 6000))
  const page = await call('GET', `/subscriptions/${sid}/messages?after=0&limit=500`)
  assert.ok(
    page.data.messages.every(one => Number(one.timestamp) >= marker - 2000),
    'timestamp mode must not replay the whole partition',
  )
  await call('DELETE', `/subscriptions/${sid}`)
  await call('DELETE', `/connections/${c}`)
})
