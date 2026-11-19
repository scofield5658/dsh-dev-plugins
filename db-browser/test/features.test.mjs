import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DbCore, resolveFeatures, DEFAULT_FEATURES } from '../index.js'

const stubCtx = () => ({ get: () => undefined })

test('resolveFeatures: vendor defaults reflect the database capabilities', () => {
  // MySQL itself supports stored procedures; TDSQL and GoldenDB do not.
  assert.equal(resolveFeatures('mysql', {}).procedures, true)
  assert.equal(resolveFeatures('tdsql-mysql', {}).procedures, false)
  assert.equal(resolveFeatures('goldendb', {}).procedures, false)
  assert.equal(resolveFeatures('postgres', {}).procedures, true)
  assert.equal(resolveFeatures('tdsql-pg', {}).procedures, false)
  assert.equal(resolveFeatures('oracle', {}).procedures, true)
  // show_create only exists in the MySQL family.
  assert.equal(resolveFeatures('mysql', {}).showCreate, true)
  assert.equal(resolveFeatures('goldendb', {}).showCreate, true)
  assert.equal(resolveFeatures('postgres', {}).showCreate, false)
  assert.equal(resolveFeatures('oracle', {}).showCreate, false)
})

test('resolveFeatures: config overrides win, unknown keys are ignored', () => {
  const merged = resolveFeatures('goldendb', { goldendb: { procedures: true, nope: true } })
  assert.equal(merged.procedures, true)
  assert.equal(merged.showCreate, true)
  assert.ok(!('nope' in merged))
  // An override for one type never leaks into another.
  assert.equal(resolveFeatures('tdsql-mysql', { goldendb: { procedures: true } }).procedures, false)
})

test('DbCore.list() attaches family and features to every connection', () => {
  const core = new DbCore(stubCtx(), {
    features: { goldendb: { procedures: true } },
    connections: [
      { id: 'm', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] },
      { id: 'g', type: 'goldendb', user: 'u', hosts: [{ host: 'h' }] },
      { id: 'p', type: 'tdsql-pg', user: 'u', hosts: [{ host: 'h' }] },
      { id: 'o', type: 'oracle', user: 'u', hosts: [{ host: 'h' }], serviceName: 'X' },
    ],
  })
  const byId = Object.fromEntries(core.list().map((c) => [c.id, c]))
  assert.equal(byId.m.family, 'mysql')
  assert.equal(byId.m.features.procedures, true)
  assert.equal(byId.g.family, 'mysql')
  assert.equal(byId.g.features.procedures, true) // config override applied
  assert.equal(byId.p.family, 'postgres')
  assert.equal(byId.p.features.procedures, false)
  assert.equal(byId.o.family, 'oracle')
  assert.equal(byId.o.features.showCreate, false)
})

test('routines actions are gated by the feature matrix before any connection use', async () => {
  const core = new DbCore(stubCtx(), {
    connections: [
      { id: 'g', type: 'goldendb', user: 'u', hosts: [{ host: 'h' }] },
      { id: 'm', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] },
    ],
  })
  // GoldenDB: rejected by the matrix even though the connection is stopped.
  await assert.rejects(
    () => core.sqlAction('g', 'list_routines', { database: 'x' }),
    (e) => e.code === 'unsupported' && /goldendb/.test(e.message),
  )
  // MySQL: passes the gate and then fails on the stopped connection instead.
  await assert.rejects(
    () => core.sqlAction('m', 'list_routines', { database: 'x' }),
    (e) => e.code === 'not-connected',
  )
})

test('call_routine additionally requires allowWrites', async () => {
  const core = new DbCore(stubCtx(), {
    allowWrites: false,
    connections: [{ id: 'o', type: 'oracle', user: 'u', hosts: [{ host: 'h' }], serviceName: 'X' }],
  })
  await assert.rejects(
    () => core.sqlAction('o', 'call_routine', { database: 'S', object: 'P' }),
    (e) => e.code === 'readonly',
  )
})

test('every default-features key is a known vendor type', () => {
  for (const key of Object.keys(DEFAULT_FEATURES)) {
    assert.ok(['mysql', 'tdsql-mysql', 'goldendb', 'postgres', 'tdsql-pg', 'oracle'].includes(key))
  }
})
