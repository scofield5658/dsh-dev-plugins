import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertReadOnlySql, hasMultipleStatements, statementKind } from '../index.js'

const RO = false
const RW = true

test('read-only gate allows plain reads', () => {
  for (const sql of [
    'SELECT 1',
    '  (SELECT 1)',
    '/* comment */ SELECT 1',
    '-- comment\nSELECT 1',
    '# mysql comment\nSELECT 1',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    "select 'delete from t'",           // keyword inside a string literal
    'SELECT "update" FROM t',           // quoted identifier
    'SELECT `drop` FROM t',             // backtick identifier
    'SHOW TABLES',
    'DESC t',
    'DESCRIBE t',
    'EXPLAIN SELECT 1',
    'SELECT 1;',                        // trailing semicolon, no second statement
    "SELECT ';'",                       // semicolon inside string
    'SELECT 1 /* ; */',
  ]) {
    assertReadOnlySql(sql, RO)
  }
})

test('read-only gate blocks writes, locks, file export, stacked statements', () => {
  for (const sql of [
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a = 1',
    'DELETE FROM t',
    'DROP TABLE t',
    'WITH x AS (SELECT 1) DELETE FROM t2',
    'WITH x AS (SELECT 1) UPDATE t2 SET a = 1',
    "SELECT * INTO OUTFILE '/tmp/x' FROM t",
    "SELECT * INTO DUMPFILE '/tmp/x' FROM t",
    'SELECT * FROM t FOR UPDATE',
    'SELECT * FROM t FOR SHARE',
    'SELECT * FROM t LOCK IN SHARE MODE',
    'SELECT 1; SELECT 2',
    "SELECT ';'; DELETE FROM t",
    'SELECT 1; -- trailing\n DELETE FROM t',
  ]) {
    assert.throws(() => assertReadOnlySql(sql, RO), (e) => e.code === 'readonly', sql)
  }
})

test('allowWrites lifts the keyword gate but still blocks stacked statements', () => {
  assertReadOnlySql('UPDATE t SET a = 1', RW)
  assertReadOnlySql('DELETE FROM t', RW)
  assert.throws(() => assertReadOnlySql('UPDATE t SET a = 1; SELECT 1', RW), (e) => e.code === 'readonly')
})

test('empty SQL is a bad request', () => {
  assert.throws(() => assertReadOnlySql('', RO), (e) => e.code === 'bad-request')
  assert.throws(() => assertReadOnlySql('   ', RO), (e) => e.code === 'bad-request')
  assert.throws(() => assertReadOnlySql(42, RO), (e) => e.code === 'bad-request')
})

test('statement kind distinguishes plans, catalogs, and queries', () => {
  assert.equal(statementKind('EXPLAIN SELECT 1'), 'plan')
  assert.equal(statementKind('/* c */ explain analyze select 1'), 'plan')
  assert.equal(statementKind('SHOW TABLES'), 'catalog')
  assert.equal(statementKind('DESC t'), 'catalog')
  assert.equal(statementKind('DESCRIBE t'), 'catalog')
  assert.equal(statementKind('SELECT 1'), 'query')
  assert.equal(statementKind('WITH x AS (SELECT 1) SELECT * FROM x'), 'query')
  assert.equal(statementKind('UPDATE t SET a = 1'), 'write')
})

test('hasMultipleStatements is quote/comment aware', () => {
  assert.equal(hasMultipleStatements('SELECT 1'), false)
  assert.equal(hasMultipleStatements('SELECT 1;'), false)
  assert.equal(hasMultipleStatements("SELECT ';'"), false)
  assert.equal(hasMultipleStatements('SELECT `a;b` FROM t'), false)
  assert.equal(hasMultipleStatements('SELECT 1 /* ; */'), false)
  assert.equal(hasMultipleStatements('# ; comment\nSELECT 1'), false)
  assert.equal(hasMultipleStatements('-- ; comment\nSELECT 1'), false)
  assert.equal(hasMultipleStatements('SELECT 1; SELECT 2'), true)
  assert.equal(hasMultipleStatements('SELECT 1;\n\n SELECT 2'), true)
})
