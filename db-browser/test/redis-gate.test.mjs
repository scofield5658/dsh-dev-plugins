import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DbCore, REDIS_READONLY, scanRedisKeys } from '../index.js'

const stubCtx = () => ({ get: () => undefined })

const coreWithRedis = (allowWrites = false) => new DbCore(stubCtx(), {
  allowWrites,
  connections: [{ id: 'r1', type: 'redis', hosts: [{ host: '127.0.0.1' }] }],
})

test('read-only allowlist contains no writes or admin commands', () => {
  for (const cmd of ['SET', 'DEL', 'FLUSHALL', 'FLUSHDB', 'CONFIG', 'DEBUG', 'EVAL', 'SCRIPT', 'CLIENT', 'CLUSTER', 'MEMORY', 'MSET', 'HSET', 'LPUSH', 'SADD', 'ZADD', 'XADD', 'EXPIRE', 'SHUTDOWN', 'SAVE', 'BGSAVE', 'FAILOVER', 'MIGRATE', 'RESTORE', 'SWAPDB', 'PERSIST', 'GETDEL', 'SETRANGE', 'APPEND']) {
    assert.ok(!REDIS_READONLY.has(cmd), `${cmd} must not be read-only`)
  }
  for (const cmd of ['GET', 'MGET', 'HGETALL', 'SCAN', 'KEYS', 'TTL', 'INFO', 'DBSIZE', 'XRANGE', 'ZRANGE']) {
    assert.ok(REDIS_READONLY.has(cmd), `${cmd} should stay readable`)
  }
})

test('redis command gate rejects writes before touching the network', async () => {
  const core = coreWithRedis()
  const start = Date.now()
  await assert.rejects(
    async () => core.redisAction('r1', 'command', { command: 'SET', args: ['k', 'v'] }),
    (e) => e.code === 'readonly',
  )
  assert.ok(Date.now() - start < 1000, 'gate must reject without connecting')
})

test('redis command gate validates input shape', async () => {
  const core = coreWithRedis(true) // allowWrites on: gate passes, but shape checks stay
  await assert.rejects(async () => core.redisAction('r1', 'command', { command: '' }), (e) => e.code === 'bad-request')
  await assert.rejects(
    async () => core.redisAction('r1', 'command', { command: 'GET', args: Array.from({ length: 65 }, (_, i) => String(i)) }),
    (e) => e.code === 'bad-request',
  )
})

test('redis actions require a redis connection', async () => {
  const core = new DbCore(stubCtx(), {
    connections: [{ id: 'm', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] }],
  })
  await assert.rejects(async () => core.redisAction('m', 'dbsize'), (e) => e.code === 'bad-request' && /not redis/.test(e.message))
  await assert.rejects(async () => core.redisAction('nope', 'dbsize'), (e) => e.code === 'unknown-connection')
})

test('sql actions reject redis connections and vice versa', async () => {
  const core = coreWithRedis()
  await assert.rejects(core.sqlAction('r1', 'query', { sql: 'SELECT 1' }), (e) => e.code === 'bad-request' && /not a SQL/.test(e.message))
})

function nodeWithKeys(host, port, keys) {
  const calls = []
  return {
    calls,
    options: { host, port },
    async call(command, cursor, ...args) {
      calls.push({ command, cursor, args })
      return ['0', keys]
    },
  }
}

test('cluster key lookup scans every master in one large page', async () => {
  const empty = nodeWithKeys('10.0.0.1', 6379, [])
  const holding = nodeWithKeys('10.0.0.2', 6379, ['alpha', 'beta'])
  const client = {
    nodes(role) {
      return role === 'master' ? [empty, holding] : [empty, holding]
    },
  }
  const result = await scanRedisKeys(client, { mode: 'cluster', pattern: 'prefix*', limit: 1000 })
  assert.deepEqual(result.keys, ['alpha', 'beta'])
  assert.equal(result.truncated, false)
  assert.deepEqual(empty.calls, [{ command: 'SCAN', cursor: '0', args: ['MATCH', 'prefix*', 'COUNT', '1000'] }])
  assert.deepEqual(holding.calls, [{ command: 'SCAN', cursor: '0', args: ['MATCH', 'prefix*', 'COUNT', '1000'] }])
})

test('cluster key lookup falls back to a node that is not listed as master', async () => {
  const master = nodeWithKeys('10.0.0.1', 6379, [])
  const replica = nodeWithKeys('10.0.0.3', 6379, ['cached:1'])
  const client = {
    nodes(role) {
      return role === 'master' ? [master] : [master, replica]
    },
  }
  const result = await scanRedisKeys(client, { mode: 'cluster', pattern: 'cached:*', limit: 100 })
  assert.deepEqual(result.keys, ['cached:1'])
  assert.equal(replica.calls.length, 1)
  assert.equal(replica.calls[0].command, 'SCAN')
})

test('key lookup keeps only the requested limit', async () => {
  const node = nodeWithKeys('10.0.0.1', 6379, ['b', 'a', 'c'])
  const result = await scanRedisKeys({ nodes: () => [node] }, { mode: 'cluster', pattern: 'prefix*', limit: 2 })
  assert.deepEqual(result.keys, ['a', 'b'])
  assert.equal(result.truncated, true)
})

test('a blank key pattern is rejected before any scan', async () => {
  const core = coreWithRedis()
  assert.throws(
    () => core.redisKeys(core.get('r1'), '   ', 10),
    (e) => e.code === 'bad-request' && /pattern is required/.test(e.message),
  )
})
