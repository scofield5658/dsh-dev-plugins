import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginateSelect } from '../index.js'

test('paginateSelect: mysql first page and offset page', () => {
  assert.equal(
    paginateSelect('SELECT * FROM t', 'mysql', 0, 500),
    'SELECT * FROM (SELECT * FROM t) AS dbb_q LIMIT 501',
  )
  assert.equal(
    paginateSelect('SELECT * FROM t', 'mysql', 1000, 500),
    'SELECT * FROM (SELECT * FROM t) AS dbb_q LIMIT 1000, 501',
  )
})

test('paginateSelect: oracle uses nested ROWNUM (11g compatible)', () => {
  assert.equal(
    paginateSelect('SELECT * FROM t', 'oracle', 0, 100),
    'SELECT * FROM (SELECT dbb_q.*, ROWNUM dbb_rn FROM (SELECT * FROM t) dbb_q WHERE ROWNUM <= 101) WHERE dbb_rn > 0',
  )
  assert.equal(
    paginateSelect('SELECT * FROM t', 'oracle', 200, 100),
    'SELECT * FROM (SELECT dbb_q.*, ROWNUM dbb_rn FROM (SELECT * FROM t) dbb_q WHERE ROWNUM <= 301) WHERE dbb_rn > 200',
  )
})

test('paginateSelect: works on WITH queries too', () => {
  assert.equal(
    paginateSelect('WITH x AS (SELECT 1) SELECT * FROM x', 'mysql', 0, 10),
    'SELECT * FROM (WITH x AS (SELECT 1) SELECT * FROM x) AS dbb_q LIMIT 11',
  )
  assert.equal(
    paginateSelect('WITH x AS (SELECT 1) SELECT * FROM x', 'oracle', 20, 10),
    'SELECT * FROM (SELECT dbb_q.*, ROWNUM dbb_rn FROM (WITH x AS (SELECT 1) SELECT * FROM x) dbb_q WHERE ROWNUM <= 31) WHERE dbb_rn > 20',
  )
})
