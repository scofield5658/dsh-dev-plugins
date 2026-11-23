import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DbCore, scanRedisKeys } from '../index.js'
test('concurrent saves merge current configuration in the plugin directory', async () => {
 const dir = await mkdtemp(path.join(tmpdir(), 'db-browser-'))
 try {
  const file = path.join(dir, 'connections.json')
  const core = new DbCore({ get() {} }, {}, { connectionsFile: file })
  await Promise.all(['a', 'b'].map(id => core.saveConnection({ id, type: 'redis', hosts: [{ host: 'localhost' }] })))
  const saved = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(saved.connections.map(c => c.id).sort(), ['a', 'b'])
  assert.deepEqual(core.list().map(c => c.id).sort(), ['a', 'b'])
 } finally {
  await rm(dir, { recursive: true, force: true })
 }
})
test('DbCore loads connections from the plugin file', async () => {
 const dir = await mkdtemp(path.join(tmpdir(), 'db-browser-load-'))
 try {
  const file = path.join(dir, 'connections.json')
  await writeFile(file, JSON.stringify({ connections: [
   { id: 'file-mysql', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] },
  ] }))
  const core = new DbCore({ get() {} }, {}, { connectionsFile: file })
  assert.deepEqual(core.list().map(c => c.id), ['file-mysql'])
 } finally {
  await rm(dir, { recursive: true, force: true })
 }
})

test('list preview is capped and continues', async () => {
 const core = new DbCore({ get() {} }, {})
 const values = Array.from({ length: 2100 }, (_, i) => String(i))
 core.runOn = (_, fn) => fn({ client: () => ({ type: async () => 'list', ttl: async () => -1, pttl: async () => -1, llen: async () => values.length, lrange: async (_, a, b) => values.slice(a, b < 0 ? undefined : b + 1) }) })
 const first = await core.redisGet({}, 'key', { limit: 9000 })
 assert.equal(first.value.length, 1000)
 const second = await core.redisGet({}, 'key', { cursor: first.nextCursor })
 assert.equal(second.value[0], '1000')
})
test('scan overflow is available on next page', async () => {
 const client = { call: async () => ['0', Array.from({ length: 1200 }, (_, i) => `k${i}`)] }
 const first = await scanRedisKeys(client, { pattern: '*', limit: 1000 })
 assert.equal(first.keys.length, 1000)
 const second = await scanRedisKeys(client, { pattern: '*', limit: 1000, cursor: first.nextCursor })
 assert.equal(second.keys.length, 200)
 assert.equal(second.truncated, false)
})
test('sparse scan remains resumable after work budget is exhausted', async () => {
 let calls = 0
 const client = { call: async () => [String(++calls), []] }
 const page = await scanRedisKeys(client, { pattern: 'rare*', limit: 1000 })
 assert.equal(calls, 40)
 assert.equal(page.truncated, true)
 assert.ok(page.nextCursor)
})
test('hash scan preserves compact-encoding overflow', async () => {
 const core = new DbCore({ get() {} }, {})
 const flat = Array.from({ length: 1200 }, (_, i) => [`f${i}`, `v${i}`]).flat()
 let scans = 0
 core.runOn = (_, fn) => fn({ client: () => ({ type: async () => 'hash', ttl: async () => -1, pttl: async () => -1, hlen: async () => 1200, call: async () => { scans++; return ['0', flat] } }) })
 const first = await core.redisGet({}, 'key')
 const second = await core.redisGet({}, 'key', { cursor: first.nextCursor })
 assert.equal(Object.keys(first.value).length, 1000)
 assert.equal(Object.keys(second.value).length, 200)
 assert.equal(second.value.f1199, 'v1199')
 assert.equal(second.nextCursor, null)
 assert.equal(scans, 1)
})

test('reordering rewrites the stored order and rejects a partial or unknown list', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'db-browser-order-'))
  try {
    const file = path.join(dir, 'connections.json')
    const seed = ['a', 'b', 'c'].map((id) => ({ id, type: 'redis', hosts: [{ host: 'h' }] }))
    await writeFile(file, JSON.stringify({ connections: seed }))
    const core = new DbCore({ get() {} }, {}, { connectionsFile: file })
    const order = () => core.list().map((c) => c.id)
    assert.deepEqual(order(), ['a', 'b', 'c'])

    await core.reorderConnections(['c', 'a', 'b'])
    assert.deepEqual(order(), ['c', 'a', 'b'])
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).connections.map((c) => c.id), ['c', 'a', 'b'])
    // A fresh load sees the persisted order, which is what the panel renders after a restart.
    assert.deepEqual(new DbCore({ get() {} }, {}, { connectionsFile: file }).list().map((c) => c.id), ['c', 'a', 'b'])

    for (const bad of [['a', 'b'], ['a', 'a', 'b'], ['a', 'b', 'zz']]) {
      await assert.rejects(() => core.reorderConnections(bad), (e) => e.code === 'bad-request', `rejects ${bad.join(',')}`)
    }
    assert.deepEqual(order(), ['c', 'a', 'b'], 'a rejected reorder leaves the order untouched')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a reorder queued behind a save or delete is validated against the list it will rewrite', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'db-browser-order-race-'))
  try {
    const file = path.join(dir, 'connections.json')
    const seed = ['a', 'b', 'c'].map((id) => ({ id, type: 'redis', hosts: [{ host: 'h' }] }))
    const stored = async () => JSON.parse(await readFile(file, 'utf8')).connections.map((c) => c.id)

    await writeFile(file, JSON.stringify({ connections: seed }))
    let core = new DbCore({ get() {} }, {}, { connectionsFile: file })
    const saved = core.saveConnection({ id: 'd', type: 'redis', hosts: [{ host: 'h' }] })
    await assert.rejects(() => core.reorderConnections(['c', 'b', 'a']), (e) => e.code === 'bad-request')
    await saved
    assert.deepEqual(await stored(), ['a', 'b', 'c', 'd'], 'the saved connection survives')

    await writeFile(file, JSON.stringify({ connections: seed }))
    core = new DbCore({ get() {} }, {}, { connectionsFile: file })
    const deleted = core.deleteConnection('b')
    await assert.rejects(() => core.reorderConnections(['c', 'b', 'a']), (e) => e.code === 'bad-request')
    await deleted
    assert.deepEqual(await stored(), ['a', 'c'], 'no null entry is written')
    assert.deepEqual(new DbCore({ get() {} }, {}, { connectionsFile: file }).list().map((c) => c.id), ['a', 'c'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
