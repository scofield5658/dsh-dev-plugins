import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DbCore, buildToolDefinitions } from '../index.js'

const stubCtx = () => ({ get: () => undefined })

const coreWith = () => new DbCore(stubCtx(), {
  connections: [
    { id: 'm', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] },
    { id: 'r', type: 'redis', hosts: [{ host: 'h' }] },
  ],
})

test('buildToolDefinitions exposes the two tools with MCP-compatible schemas', () => {
  const tools = buildToolDefinitions(coreWith())
  assert.deepEqual(tools.map((t) => t.name).sort(), ['db_browser', 'redis_browser'])
  for (const tool of tools) {
    assert.equal(tool.parameters.type, 'object')
    assert.ok(Array.isArray(tool.parameters.required))
    assert.equal(typeof tool.execute, 'function')
    assert.ok(tool.description.includes('connect'))
  }
  const db = tools.find((t) => t.name === 'db_browser')
  assert.ok(db.parameters.properties.action.enum.includes('connect'))
  assert.ok(db.parameters.properties.action.enum.includes('list_indexes'))
  assert.ok(db.parameters.properties.action.enum.includes('save_connection'))
  assert.equal(db.parameters.properties.poolMax.type, 'number')
  assert.equal(db.parameters.properties.allowWrites.type, 'boolean')
  for (const action of ['list_routines', 'show_routine', 'call_routine']) {
    assert.ok(db.parameters.properties.action.enum.includes(action), `db_browser exposes ${action}`)
  }
})

test('db_browser list_connections carries lifecycle status', async () => {
  const db = buildToolDefinitions(coreWith()).find((t) => t.name === 'db_browser')
  const r = await db.execute({ action: 'list_connections' })
  assert.deepEqual(r.connections.map((c) => [c.id, c.status]), [['m', 'stopped'], ['r', 'stopped']])
})

test('browsing a stopped connection fails with a clear not-connected error', async () => {
  const db = buildToolDefinitions(coreWith()).find((t) => t.name === 'db_browser')
  await assert.rejects(
    () => db.execute({ action: 'query', connection: 'm', sql: 'SELECT 1' }),
    (e) => e.code === 'not-connected' && /not started/.test(e.message),
  )
  const redis = buildToolDefinitions(coreWith()).find((t) => t.name === 'redis_browser')
  await assert.rejects(
    () => redis.execute({ action: 'dbsize', connection: 'r' }),
    (e) => e.code === 'not-connected',
  )
})

test('read-only gate still fires before the not-connected check', async () => {
  const db = buildToolDefinitions(coreWith()).find((t) => t.name === 'db_browser')
  await assert.rejects(
    () => db.execute({ action: 'query', connection: 'm', sql: 'DELETE FROM t' }),
    (e) => e.code === 'readonly',
  )
})
