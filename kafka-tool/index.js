/**
 * Host half of the Kafka explorer bundle.
 *
 * Serves the panel's JSON API under /api/kafka-tool/* on the shared,
 * already-authenticated /api bridge (see the client-connection
 * `connection/request` waterfall), and owns every Kafka client object the
 * panel asks for: one admin-backed connection per broker set, plus one
 * consumer per message subscription. Everything is stopped when the plugin
 * unloads, and idle objects are swept periodically.
 */
import { randomUUID } from 'node:crypto'
import { Kafka, logLevel } from 'kafkajs'
import Schema from '@deepseek-ai/schemastery'

/** Cordis plugin name. Stable across host reloads. */
export const name = 'kafka-tool'

/**
 * Validated by Cordis before apply. Password is intentionally absent: a secret
 * in this document would be stored in the profile patch. Runtime still drops
 * a password key if one is present, so it never reaches the panel defaults.
 */
export const Config = Schema.object({
  brokers: Schema.array(Schema.string()).default([]),
  ssl: Schema.boolean().default(false),
  sasl: Schema.object({
    mechanism: Schema.union(['plain', 'scram-sha-256', 'scram-sha-512']),
    username: Schema.string(),
  }),
})

/** Empty or partial SASL from schema defaults is "not configured", not PLAIN with a blank user. */
export function configuredSasl(value) {
  if (!value || typeof value !== 'object') return null
  const mechanism = value.mechanism
  const username = typeof value.username === 'string' ? value.username : ''
  const known = mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512'
  if (!known && username === '') return null
  return { mechanism: known ? mechanism : 'plain', username }
}

const PREFIX = '/api/kafka-tool/'
const MAX_BODY_BYTES = 1024 * 1024
const VALUE_CAP_BYTES = 256 * 1024
const KEY_CAP_BYTES = 8 * 1024
const HEADER_CAP_BYTES = 4 * 1024
const BUFFER_CAP = 5000
const POLL_LIMIT_CAP = 1000
const BACKFILL_CAP = 500
const IDLE_LIMIT_MS = 15 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 1000
const BACKFILL_IDLE_MS = 4000
const BACKFILL_TIMEOUT_MS = 20000

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
    this.code = 'bad-request'
  }
}

export function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

export async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'request body must be a JSON object')
  }
}

export function asBrokers(value) {
  if (!Array.isArray(value) || value.length === 0
    || value.some(one => typeof one !== 'string' || one.trim() === '')) {
    throw new HttpError(400, 'brokers must be a non-empty string array')
  }
  return value.map(one => one.trim())
}

export function asSasl(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object') throw new HttpError(400, 'sasl must be an object')
  const { mechanism } = value
  if (mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512') {
    return {
      mechanism,
      username: String(value.username ?? ''),
      password: String(value.password ?? ''),
    }
  }
  throw new HttpError(400, `unsupported sasl mechanism: ${String(mechanism)}`)
}

export function clampOffset(offset, low, high) {
  let value = BigInt(offset)
  if (value < low) value = low
  if (value > high) value = high
  return value
}

export function encodeHeaders(message) {
  const headers = {}
  if (message.headers) {
    for (const [name, raw] of Object.entries(message.headers)) {
      // kafkajs header values may be Buffer, string, or an array of either.
      const one = Buffer.isBuffer(raw) ? raw
        : typeof raw === 'string' ? Buffer.from(raw)
          : Array.isArray(raw) && raw.length > 0
            ? (Buffer.isBuffer(raw[0]) ? raw[0] : Buffer.from(String(raw[0])))
            : undefined
      if (one !== undefined) {
        headers[name] = one.subarray(0, HEADER_CAP_BYTES).toString('base64')
      }
    }
  }
  return headers
}

/**
 * Serialize one message for the wire. List rows carry no value payload
 * (`withValue: false`); the detail dialog fetches the value on demand
 * through POST /message, so buffering thousands of rows stays cheap.
 */
export function encodeMessage(seq, topic, partition, message, { withValue = false } = {}) {
  const key = message.key ?? null
  const value = message.value ?? null
  return {
    seq,
    topic,
    partition,
    offset: message.offset,
    timestamp: message.timestamp,
    key: key === null ? null : key.subarray(0, KEY_CAP_BYTES).toString('base64'),
    keySize: key === null ? 0 : key.length,
    keyTruncated: key !== null && key.length > KEY_CAP_BYTES,
    valueSize: value === null ? 0 : value.length,
    ...(withValue
      ? {
          value: value === null ? null : value.subarray(0, VALUE_CAP_BYTES).toString('base64'),
          truncated: value !== null && value.length > VALUE_CAP_BYTES,
        }
      : {}),
    headers: encodeHeaders(message),
  }
}

/** Run fn over items with bounded concurrency, preserving order. */
export async function mapPool(items, size, fn) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }))
  return results
}

export function apply(ctx, config = {}) {
  const resolved = Config(config ?? {})
  const defaults = {
    brokers: resolved.brokers.filter(one => one !== ''),
    ssl: resolved.ssl === true,
    sasl: configuredSasl(resolved.sasl),
  }
  const log = typeof ctx.logger === 'function' ? ctx.logger('kafka-explorer') : console
  /** @type {Map<string, {id: string, params: object, kafka: Kafka, admin: any, adminReady: Promise<void>|null, lastUsed: number, subscriptions: Set<string>}>} */
  const connections = new Map()
  /** @type {Map<string, object>} */
  const subscriptions = new Map()

  function touchConn(conn) {
    conn.lastUsed = Date.now()
  }

  async function ensureAdmin(conn) {
    touchConn(conn)
    if (conn.adminReady === null) {
      conn.adminReady = conn.admin.connect()
      conn.adminReady.catch(() => { conn.adminReady = null })
    }
    await conn.adminReady
    return conn.admin
  }

  function getConn(id) {
    const conn = connections.get(id)
    if (conn === undefined) throw new HttpError(404, 'connection not found or expired; reconnect')
    touchConn(conn)
    return conn
  }

  function getSub(id) {
    const sub = subscriptions.get(id)
    if (sub === undefined) throw new HttpError(404, 'subscription not found or expired; subscribe again')
    sub.lastUsed = Date.now()
    touchConn(sub.conn)
    return sub
  }

  async function stopSubscription(sub) {
    if (!subscriptions.delete(sub.id)) return
    sub.conn.subscriptions.delete(sub.id)
    try { await sub.consumer.stop() } catch { /* already stopped */ }
    try { await sub.consumer.disconnect() } catch { /* already disconnected */ }
  }

  async function dropConnection(conn) {
    for (const id of [...conn.subscriptions]) {
      const sub = subscriptions.get(id)
      if (sub !== undefined) await stopSubscription(sub)
    }
    connections.delete(conn.id)
    try { await conn.admin.disconnect() } catch { /* never connected or already gone */ }
  }

  function report(err, message) {
    try { log.warn(message, err) } catch { /* a broken logger must not escape the plugin */ }
  }

  function sweep() {
    try {
      const now = Date.now()
      for (const sub of [...subscriptions.values()]) {
        if (now - sub.lastUsed > IDLE_LIMIT_MS) {
          stopSubscription(sub).catch(err => report(err, 'subscription sweep failed:'))
        }
      }
      for (const conn of [...connections.values()]) {
        if (conn.subscriptions.size === 0 && now - conn.lastUsed > IDLE_LIMIT_MS) {
          dropConnection(conn).catch(err => report(err, 'connection sweep failed:'))
        }
      }
    } catch (err) {
      report(err, 'sweep failed:')
    }
  }

  async function partitionSnapshot(admin, topics) {
    const snapshot = []
    for (const topic of topics) {
      let offsets
      try {
        offsets = await admin.fetchTopicOffsets(topic)
      } catch (err) {
        throw new HttpError(502, `offsets unavailable for ${topic}: ${err instanceof Error ? err.message : String(err)}`)
      }
      for (const row of offsets) {
        snapshot.push({
          topic,
          partition: row.partition,
          low: row.low,
          high: row.high,
          size: (BigInt(row.high) - BigInt(row.low)).toString(),
        })
      }
    }
    return snapshot
  }

  async function planSeeks(admin, sub, spec) {
    // Compute the desired start offset per assigned partition.
    const byTopic = new Map()
    for (const part of sub.partitions) {
      if (!byTopic.has(part.topic)) byTopic.set(part.topic, [])
      byTopic.get(part.topic).push(part)
    }
    const plan = new Map()
    if (spec.mode === 'timestamp') {
      const timestamp = Number(spec.timestamp)
      if (!Number.isFinite(timestamp)) throw new HttpError(400, 'timestamp mode requires a millisecond timestamp')
      for (const topic of byTopic.keys()) {
        const rows = await admin.fetchTopicOffsetsByTimestamp(topic, timestamp)
        for (const row of rows) {
          const part = byTopic.get(topic).find(one => one.partition === row.partition)
          if (part === undefined) continue
          // -1: no message at or after the timestamp; start at the end.
          const target = BigInt(row.offset) < 0n ? BigInt(part.high) : clampOffset(row.offset, BigInt(part.low), BigInt(part.high))
          plan.set(`${topic}:${row.partition}`, target.toString())
        }
      }
    } else if (spec.mode === 'offset') {
      const raw = String(spec.offset ?? '')
      if (!/^\d+$/.test(raw)) throw new HttpError(400, 'offset mode requires a non-negative integer offset')
      for (const part of sub.partitions) {
        plan.set(`${part.topic}:${part.partition}`, clampOffset(raw, BigInt(part.low), BigInt(part.high)).toString())
      }
    } else if (spec.mode === 'earliest') {
      for (const part of sub.partitions) plan.set(`${part.topic}:${part.partition}`, part.low)
    } else if (spec.mode === 'latest') {
      for (const part of sub.partitions) plan.set(`${part.topic}:${part.partition}`, part.high)
    } else {
      throw new HttpError(400, `unknown seek mode: ${String(spec.mode)}`)
    }
    return plan
  }

  function applySeekPlan(sub, plan) {
    sub.seekPlan = plan
    sub.buffer = []
    sub.epoch += 1
    if (sub.joined) {
      for (const [key, offset] of plan) {
        const [topic, partition] = key.split(':')
        try { sub.consumer.seek({ topic, partition: Number(partition), offset }) } catch { /* not assigned yet */ }
      }
    }
  }

  async function createConnection(body) {
    const params = {
      brokers: asBrokers(body.brokers),
      ssl: body.ssl === true || (body.ssl && typeof body.ssl === 'object') ? (body.ssl === true ? true : body.ssl) : false,
      sasl: asSasl(body.sasl),
    }
    // Panel remounts reconnect with the same form; reuse the live connection.
    const key = JSON.stringify(params)
    for (const conn of connections.values()) {
      if (JSON.stringify(conn.params) === key) {
        touchConn(conn)
        return conn.info
      }
    }
    const kafka = new Kafka({
      clientId: typeof body.clientId === 'string' && body.clientId !== '' ? body.clientId : 'dsh-kafka-tool',
      brokers: params.brokers,
      ssl: params.ssl || undefined,
      sasl: params.sasl,
      connectionTimeout: 10000,
      requestTimeout: 20000,
      retry: { retries: 2 },
      logLevel: logLevel.NOTHING,
    })
    const admin = kafka.admin()
    await admin.connect()
    let cluster
    try {
      cluster = await admin.describeCluster()
    } catch (err) {
      await admin.disconnect().catch(() => {})
      throw err
    }
    const conn = {
      id: randomUUID(),
      params,
      kafka,
      admin,
      adminReady: Promise.resolve(),
      lastUsed: Date.now(),
      subscriptions: new Set(),
      info: null,
    }
    conn.info = {
      id: conn.id,
      clusterId: cluster.clusterId,
      controller: cluster.controller,
      brokers: cluster.brokers.map(one => `${one.host}:${String(one.port)}`),
    }
    connections.set(conn.id, conn)
    return conn.info
  }

  /**
   * Topic list from metadata only: one broker round trip even on clusters
   * with thousands of topics. Offsets load lazily per topic through
   * GET /topic-offsets, because fetchTopicOffsets throws on partitions
   * whose leaders are offline — a common sight on big shared clusters.
   */
  async function listTopics(conn) {
    const admin = await ensureAdmin(conn)
    const meta = await admin.fetchTopicMetadata()
    const topics = meta.topics
      .map(one => ({
        name: one.name,
        partitionCount: one.partitions.length,
        partitions: one.partitions
          .map(part => ({ partition: part.partitionId, leader: part.leader }))
          .sort((a, b) => a.partition - b.partition),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { topics }
  }

  /** Begin/end offsets of one topic, tolerant of partially offline topics. */
  async function topicOffsets(conn, topic) {
    if (typeof topic !== 'string' || topic === '') throw new HttpError(400, 'topic is required')
    const admin = await ensureAdmin(conn)
    let rows
    try {
      rows = await admin.fetchTopicOffsets(topic)
    } catch (err) {
      throw new HttpError(502, `offsets unavailable for ${topic}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return {
      topic,
      partitions: rows.map(row => ({
        partition: row.partition,
        low: row.low,
        high: row.high,
        size: (BigInt(row.high) - BigInt(row.low)).toString(),
      })),
    }
  }

  async function listGroups(conn) {
    const admin = await ensureAdmin(conn)
    const listed = await admin.listGroups()
    const ids = listed.groups.map(one => one.groupId)
    if (ids.length === 0) return { groups: [] }
    const described = await admin.describeGroups(ids)
    return {
      groups: described.groups.map(one => ({
        groupId: one.groupId,
        state: one.state,
        protocol: one.protocol,
        protocolType: one.protocolType,
        members: one.members.map(member => ({
          memberId: member.memberId,
          clientId: member.clientId,
          clientHost: member.clientHost,
        })),
      })),
    }
  }

  async function groupOffsets(conn, groupId) {
    const admin = await ensureAdmin(conn)
    const rows = await admin.fetchOffsets({ groupId })
    // Topics whose leaders are (partially) offline make fetchTopicOffsets
    // throw; keep their lag unknown instead of failing the whole group.
    const endsByTopic = await mapPool(rows, 10, row =>
      admin.fetchTopicOffsets(row.topic).catch(() => null))
    const topics = rows.map((row, index) => {
      const endOf = new Map((endsByTopic[index] ?? []).map(one => [one.partition, one]))
      return {
        topic: row.topic,
        partitions: row.partitions.map(one => {
          const end = endOf.get(one.partition)
          const committed = BigInt(one.offset)
          const high = end === undefined ? null : end.high
          return {
            partition: one.partition,
            offset: one.offset,
            high,
            lag: committed < 0n || high === null ? null : (BigInt(high) - committed).toString(),
          }
        }),
      }
    })
    return { groupId, topics }
  }

  async function createSubscription(conn, body) {
    const topics = Array.isArray(body.topics) ? body.topics.filter(one => typeof one === 'string' && one !== '') : []
    if (topics.length === 0) throw new HttpError(400, 'topics must be a non-empty string array')
    const admin = await ensureAdmin(conn)
    const start = body.start && typeof body.start === 'object' ? body.start : { mode: 'latest' }
    const consumer = conn.kafka.consumer({
      groupId: `dsh-kafka-tool-${randomUUID()}`,
      allowAutoTopicCreation: false,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    })
    const sub = {
      id: randomUUID(),
      conn,
      consumer,
      partitions: [],
      buffer: [],
      seq: 0,
      epoch: 0,
      joined: false,
      seekPlan: new Map(),
      lastUsed: Date.now(),
    }
    sub.partitions = await partitionSnapshot(admin, topics)
    const plan = await planSeeks(admin, sub, start)
    sub.seekPlan = plan
    try {
      await consumer.connect()
      consumer.on(consumer.events.GROUP_JOIN, event => {
        sub.joined = true
        const assignment = event.payload.memberAssignment ?? {}
        for (const [topic, parts] of Object.entries(assignment)) {
          for (const partition of parts) {
            const planned = sub.seekPlan.get(`${topic}:${String(partition)}`)
            if (planned !== undefined) {
              try { consumer.seek({ topic, partition, offset: planned }) } catch { /* revoked meanwhile */ }
            }
          }
        }
      })
      // fromBeginning only matters while the plan has no entry for a partition;
      // keep it aligned with the requested mode for safety.
      await consumer.subscribe({ topics, fromBeginning: start.mode === 'earliest' })
      await consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
          sub.buffer.push(encodeMessage(++sub.seq, topic, partition, message))
          if (sub.buffer.length > BUFFER_CAP) sub.buffer.splice(0, sub.buffer.length - BUFFER_CAP)
        },
      })
    } catch (err) {
      // Never leak a half-started consumer out of a failed subscription.
      try { await consumer.stop() } catch { /* not running */ }
      try { await consumer.disconnect() } catch { /* not connected */ }
      throw err
    }
    subscriptions.set(sub.id, sub)
    conn.subscriptions.add(sub.id)
    return { id: sub.id, epoch: sub.epoch, partitions: sub.partitions }
  }

  async function backfill(conn, body) {
    const topic = typeof body.topic === 'string' ? body.topic : ''
    const partition = Number(body.partition)
    const count = Math.min(Math.max(Number(body.count) || 100, 1), BACKFILL_CAP)
    const withValue = body.withValue === true
    if (topic === '' || !Number.isInteger(partition) || partition < 0) {
      throw new HttpError(400, 'backfill requires a topic and a non-negative integer partition')
    }
    const admin = await ensureAdmin(conn)
    const offsets = await admin.fetchTopicOffsets(topic)
    const row = offsets.find(one => one.partition === partition)
    if (row === undefined) throw new HttpError(404, `partition ${String(partition)} not found on topic ${topic}`)
    const low = BigInt(row.low)
    const high = BigInt(row.high)
    let before = BigInt(String(body.before ?? row.high))
    if (before > high) before = high
    if (before <= low) return { messages: [], low: row.low, high: row.high, reachedBeginning: true }
    let start = before - BigInt(count)
    if (start < low) start = low
    const consumer = conn.kafka.consumer({
      groupId: `dsh-kafka-tool-backfill-${randomUUID()}`,
      allowAutoTopicCreation: false,
      sessionTimeout: 15000,
    })
    const collected = []
    await consumer.connect()
    try {
      await consumer.subscribe({ topic, fromBeginning: true })
      let finish
      const done = new Promise(resolve => { finish = resolve })
      let idleTimer = null
      const armIdle = () => {
        if (idleTimer !== null) clearTimeout(idleTimer)
        idleTimer = setTimeout(finish, BACKFILL_IDLE_MS)
      }
      consumer.on(consumer.events.GROUP_JOIN, event => {
        const assigned = (event.payload.memberAssignment ?? {})[topic] ?? []
        if (assigned.includes(partition)) {
          try { consumer.seek({ topic, partition, offset: start.toString() }) } catch { /* revoked meanwhile */ }
        }
        armIdle()
      })
      let seq = 0
      await consumer.run({
        autoCommit: false,
        eachMessage: async ({ partition: part, message }) => {
          if (part !== partition) return
          const offset = BigInt(message.offset)
          if (offset >= before) { finish(); return }
          collected.push(encodeMessage(++seq, topic, part, message, { withValue }))
          if (offset >= before - 1n || offset >= high - 1n) { finish(); return }
          armIdle()
        },
      })
      let timeoutId
      await Promise.race([
        done,
        new Promise(resolve => { timeoutId = setTimeout(resolve, BACKFILL_TIMEOUT_MS) }),
      ])
      clearTimeout(timeoutId)
      if (idleTimer !== null) clearTimeout(idleTimer)
    } finally {
      try { await consumer.stop() } catch { /* already stopped */ }
      try { await consumer.disconnect() } catch { /* already disconnected */ }
    }
    return {
      messages: collected,
      low: row.low,
      high: row.high,
      reachedBeginning: collected.length > 0 && BigInt(collected[0].offset) <= low,
    }
  }

  /** Fetch one full message (value included) by exact offset for the detail dialog. */
  async function fetchOneMessage(conn, body) {
    const offset = BigInt(String(body.offset ?? ''))
    const result = await backfill(conn, {
      topic: body.topic,
      partition: body.partition,
      before: (offset + 1n).toString(),
      count: 1,
      withValue: true,
    })
    const message = result.messages.find(one => one.offset === offset.toString())
    if (message === undefined) {
      throw new HttpError(404, 'no message at that offset (compacted or out of range)')
    }
    return { message }
  }

  async function route(req, res, url) {
    const rest = url.pathname.slice(PREFIX.length)
    const segments = rest.split('/').filter(one => one !== '')
    const head = segments[0]

    if (req.method === 'GET' && head === 'defaults' && segments.length === 1) {
      return sendJson(res, 200, defaults)
    }
    if (req.method === 'POST' && head === 'connections' && segments.length === 1) {
      return sendJson(res, 200, await createConnection(await readBody(req)))
    }
    if (head === 'connections' && segments.length === 2 && req.method === 'GET') {
      // Liveness probe for panel remounts; never creates anything.
      const conn = connections.get(segments[1])
      if (conn === undefined) throw new HttpError(404, 'connection not found or expired')
      touchConn(conn)
      return sendJson(res, 200, conn.info)
    }
    if (head === 'connections' && segments.length === 2 && req.method === 'DELETE') {
      const conn = connections.get(segments[1])
      if (conn !== undefined) await dropConnection(conn)
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'GET' && head === 'topics') {
      return sendJson(res, 200, await listTopics(getConn(url.searchParams.get('c') ?? '')))
    }
    if (req.method === 'GET' && head === 'topic-offsets') {
      const conn = getConn(url.searchParams.get('c') ?? '')
      return sendJson(res, 200, await topicOffsets(conn, url.searchParams.get('topic') ?? ''))
    }
    if (req.method === 'GET' && head === 'groups') {
      return sendJson(res, 200, await listGroups(getConn(url.searchParams.get('c') ?? '')))
    }
    if (req.method === 'GET' && head === 'group-offsets') {
      return sendJson(res, 200, await groupOffsets(getConn(url.searchParams.get('c') ?? ''), url.searchParams.get('group') ?? ''))
    }
    if (req.method === 'POST' && head === 'subscriptions' && segments.length === 1) {
      const body = await readBody(req)
      return sendJson(res, 200, await createSubscription(getConn(String(body.c ?? '')), body))
    }
    if (head === 'subscriptions' && segments.length === 3 && segments[2] === 'messages' && req.method === 'GET') {
      const sub = getSub(segments[1])
      const tail = url.searchParams.get('tail')
      if (tail !== null) {
        // Remount resume: refill from the host ring buffer's tail. The client
        // continues polling from `latest` afterwards.
        const n = Math.min(Math.max(Number(tail) || POLL_LIMIT_CAP, 1), POLL_LIMIT_CAP)
        return sendJson(res, 200, { messages: sub.buffer.slice(-n), latest: sub.seq, epoch: sub.epoch, dropped: 0 })
      }
      const after = Number(url.searchParams.get('after') ?? '0')
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '200') || 200, 1), POLL_LIMIT_CAP)
      const messages = sub.buffer.filter(one => one.seq > after).slice(0, limit)
      // Messages with seq in (after, firstAvailable) left the ring buffer
      // between polls; tell the client exactly how many it can never see.
      let dropped = 0
      if (after > 0 && sub.buffer.length > 0 && sub.buffer[0].seq > after + 1) {
        dropped = sub.buffer[0].seq - after - 1
      }
      return sendJson(res, 200, { messages, latest: sub.seq, epoch: sub.epoch, dropped })
    }
    if (head === 'subscriptions' && segments.length === 2 && req.method === 'GET') {
      // Liveness + info probe for panel remounts; never creates anything.
      const sub = getSub(segments[1])
      return sendJson(res, 200, { id: sub.id, epoch: sub.epoch, partitions: sub.partitions })
    }
    if (head === 'subscriptions' && segments.length === 3 && segments[2] === 'seek' && req.method === 'POST') {
      const sub = getSub(segments[1])
      const body = await readBody(req)
      const admin = await ensureAdmin(sub.conn)
      sub.partitions = await partitionSnapshot(admin, [...new Set(sub.partitions.map(one => one.topic))])
      const plan = await planSeeks(admin, sub, body)
      applySeekPlan(sub, plan)
      return sendJson(res, 200, { id: sub.id, epoch: sub.epoch, partitions: sub.partitions })
    }
    if (head === 'subscriptions' && segments.length === 2 && req.method === 'DELETE') {
      const sub = subscriptions.get(segments[1])
      if (sub !== undefined) await stopSubscription(sub)
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && head === 'backfill') {
      const body = await readBody(req)
      return sendJson(res, 200, await backfill(getConn(String(body.c ?? '')), body))
    }
    if (req.method === 'POST' && head === 'message' && segments.length === 1) {
      const body = await readBody(req)
      return sendJson(res, 200, await fetchOneMessage(getConn(String(body.c ?? '')), body))
    }
    throw new HttpError(404, `unknown kafka-tool route: ${req.method} ${url.pathname}`)
  }

  // ---------- Agent tool ----------

  /** Decode bytes for an agent: printable UTF-8 as text, otherwise base64. */
  function agentBytes(b64) {
    if (b64 === null || b64 === undefined) return null
    const bytes = Buffer.from(b64, 'base64')
    let printable = bytes.length > 0
    for (const b of bytes.subarray(0, 8192)) {
      if (b < 0x09 || (b > 0x0d && b < 0x20)) { printable = false; break }
    }
    return printable
      ? { text: bytes.toString('utf8') }
      : { base64: b64 }
  }

  function agentMessage(msg) {
    return {
      topic: msg.topic,
      partition: msg.partition,
      offset: msg.offset,
      timestamp: msg.timestamp,
      key: agentBytes(msg.key),
      keySize: msg.keySize,
      value: agentBytes(msg.value),
      valueSize: msg.valueSize,
      truncated: msg.truncated === true,
    }
  }

  function registerTools() {
    const tools = ctx.get('tools')
    if (!tools) return
    ctx.effect(() => tools.register({
      name: 'kafka_query',
      description: [
        'Inspect a Kafka cluster: topics, per-partition offsets, consumer groups with lag, and message content.',
        'Actions: connect (brokers, optional ssl, optional sasl {mechanism,username,password}) returns a connection id shared with the sidebar panel;',
        'list_connections; disconnect (connection); list_topics (connection); topic_offsets (connection, topic);',
        'list_groups (connection); group_offsets (connection, group);',
        'peek (connection, topic, optional partition, optional count <= 100, optional before offset) reads the latest messages without consuming them;',
        'message (connection, topic, partition, offset) fetches one full message.',
        'All reads are read-only; connections opened here are visible to the Kafka sidebar panel and share its idle cleanup.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['connect', 'list_connections', 'disconnect', 'list_topics', 'topic_offsets', 'list_groups', 'group_offsets', 'peek', 'message'], description: 'Operation to run.' },
          connection: { type: 'string', description: 'Connection id returned by connect or list_connections.' },
          brokers: { type: 'array', items: { type: 'string' }, description: 'Broker addresses host:port for action=connect.' },
          ssl: { type: 'boolean', description: 'Use TLS for action=connect.' },
          sasl: { type: 'object', description: 'SASL credentials for action=connect: {mechanism: plain|scram-sha-256|scram-sha-512, username, password}.' },
          topic: { type: 'string', description: 'Topic name.' },
          group: { type: 'string', description: 'Consumer group id for action=group_offsets.' },
          partition: { type: 'number', description: 'Partition id; omit in peek to cover every partition.' },
          offset: { type: 'string', description: 'Exact offset for action=message.' },
          count: { type: 'number', description: 'Messages per partition for peek (default 20, max 100).' },
          before: { type: 'string', description: 'Exclusive upper offset for peek; defaults to the partition end.' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
      isConcurrencySafe: () => true,
      async execute(args) {
        const action = args?.action
        if (action === 'connect') {
          const info = await createConnection({ brokers: args?.brokers, ssl: args?.ssl, sasl: args?.sasl })
          return { connection: info.id, clusterId: info.clusterId, brokers: info.brokers }
        }
        if (action === 'list_connections') {
          return { connections: [...connections.values()].map(one => ({ ...one.info, brokers: one.params.brokers })) }
        }
        const id = args?.connection
        if (typeof id !== 'string' || id === '') throw new HttpError(400, 'connection is required')
        const conn = getConn(id)
        if (action === 'disconnect') {
          await dropConnection(conn)
          return { ok: true }
        }
        if (action === 'list_topics') return listTopics(conn)
        if (action === 'topic_offsets') return topicOffsets(conn, String(args?.topic ?? ''))
        if (action === 'list_groups') return listGroups(conn)
        if (action === 'group_offsets') return groupOffsets(conn, String(args?.group ?? ''))
        if (action === 'peek') {
          const topic = String(args?.topic ?? '')
          const count = Math.min(Math.max(Number(args?.count) || 20, 1), 100)
          const admin = await ensureAdmin(conn)
          let offsets
          try {
            offsets = await admin.fetchTopicOffsets(topic)
          } catch (err) {
            throw new HttpError(502, `offsets unavailable for ${topic}: ${err instanceof Error ? err.message : String(err)}`)
          }
          const parts = args?.partition === undefined ? offsets : offsets.filter(one => one.partition === Number(args.partition))
          const results = await mapPool(parts, 4, async part => {
            const messages = await backfill(conn, {
              topic, partition: part.partition,
              before: String(args?.before ?? part.high), count, withValue: true,
            })
            return messages.messages.map(agentMessage)
          })
          return { topic, messages: results.flat() }
        }
        if (action === 'message') {
          const { message } = await fetchOneMessage(conn, { topic: args?.topic, partition: args?.partition, offset: args?.offset })
          return { message: agentMessage(message) }
        }
        throw new HttpError(400, `unknown action: ${String(action)}`)
      },
    }), 'kafka-tool: kafka_query tool')
  }

  // The tools service has no start-order guarantee against this row at cold
  // boot; ctx.inject defers registration until it is published and re-runs on
  // its reload, instead of a one-shot ctx.get that could silently skip us.
  ctx.inject(['tools'], () => registerTools())

  ctx.on('connection/request', async (req, res, next) => {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://dsh.internal')
    } catch {
      return next()
    }
    if (!url.pathname.startsWith(PREFIX)) return next()
    try {
      await route(req, res, url)
    } catch (err) {
      try {
        if (res.headersSent || res.writableEnded) {
          res.destroy?.()
          return undefined
        }
        if (err instanceof HttpError) {
          sendJson(res, err.status, { error: err.message })
        } else {
          report(err, 'request failed:')
          sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) })
        }
      } catch {
        try { res.destroy?.() } catch { /* response already unusable */ }
      }
    }
    return undefined
  })

  ctx.effect(() => {
    let stopped = false
    const timer = setInterval(() => { if (!stopped) sweep() }, SWEEP_INTERVAL_MS)
    return async () => {
      stopped = true
      clearInterval(timer)
      for (const sub of [...subscriptions.values()]) {
        try { await stopSubscription(sub) } catch (err) { report(err, 'unload stop failed:') }
      }
      for (const conn of [...connections.values()]) {
        try { await dropConnection(conn) } catch (err) { report(err, 'unload drop failed:') }
      }
    }
  }, 'kafka-tool: lifecycle')
}
