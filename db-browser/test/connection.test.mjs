import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DbCore, normalizeConnection, normalizeRow, quoted, ident, backtick } from '../index.js'

const stubCtx = () => ({ get: () => undefined })

test('normalizeConnection: mysql defaults and failover hosts', () => {
  const c = normalizeConnection({
    id: 'biz', type: 'mysql', user: 'root',
    hosts: [{ host: ' 10.0.0.1 ' }, { host: '10.0.0.2', port: 3307 }, { host: '' }, { host: '10.0.0.3', port: 99999 }],
  })
  assert.equal(c.label, 'biz') // label falls back to id
  assert.deepEqual(c.hosts, [
    { host: '10.0.0.1', port: 3306 },
    { host: '10.0.0.2', port: 3307 },
    { host: '10.0.0.3', port: 3306 }, // out-of-range port falls back
  ])
  assert.equal(c.database, undefined)
})

test('normalizeConnection: oracle needs serviceName or connectString', () => {
  assert.throws(
    () => normalizeConnection({ id: 'o1', type: 'oracle', user: 'scott', hosts: [{ host: 'h' }] }),
    (e) => e.code === 'bad-request',
  )
  const withService = normalizeConnection({ id: 'o1', type: 'oracle', user: 'u', hosts: [{ host: 'h' }], serviceName: 'ORCL' })
  assert.equal(withService.serviceName, 'ORCL')
  const both = normalizeConnection({ id: 'o1', type: 'oracle', user: 'u', hosts: [{ host: 'h' }], serviceName: 'ORCL', connectString: ' full/descriptor ' })
  assert.equal(both.connectString, 'full/descriptor')
})

test('normalizeConnection: vendor types within the mysql and postgres families', () => {
  for (const type of ['tdsql-mysql', 'goldendb']) {
    const c = normalizeConnection({ id: 'x1', type, user: 'u', hosts: [{ host: 'h' }], database: 'biz' })
    assert.equal(c.hosts[0].port, 3306, `${type} keeps the mysql-family default port`)
    assert.equal(c.database, 'biz')
  }
  for (const type of ['postgres', 'tdsql-pg']) {
    const c = normalizeConnection({ id: 'x2', type, user: 'u', hosts: [{ host: 'h' }] })
    assert.equal(c.hosts[0].port, 5432, `${type} uses the postgres default port`)
    assert.equal(c.database, undefined) // driver falls back to "postgres"
  }
  const pg = normalizeConnection({ id: 'x3', type: 'postgres', user: 'u', hosts: [{ host: 'h' }], database: 'app' })
  assert.equal(pg.database, 'app')
  // Oracle fields stay oracle-only; postgres connections must not require them.
  assert.throws(
    () => normalizeConnection({ id: 'x4', type: 'postgres', hosts: [{ host: 'h' }] }),
    (e) => e.code === 'bad-request', // still requires user
  )
})

test('normalizeConnection: redis modes', () => {
  const single = normalizeConnection({ id: 'r1', type: 'redis', hosts: [{ host: 'h' }] })
  assert.equal(single.mode, 'standalone')
  assert.equal(single.hosts[0].port, 6379)

  const sentinel = normalizeConnection({ id: 'r2', type: 'redis', mode: 'sentinel', masterName: 'mymaster', hosts: [{ host: 's' }] })
  assert.equal(sentinel.hosts[0].port, 26379)
  assert.equal(sentinel.masterName, 'mymaster')

  assert.throws(
    () => normalizeConnection({ id: 'r3', type: 'redis', mode: 'sentinel', hosts: [{ host: 's' }] }),
    (e) => e.code === 'bad-request' && /masterName/.test(e.message),
  )

  const cluster = normalizeConnection({ id: 'r4', type: 'redis', mode: 'cluster', hosts: [{ host: 'a' }, { host: 'b', port: 7001 }] })
  assert.equal(cluster.hosts.length, 2)
})

test('normalizeConnection: rejects bad ids, types, and missing hosts/user', () => {
  for (const bad of [
    { id: '', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] },
    { id: 'has space', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] },
    { id: 'x'.repeat(65), type: 'mysql', user: 'u', hosts: [{ host: 'h' }] },
    { id: 'ok', type: 'postgres', hosts: [{ host: 'h' }] },
    { id: 'x', type: 'mysql', user: 'u', hosts: [] },
    { id: 'x', type: 'mysql', hosts: [{ host: 'h' }] }, // missing user
    null,
    'string',
  ]) {
    assert.throws(() => normalizeConnection(bad), (e) => e.code === 'bad-request')
  }
})

test('quoting helpers escape their own delimiter', () => {
  assert.equal(quoted("o'clock"), "o''clock")
  assert.equal(ident('a"b'), 'a""b')
  assert.equal(backtick('a`b'), 'a``b')
})

test('normalizeRow handles bigint/buffer/date/object/null', () => {
  const row = [1n, Buffer.from('ab'), new Date('2020-01-01T00:00:00Z'), null, { a: 1 }, 'x', 3.5, true]
  assert.deepEqual(normalizeRow(row), ['1', 'ab', '2020-01-01T00:00:00.000Z', null, { a: 1 }, 'x', 3.5, true])
})

test('DbCore: config parsing, sanitize leaks nothing, defaults', () => {
  const core = new DbCore(stubCtx(), {
    connections: [
      { id: 'm', type: 'mysql', user: 'u', password: 'SHOULD-NOT-ROUNDTRIP', hosts: [{ host: 'h' }] },
    ],
  })
  assert.equal(core.allowWrites, false)
  assert.equal(core.maxRows, 500)
  assert.equal(core.queryTimeoutMs, 30000)
  const list = core.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'm')
  assert.ok(!('password' in list[0]), 'sanitized connection must not carry password')
  assert.throws(() => core.get('nope'), (e) => e.code === 'unknown-connection' && /m/.test(e.message))
})

test('DbCore: an invalid connection fails construction', () => {
  assert.throws(
    () => new DbCore(stubCtx(), { connections: [{ id: 'bad', type: 'nope' }] }),
    (e) => e.code === 'bad-request',
  )
})

test('a connection can override pool size and write permission', async () => {
  const core = new DbCore(stubCtx(), {
    allowWrites: false,
    poolMax: 4,
    connections: [
      { id: 'm', type: 'mysql', user: 'u', hosts: [{ host: 'h' }], poolMax: '8', allowWrites: true },
      { id: 'r', type: 'redis', hosts: [{ host: 'h' }] },
    ],
  })
  assert.equal(core.get('m').poolMax, 8)
  assert.equal(core.poolLimit(core.get('m')), 8)
  assert.equal(core.writesAllowed(core.get('m')), true)
  assert.equal(core.get('r').poolMax, undefined)
  assert.equal(core.poolLimit(core.get('r')), 4)
  assert.equal(core.writesAllowed(core.get('r')), false)
  assert.equal(core.list().find((c) => c.id === 'm').allowWrites, true)
  await assert.rejects(
    () => core.sqlAction('m', 'query', { sql: 'DELETE FROM t' }),
    (e) => e.code === 'not-connected',
  )
  await assert.rejects(
    () => core.sqlAction('r', 'query', { sql: 'DELETE FROM t' }),
    (e) => e.code === 'bad-request',
  )
  const inherited = new DbCore(stubCtx(), {
    allowWrites: false,
    connections: [{ id: 'm', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] }],
  })
  await assert.rejects(
    () => inherited.sqlAction('m', 'query', { sql: 'DELETE FROM t' }),
    (e) => e.code === 'readonly',
  )
})

test('DbCore: caps are clamped', () => {
  const core = new DbCore(stubCtx(), { maxRows: 999999, queryTimeoutMs: -5 })
  assert.equal(core.maxRows, 1000)
  assert.equal(core.queryTimeoutMs, 30000)
})

test('DbCore: oracle connect string building', () => {
  const core = new DbCore(stubCtx(), {})
  const fromHosts = core.oracleConnectString({ hosts: [{ host: 'a', port: 1521 }, { host: 'b', port: 1522 }], serviceName: 'ORCL' })
  assert.equal(fromHosts, 'a:1521,b:1522/ORCL')
  const explicit = core.oracleConnectString({ hosts: [{ host: 'a', port: 1521 }], serviceName: 'ORCL', connectString: 'full' })
  assert.equal(explicit, 'full')
  const bySid = core.oracleConnectString({ hosts: [{ host: 'a', port: 1521 }, { host: 'b', port: 1522 }], sid: 'ORCL' })
  assert.equal(bySid, '(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=a)(PORT=1521))(ADDRESS=(PROTOCOL=TCP)(HOST=b)(PORT=1522)))(CONNECT_DATA=(SID=ORCL)))')
})

test('passwords are grant records under a legal credential key', async () => {
  const records = new Map()
  const credentials = {
    async readRecord(key) { return records.get(key) },
    async modifyRecord(key, mutate) {
      const next = await mutate(records.get(key))
      records.set(key, next)
      return next
    },
    async deleteRecord(key) { records.delete(key) },
  }
  const core = new DbCore({ get: (name) => (name === 'credentials' ? credentials : undefined) }, {})
  const segment = /^[a-z][a-z0-9-]*$/

  await core.savePassword('titans_goldendb_dev', 's3cret')
  await core.savePassword('a-b', 'hyphen')
  await core.savePassword('a_b', 'underscore')
  await core.savePassword('goats', 'plain')

  const keyFor = (id) => `db-browser/c${Buffer.from(id, 'utf8').toString('hex')}`
  assert.equal(records.size, 4)
  for (const id of ['titans_goldendb_dev', 'a-b', 'a_b', 'goats']) {
    const key = keyFor(id)
    const record = records.get(key)
    assert.ok(record, `missing record for ${id}`)
    assert.match(key.split('/')[1], segment)
    assert.equal(record.kind, 'grant')
    assert.deepEqual(Object.keys(record), ['kind', 'payload'])
  }
  assert.notEqual(keyFor('a-b'), keyFor('a_b'))
  assert.equal(await core.passwordOf('titans_goldendb_dev'), 's3cret')
  assert.equal(await core.passwordOf('a_b'), 'underscore')
  assert.equal(await core.passwordOf('goats'), 'plain')

  await core.savePassword('titans_goldendb_dev', '')
  assert.equal(records.has(keyFor('titans_goldendb_dev')), false)
  assert.equal(await core.passwordOf('titans_goldendb_dev'), undefined)
  assert.equal(await core.passwordOf('goats'), 'plain')
})

test('normalizeConnection: oracle accepts sid as an alternative to serviceName', () => {
  const bySid = normalizeConnection({ id: 'o2', type: 'oracle', user: 'u', hosts: [{ host: 'h' }], sid: 'ORCL' })
  assert.equal(bySid.sid, 'ORCL')
  assert.equal(bySid.serviceName, undefined)
  const both = normalizeConnection({ id: 'o3', type: 'oracle', user: 'u', hosts: [{ host: 'h' }], serviceName: 'svc', sid: 'ORCL' })
  assert.equal(both.serviceName, 'svc')
  assert.equal(both.sid, 'ORCL')
})
