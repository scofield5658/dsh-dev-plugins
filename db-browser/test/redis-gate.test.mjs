import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DbCore, REDIS_READONLY } from '../index.js'

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
