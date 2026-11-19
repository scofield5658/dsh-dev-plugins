/**
 * Host half of the database browser bundle.
 *
 * One core serves two callers (see user-actions practice): the sidebar panel
 * reaches it through the `/db-browser/` HTTP routes, and the agent reaches it
 * through the `db_browser` / `redis_browser` tools. Passwords live in the
 * credential store as `db-browser/c<hex>` grant records. The hex is the
 * connection id: record keys only allow `[a-z0-9-]`, while connection ids
 * also allow `_`, `.`, and capitals. The connection list lives in this
 * row's own config and is edited through the config editor.
 */

const ROUTE_PREFIX = '/db-browser'
const CREDENTIAL_SCOPE = 'db-browser'
/** Record-key segment grammar used by dsh-credentials (`^[a-z][a-z0-9-]*$`). */
const CREDENTIAL_KEY_SEGMENT = /^[a-z][a-z0-9-]*$/

/**
 * Address of one connection's password. `c` plus lowercase hex is injective
 * for every accepted connection id and always a legal credential-key segment.
 */
function credentialRecordKey(id) {
  const segment = `c${Buffer.from(String(id), 'utf8').toString('hex')}`
  if (!CREDENTIAL_KEY_SEGMENT.test(segment)) fail('bad-request', 'connection id cannot be stored as a credential key')
  return `${CREDENTIAL_SCOPE}/${segment}`
}
/**
 * Connection types are vendor-specific (mysql vs tdsql-mysql vs goldendb …),
 * while drivers and SQL syntax follow the engine family. Features that differ
 * between vendors of one family (stored procedures are the known case: TDSQL
 * and GoldenDB do not support them) are gated by the feature matrix below.
 */
const FAMILY = {
  mysql: 'mysql',
  'tdsql-mysql': 'mysql',
  goldendb: 'mysql',
  postgres: 'postgres',
  'tdsql-pg': 'postgres',
  oracle: 'oracle',
  redis: 'redis',
}
const SQL_TYPES = new Set(['mysql', 'tdsql-mysql', 'goldendb', 'postgres', 'tdsql-pg', 'oracle'])
const ALL_TYPES = new Set([...SQL_TYPES, 'redis'])
const DEFAULT_PORT = { mysql: 3306, postgres: 5432, oracle: 1521, redis: 6379, sentinel: 26379 }

/**
 * Per-type capability defaults. Anything the database itself cannot do stays
 * off even when an operator forces it on in `features` (the underlying call
 * will still fail at the server); the flags only control what the panel and
 * the agent tools offer. Operator overrides live in the plugin config:
 *   features: { goldendb: { procedures: true } }
 */
const DEFAULT_FEATURES = {
  mysql: { showCreate: true, explain: true, procedures: true },
  'tdsql-mysql': { showCreate: true, explain: true, procedures: false },
  goldendb: { showCreate: true, explain: true, procedures: false },
  postgres: { showCreate: false, explain: true, procedures: true },
  'tdsql-pg': { showCreate: false, explain: true, procedures: false },
  oracle: { showCreate: false, explain: true, procedures: true },
}

/** Merge operator overrides over the defaults; unknown keys are ignored. */
export function resolveFeatures(type, overrides) {
  const base = DEFAULT_FEATURES[type] ?? {}
  const extra = overrides && typeof overrides === 'object' ? overrides[type] : null
  const out = { ...base }
  if (extra && typeof extra === 'object') {
    for (const key of ['showCreate', 'explain', 'procedures']) {
      if (typeof extra[key] === 'boolean') out[key] = extra[key]
    }
  }
  return out
}

/** First keyword gate for read-only SQL. */
const READONLY_HEAD = /^[\s(]*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)\s*)*(select|show|desc|describe|explain|with)\b/i

/**
 * Write/lock/file keywords rejected inside any statement while allowWrites is
 * off. Checked against the stripped text (strings, quoted identifiers and
 * comments removed), so `WITH ... DELETE`, `SELECT ... INTO OUTFILE` and
 * `SELECT ... FOR UPDATE` cannot slip through the first-keyword gate, while
 * string literals containing these words stay legal.
 */
const WRITE_PATTERN = /\b(?:insert|update|delete|replace|merge|truncate|drop|alter|create|grant|revoke|call|lock|unlock|rename|flush|reset|purge|kill|install|uninstall)\b|\binto\s+(?:out|dump)file\b|\bfor\s+(?:update|share)\b/i

/** Replace string literals, quoted identifiers and comments with spaces. */
function stripSqlLiterals(sql) {
  let out = ''
  let quote = null
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (quote) {
      if (ch === '\\' && quote !== '`') { out += '  '; i += 1; continue }
      if (ch === quote) quote = null
      out += ' '
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out += ' '; continue }
    if (ch === '-' && next === '-') { out += '  '; while (i < sql.length && sql[i] !== '\n') { out += ' '; i += 1 } continue }
    if (ch === '#') { out += ' '; while (i < sql.length && sql[i] !== '\n') { out += ' '; i += 1 } continue }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      const stop = end === -1 ? sql.length : end + 2
      while (i < stop) { out += ' '; i += 1 }
      i -= 1
      continue
    }
    out += ch
  }
  return out
}

/** Redis commands the agent/UI may run while `allowWrites` is off. */
const REDIS_READONLY = new Set([
  'GET', 'MGET', 'GETRANGE', 'STRLEN', 'EXISTS', 'TYPE', 'TTL', 'PTTL',
  'HGET', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HEXISTS', 'HMGET',
  'LRANGE', 'LLEN', 'LINDEX',
  'SMEMBERS', 'SISMEMBER', 'SMISMEMBER', 'SCARD', 'SRANDMEMBER',
  'ZRANGE', 'ZREVRANGE', 'ZRANGEBYSCORE', 'ZCARD', 'ZSCORE', 'ZRANK', 'ZREVRANK', 'ZCOUNT',
  'SCAN', 'SSCAN', 'HSCAN', 'ZSCAN', 'KEYS', 'RANDOMKEY', 'DBSIZE', 'INFO', 'PING', 'ECHO', 'TIME',
  'XLEN', 'XRANGE', 'XREVRANGE', 'XINFO', 'OBJECT', 'COMMAND', 'LOLWUT',
])

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import Schema from '@deepseek-ai/schemastery'

/** Cordis plugin name. Stable across host reloads. */
export const name = 'db-browser'

const HostConfig = Schema.object({
  host: Schema.string().required(),
  port: Schema.number().min(1).max(65535),
})

const ConnectionConfig = Schema.object({
  id: Schema.string().required(),
  type: Schema.union([...ALL_TYPES]).required(),
  label: Schema.string(),
  hosts: Schema.array(HostConfig).default([]),
  user: Schema.string(),
  database: Schema.string(),
  serviceName: Schema.string(),
  sid: Schema.string(),
  connectString: Schema.string(),
  mode: Schema.union(['standalone', 'sentinel', 'cluster']),
  masterName: Schema.string(),
  db: Schema.number().min(0),
  username: Schema.string(),
})

/** All flags optional: each one falls back to DEFAULT_FEATURES for its type. */
const FeatureOverride = Schema.object({
  showCreate: Schema.boolean(),
  explain: Schema.boolean(),
  procedures: Schema.boolean(),
})

/**
 * Validated by Cordis before apply. Defaults match the previous in-code fallbacks,
 * so an existing profile that omits a field keeps the same runtime values.
 */
export const Config = Schema.object({
  maxRows: Schema.number().min(1).max(10000).default(500),
  queryTimeoutMs: Schema.number().min(1).default(30000),
  allowWrites: Schema.boolean().default(false),
  poolMax: Schema.number().min(1).max(50).default(4),
  oracleClientLib: Schema.string(),
  features: Schema.object({
    mysql: FeatureOverride,
    'tdsql-mysql': FeatureOverride,
    goldendb: FeatureOverride,
    postgres: FeatureOverride,
    'tdsql-pg': FeatureOverride,
    oracle: FeatureOverride,
  }).default({}),
  connections: Schema.array(ConnectionConfig).default([]),
})

class DbBrowserError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const fail = (code, message) => {
  throw new DbBrowserError(code, message)
}

/** Scan past one semicolon: true when a real statement follows it. */
function hasMultipleStatements(sql) {
  // The stripped text keeps semicolons outside strings/comments in place.
  const stripped = stripSqlLiterals(sql)
  const first = stripped.indexOf(';')
  return first !== -1 && stripped.slice(first + 1).trim() !== ''
}

function assertReadOnlySql(sql, allowWrites) {
  if (typeof sql !== 'string' || sql.trim() === '') fail('bad-request', 'SQL must be a non-empty string')
  if (hasMultipleStatements(sql)) fail('readonly', 'Multiple statements are not allowed; run one statement at a time')
  if (!allowWrites) {
    if (!READONLY_HEAD.test(sql)) {
      fail('readonly', 'Only read-only statements (SELECT/SHOW/DESC/EXPLAIN/WITH) are allowed. Set allowWrites: true in the plugin configuration to enable writes.')
    }
    const stripped = stripSqlLiterals(sql)
    const write = WRITE_PATTERN.exec(stripped)
    if (write) {
      fail('readonly', `Statement contains a write/lock/file keyword ("${write[0]}"), rejected in read-only mode. Set allowWrites: true in the plugin configuration to enable writes.`)
    }
  }
}

function normalizeHosts(raw, fallbackPort) {
  const list = Array.isArray(raw) ? raw : []
  const hosts = []
  for (const item of list) {
    if (!item || typeof item.host !== 'string' || item.host.trim() === '') continue
    const port = Number.isInteger(item.port) && item.port > 0 && item.port <= 65535 ? item.port : fallbackPort
    hosts.push({ host: item.host.trim(), port })
  }
  return hosts
}

function normalizeConnection(raw) {
  if (!raw || typeof raw !== 'object') fail('bad-request', 'connection must be an object')
  const id = typeof raw.id === 'string' && /^[\w.-]{1,64}$/.test(raw.id) ? raw.id : null
  if (!id) fail('bad-request', 'connection.id must be 1-64 chars of [A-Za-z0-9_.-]')
  const type = ALL_TYPES.has(raw.type) ? raw.type : null
  if (!type) fail('bad-request', `connection.type must be one of ${[...ALL_TYPES].join('/')}`)
  const family = FAMILY[type]
  const out = {
    id,
    type,
    label: typeof raw.label === 'string' && raw.label.trim() !== '' ? raw.label.trim() : id,
  }
  if (family === 'redis') {
    const mode = ['standalone', 'sentinel', 'cluster'].includes(raw.mode) ? raw.mode : 'standalone'
    out.mode = mode
    out.hosts = normalizeHosts(raw.hosts, mode === 'sentinel' ? DEFAULT_PORT.sentinel : DEFAULT_PORT.redis)
    if (out.hosts.length === 0) fail('bad-request', 'redis connection needs at least one host')
    if (mode === 'sentinel') {
      if (typeof raw.masterName !== 'string' || raw.masterName.trim() === '') fail('bad-request', 'sentinel mode needs masterName')
      out.masterName = raw.masterName.trim()
    }
    if (Number.isInteger(raw.db) && raw.db >= 0) out.db = raw.db
    if (typeof raw.username === 'string' && raw.username !== '') out.username = raw.username
    return out
  }
  out.hosts = normalizeHosts(raw.hosts, DEFAULT_PORT[family])
  if (out.hosts.length === 0) fail('bad-request', 'connection needs at least one host')
  if (typeof raw.user !== 'string' || raw.user === '') fail('bad-request', 'connection.user is required')
  out.user = raw.user
  if (family === 'mysql' || family === 'postgres') {
    // postgres: the database to open (the driver default is "postgres" when omitted).
    if (typeof raw.database === 'string' && raw.database !== '') out.database = raw.database
  } else {
    // oracle: a full connectString (descriptor with its own ADDRESS_LIST
    // failover) wins; otherwise serviceName (Easy Connect Plus) or sid
    // (CONNECT_DATA descriptor) is required.
    if (typeof raw.connectString === 'string' && raw.connectString.trim() !== '') out.connectString = raw.connectString.trim()
    else {
      if (typeof raw.serviceName === 'string' && raw.serviceName.trim() !== '') out.serviceName = raw.serviceName.trim()
      if (typeof raw.sid === 'string' && raw.sid.trim() !== '') out.sid = raw.sid.trim()
      if (!out.serviceName && !out.sid) fail('bad-request', 'oracle connection needs serviceName, sid, or connectString')
    }
  }
  return out
}

/** Connection shape the panel and tools may see: no secret fields exist here by construction. */
function sanitize(c) {
  const { id, type, label } = c
  const base = { id, type, family: FAMILY[type], label, hosts: c.hosts }
  if (FAMILY[type] === 'mysql' || FAMILY[type] === 'postgres') return { ...base, user: c.user, database: c.database ?? null }
  if (type === 'oracle') return { ...base, user: c.user, serviceName: c.serviceName ?? null, sid: c.sid ?? null, connectString: c.connectString ?? null }
  return { ...base, mode: c.mode, db: c.db ?? 0, username: c.username ?? null, masterName: c.masterName ?? null }
}

/** One-shot Thick-mode initializer: initOracleClient may run once per process. */
const oracleThick = { tried: false, error: null }

function ensureOracleThick(oracledb, configuredLib) {
  if (!oracledb.thin) return // already Thick
  if (oracleThick.tried) {
    if (oracleThick.error) fail('driver-missing', oracleThick.error)
    return
  }
  oracleThick.tried = true
  const candidates = [configuredLib, `${homedir()}/lib/oracle-instantclient`]
    .filter((dir) => typeof dir === 'string' && dir !== '' && existsSync(dir))
  for (const dir of candidates) {
    try {
      oracledb.initOracleClient({ libDir: dir })
      oracleThick.error = null
      return
    } catch (error) {
      oracleThick.error = `Oracle Instant Client at ${dir} could not load: ${error?.message ?? error}`
    }
  }
  if (!oracleThick.error) {
    oracleThick.error = 'This database is too old for node-oracledb Thin mode (needs Oracle 12.1+). Install Oracle Instant Client (e.g. ~/lib/oracle-instantclient) or set oracleClientLib in the plugin config.'
  }
  fail('driver-missing', oracleThick.error)
}

/**
 * Wrap a bare SELECT/WITH so the server returns at most cap+1 rows starting at
 * offset. MySQL LIMIT works with an offset; Oracle needs the nested-ROWNUM
 * form (compatible with 11g, which this plugin supports via Thick mode).
 */
function paginateSelect(sql, dialect, offset, cap) {
  const fetchN = cap + 1
  if (dialect === 'mysql') {
    return offset > 0
      ? `SELECT * FROM (${sql}) AS dbb_q LIMIT ${offset}, ${fetchN}`
      : `SELECT * FROM (${sql}) AS dbb_q LIMIT ${fetchN}`
  }
  if (dialect === 'postgres') {
    return `SELECT * FROM (${sql}) AS dbb_q LIMIT ${fetchN} OFFSET ${offset}`
  }
  // Oracle identifiers must start with a letter — no leading underscore.
  return `SELECT * FROM (SELECT dbb_q.*, ROWNUM dbb_rn FROM (${sql}) dbb_q WHERE ROWNUM <= ${offset + fetchN}) WHERE dbb_rn > ${offset}`
}

const SELECT_HEAD = /^[\s(]*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)\s*)*(select|with)\b/i

/** How a user statement should be presented: paged rows, a plan, a catalog, or a write. */
export function statementKind(sql) {
  const word = String(sql).match(READONLY_HEAD)?.[1]?.toLowerCase()
  if (word === 'explain') return 'plan'
  if (word === 'show' || word === 'desc' || word === 'describe') return 'catalog'
  if (word === 'select' || word === 'with') return 'query'
  return 'write'
}

/** Fold per-column index rows into one entry per index. */
function groupIndexes(rows) {
  const byName = new Map()
  for (const row of rows) {
    let idx = byName.get(row.name)
    if (!idx) {
      idx = { name: row.name, unique: row.unique, type: row.type, columns: [], cardinality: row.cardinality ?? null, comment: row.comment ?? '' }
      byName.set(row.name, idx)
    }
    idx.columns.push(row.column)
  }
  return [...byName.values()]
}

class DbCore {
  constructor(ctx, config) {
    this.ctx = ctx
    this.closed = false
    this.oracleClientLib = typeof config?.oracleClientLib === 'string' && config.oracleClientLib !== '' ? config.oracleClientLib : undefined
    this.maxRows = Number.isInteger(config?.maxRows) && config.maxRows > 0 ? Math.min(config.maxRows, 10000) : 500
    this.queryTimeoutMs = Number.isInteger(config?.queryTimeoutMs) && config.queryTimeoutMs > 0 ? config.queryTimeoutMs : 30000
    this.allowWrites = config?.allowWrites === true
    this.poolMax = Number.isInteger(config?.poolMax) && config.poolMax >= 1 ? Math.min(config.poolMax, 50) : 4
    this.featureOverrides = config?.features && typeof config.features === 'object' ? config.features : {}
    this.connections = new Map()
    this.sessions = new Map()
    this.starting = new Map()
    for (const raw of Array.isArray(config?.connections) ? config.connections : []) {
      try {
        const c = normalizeConnection(raw)
        this.connections.set(c.id, c)
      } catch {
        // Schema rejects this document before apply. Skip here so a direct
        // DbCore constructed in a test cannot throw out of the constructor.
      }
    }
  }

  featuresOf(c) {
    return resolveFeatures(c.type, this.featureOverrides)
  }

  list() {
    return [...this.connections.values()].map((c) => ({ ...sanitize(c), features: this.featuresOf(c) }))
  }

  get(id) {
    const c = this.connections.get(id)
    if (!c) fail('unknown-connection', `No connection named "${id}". Known: ${[...this.connections.keys()].join(', ') || '(none)'}`)
    return c
  }

  async passwordOf(id) {
    const credentials = this.ctx.get('credentials')
    if (!credentials) return undefined
    try {
      const record = await credentials.readRecord(credentialRecordKey(id))
      const value = record?.payload?.password
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  async savePassword(id, password) {
    const credentials = this.ctx.get('credentials')
    if (!credentials) fail('no-credentials', 'The credential store is unavailable in this profile; the password was not saved')
    const key = credentialRecordKey(id)
    if (typeof password === 'string' && password !== '') {
      await credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { password } }))
    } else {
      await credentials.deleteRecord(key)
    }
  }

  async hasPassword(id) {
    return (await this.passwordOf(id)) !== undefined
  }

  /** Persist a connection row through the config editor. */
  async saveConnection(raw) {
    const next = normalizeConnection(raw)
    const entry = this.ctx.fiber?.entry
    const editor = this.ctx.get('configEditor')
    if (!entry || !editor) fail('no-config-editor', 'Configuration cannot be saved in this profile; edit the plugin config in cordis.patch.yml instead')
    const rows = [...this.connections.values()].filter((c) => c.id !== next.id).concat(next)
    await editor.edit(entry, (current) => ({ ...current, connections: rows }))
    // Editing an ordinary field restarts this plugin; the panel refetches.
    return { saved: next.id }
  }

  async deleteConnection(id) {
    const entry = this.ctx.fiber?.entry
    const editor = this.ctx.get('configEditor')
    if (!entry || !editor) fail('no-config-editor', 'Configuration cannot be saved in this profile')
    this.get(id)
    const rows = this.list().filter((c) => c.id !== id)
    await editor.edit(entry, (current) => ({ ...current, connections: rows }))
    return { deleted: id }
  }

  // ---------- persistent driver handles ----------

  statusOf(id) {
    return this.sessions.has(id) ? 'open' : 'stopped'
  }

  /**
   * Open one persistent MySQL connection pool (multi-host failover when the
   * pool is (re)created; individual dead connections are re-established by
   * mysql2 itself). The pool exposes the same query/execute API as a single
   * connection, so `client()` just returns it.
   */
  async openMysqlHandle(c, passwordOverride) {
    let mysql
    try {
      mysql = await import('mysql2/promise')
    } catch {
      fail('driver-missing', 'The mysql2 driver is not installed with the bundle')
    }
    const password = passwordOverride ?? await this.passwordOf(c.id)
    const core = this
    const create = async () => {
      let lastError
      for (const host of c.hosts) {
        const pool = mysql.createPool({
          host: host.host,
          port: host.port,
          user: c.user,
          password,
          database: c.database,
          connectTimeout: 8000,
          waitForConnections: true,
          connectionLimit: core.poolMax,
          queueLimit: 0,
          multipleStatements: false,
          dateStrings: true,
          supportBigNumbers: true,
          bigNumberStrings: true, // snowflake IDs exceed 2^53; keep them exact
        })
        try {
          // Probe once so a bad host/credential fails fast instead of on first use.
          await withTimeout(pool.query('SELECT 1'), 10000, () => pool.end().catch(() => {}))
          return pool
        } catch (error) {
          lastError = error
          try { await pool.end() } catch { /* half-open pool */ }
        }
      }
      fail('connect-failed', `${c.type} connect failed on ${c.hosts.map((h) => `${h.host}:${h.port}`).join(', ')}: ${lastError?.message ?? 'unknown error'}`)
    }
    let pool = await create()
    return {
      client: () => pool,
      async reopen() {
        if (core.closed) return
        try { await pool.end() } catch { /* already dead */ }
        if (core.closed) return
        pool = await create()
      },
      async close() {
        try { await pool.end() } catch { /* already dead */ }
      },
    }
  }

  /** Open one persistent PostgreSQL pool (covers TDSQL-PG; multi-host failover on (re)create). */
  async openPostgresHandle(c, passwordOverride) {
    let pg
    try {
      pg = (await import('pg')).default
    } catch {
      fail('driver-missing', 'The pg driver is not installed with the bundle')
    }
    // BIGINT comes back as a JS number by default and snowflake-style IDs
    // exceed 2^53; keep int8 exact by reading it as a string. Global to the
    // pg module, harmless to set on every pool.
    pg.types.setTypeParser(20, (value) => value)
    const password = passwordOverride ?? await this.passwordOf(c.id)
    const core = this
    const create = async () => {
      let lastError
      for (const host of c.hosts) {
        const pool = new pg.Pool({
          host: host.host,
          port: host.port,
          user: c.user,
          password,
          database: c.database ?? 'postgres',
          max: core.poolMax,
          connectionTimeoutMillis: 8000,
          idleTimeoutMillis: 60000,
          keepAlive: true,
        })
        // Idle pooled clients must not tear the panel down when a server drops them.
        pool.on('error', () => {})
        try {
          await withTimeout(pool.query('SELECT 1'), 10000, () => pool.end().catch(() => {}))
          return pool
        } catch (error) {
          lastError = error
          try { await pool.end() } catch { /* half-open pool */ }
        }
      }
      fail('connect-failed', `${c.type} connect failed on ${c.hosts.map((h) => `${h.host}:${h.port}`).join(', ')}: ${lastError?.message ?? 'unknown error'}`)
    }
    let pool = await create()
    return {
      client: () => pool,
      async reopen() {
        if (core.closed) return
        try { await pool.end() } catch { /* already dead */ }
        if (core.closed) return
        pool = await create()
      },
      async close() {
        try { await pool.end() } catch { /* already dead */ }
      },
    }
  }

  /**
   * Open one persistent Oracle pool (Thin first, Thick fallback for pre-12.1).
   * Connections are checked out per operation via `run(fn)` and returned to
   * the pool, so concurrent panel/agent work does not queue behind one socket.
   */
  async openOracleHandle(c, passwordOverride) {
    let oracledb
    try {
      oracledb = (await import('oracledb')).default
    } catch {
      fail('driver-missing', 'The oracledb driver is not installed with the bundle')
    }
    const password = passwordOverride ?? await this.passwordOf(c.id)
    const core = this
    const createPool = async () => {
      const attempt = oracledb.createPool({
        user: c.user,
        password,
        connectString: this.oracleConnectString(c),
        poolMin: 0,
        poolMax: core.poolMax,
        poolIncrement: 1,
        poolTimeout: 60,
        connectTimeout: 8,
      })
      try {
        return await withTimeout(attempt, 10000)
      } catch (error) {
        attempt.then((orphan) => orphan.close(0).catch(() => {})).catch(() => {})
        throw error
      }
    }
    const create = async () => {
      try {
        return await createPool()
      } catch (error) {
        // NJS-138: the server predates Thin mode (pre-12.1) — retry through
        // the Oracle Instant Client (Thick mode) when one is available.
        if (oracledb.thin && (error?.code === 'NJS-138' || /NJS-138/.test(String(error?.message ?? '')))) {
          ensureOracleThick(oracledb, this.oracleClientLib)
          return createPool()
        }
        fail('connect-failed', `Oracle connect failed (${this.oracleConnectString(c)}): ${error?.message ?? 'unknown error'}`)
      }
    }
    let pool = await create()
    return {
      driver: oracledb,
      async run(fn) {
        const conn = await pool.getConnection()
        try {
          return await fn(conn)
        } finally {
          try { await conn.close() } catch { /* return to pool best effort */ }
        }
      },
      async reopen() {
        if (core.closed) return
        try { await pool.close(0) } catch { /* already dead */ }
        if (core.closed) return
        pool = await create()
      },
      async close() {
        try { await pool.close(5) } catch { /* already dead */ }
      },
    }
  }

  /** Open one persistent Redis handle (standalone failover / sentinel / cluster). */
  async openRedisHandle(c, passwordOverride) {
    let Redis
    try {
      Redis = (await import('ioredis')).default
    } catch {
      fail('driver-missing', 'The ioredis driver is not installed with the bundle')
    }
    const password = passwordOverride ?? await this.passwordOf(c.id)
    const common = {
      password,
      username: c.username,
      connectTimeout: 8000,
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    }
    const connect = async () => {
      let client
      if (c.mode === 'cluster') {
        client = new Redis.Cluster(c.hosts, {
          redisOptions: common,
          clusterRetryStrategy: (times) => (times > 2 ? null : 500),
        })
      } else if (c.mode === 'sentinel') {
        client = new Redis({
          ...common,
          sentinels: c.hosts,
          name: c.masterName,
          db: c.db ?? 0,
          sentinelRetryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 2000)),
        })
      } else {
        // Standalone: try each configured host in order (failover).
        let lastError
        for (const host of c.hosts) {
          const candidate = new Redis({ ...common, host: host.host, port: host.port, db: c.db ?? 0, retryStrategy: () => null })
          try {
            await withTimeout(candidate.ping(), 8000, () => candidate.disconnect())
            return candidate
          } catch (error) {
            lastError = error
            candidate.disconnect()
          }
        }
        fail('connect-failed', `Redis standalone connect failed on ${c.hosts.map((x) => `${x.host}:${x.port}`).join(', ')}: ${lastError?.message ?? 'unknown error'}`)
      }
      try {
        await withTimeout(client.ping(), 10000, () => client.disconnect())
      } catch (error) {
        client.disconnect()
        fail('connect-failed', `Redis ${c.mode} connect failed: ${error?.message ?? 'unknown error'}`)
      }
      return client
    }
    let client = await connect()
    const core = this
    return {
      client: () => client,
      async reopen() {
        if (core.closed) return
        try { client.disconnect() } catch { /* already dead */ }
        if (core.closed) return
        client = await connect()
      },
      async close() {
        try { client.disconnect() } catch { /* already dead */ }
      },
    }
  }

  isConnectionLoss(error) {
    const text = `${error?.code ?? ''} ${error?.errorNum ?? ''} ${error?.message ?? ''}`
    // MySQL protocol codes, pg SQLSTATE class 08 / 57P01, Oracle DPI/NJS/ORA network codes.
    return /PROTOCOL_CONNECTION_LOST|PROTOCOL_ENQUEUE_AFTER_FATAL|ECONNRESET|EPIPE|ETIMEDOUT|57P01|08[0-9A-Z]{3}|connection terminated|DPI-1010|DPI-1080|NJS-50\d|ORA-0311[34]|ORA-03135|ORA-01012/i.test(text)
  }

  /** Run fn on the persistent handle of a started connection; one transparent reconnect. */
  async runOn(c, fn) {
    const s = this.sessions.get(c.id)
    if (!s) {
      fail('not-connected', `Connection "${c.id}" is not started. Open the Database panel and start it (power button), or ask the user to start it.`)
    }
    try {
      return await fn(s.handle)
    } catch (error) {
      if (error instanceof DbBrowserError) throw error
      // A stop during the in-flight call removed the session; never resurrect
      // a pool nobody tracks (it would leak until process exit).
      if (this.isConnectionLoss(error) && this.sessions.get(c.id) === s) {
        try {
          await s.handle.reopen()
        } catch {
          throw error // surface the original failure when reconnect fails
        }
        return await fn(s.handle)
      }
      throw error
    }
  }

  openHandle(c, passwordOverride) {
    const family = FAMILY[c.type]
    if (family === 'mysql') return this.openMysqlHandle(c, passwordOverride)
    if (family === 'postgres') return this.openPostgresHandle(c, passwordOverride)
    if (family === 'oracle') return this.openOracleHandle(c, passwordOverride)
    return this.openRedisHandle(c, passwordOverride)
  }

  async startConnection(id) {
    if (this.closed) fail('closed', 'The database browser plugin is unloading')
    const c = this.get(id)
    if (this.sessions.has(id)) return { id, status: 'open' }
    // Concurrent starts (panel click + agent tool) must share one pool build;
    // two openHandle calls would leak the loser under sessions.set.
    if (this.starting.has(id)) return this.starting.get(id)
    const pending = (async () => {
      const handle = await this.openHandle(c)
      if (this.closed) {
        try { await handle.close() } catch { /* unload won the race */ }
        fail('closed', 'The database browser plugin is unloading')
      }
      this.sessions.set(id, { status: 'open', handle, type: c.type })
      return { id, status: 'open' }
    })()
    this.starting.set(id, pending)
    try {
      return await pending
    } finally {
      this.starting.delete(id)
    }
  }

  async stopConnection(id) {
    this.get(id)
    // A stop racing an in-flight start waits for the start, then closes what
    // it built — otherwise the pool would open after the user asked to stop.
    const pending = this.starting.get(id)
    if (pending) {
      try { await pending } catch { /* start failed; nothing to close */ }
    }
    const s = this.sessions.get(id)
    if (s) {
      this.sessions.delete(id)
      try { await s.handle.close() } catch { /* best effort */ }
    }
    return { id, status: 'stopped' }
  }

  // ---------- MySQL ----------

  async mysqlQuery(c, sql, maxRows, offset = 0) {
    assertReadOnlySql(sql, this.allowWrites)
    const cap = Math.min(Math.max(1, maxRows ?? this.maxRows), 10000)
    const off = Math.max(0, Math.floor(offset) || 0)
    const kind = statementKind(sql)
    const pageable = kind === 'query'
    // Bare SELECT/WITH is wrapped so the server stops at cap+1 rows. EXPLAIN,
    // SHOW and DESC stay intact so their plan or catalog rows are not rewritten.
    const head = pageable && SELECT_HEAD.test(sql)
    const effective = head ? paginateSelect(sql, 'mysql', off, cap) : sql
    return this.runOn(c, async (h) => {
      const conn = h.client()
      const started = Date.now()
      const run = conn.query({ sql: effective, rowsAsArray: true })
      const [rows, fields] = await withTimeout(run, this.queryTimeoutMs, () => h.reopen().catch(() => {}))
      const tookMs = Date.now() - started
      const columns = Array.isArray(fields) ? fields.map((f) => f.name ?? String(f)) : []
      const meta = { tookMs, statementKind: kind, pageable }
      if (Array.isArray(rows)) {
        const source = pageable ? (head ? rows : rows.slice(off, off + cap + 1)) : rows.slice(0, cap + 1)
        const truncated = source.length > cap
        const shown = truncated ? source.slice(0, cap) : source
        return { columns, rows: shown.map(normalizeRow), rowCount: shown.length, truncated, offset: pageable ? off : 0, ...meta }
      }
      return { columns: [], rows: [], affectedRows: rows?.affectedRows ?? 0, truncated: false, offset: 0, ...meta, pageable: false, statementKind: kind === 'query' ? 'write' : kind }
    })
  }

  /** Internal fixed-SQL reads bypass the read-only gate (the SQL is ours). */
  mysqlQueryRows(c, sql) {
    return this.runOn(c, async (h) => {
      const conn = h.client()
      const [rows, fields] = await withTimeout(conn.query({ sql, rowsAsArray: true }), this.queryTimeoutMs, () => h.reopen().catch(() => {}))
      return { rows: Array.isArray(rows) ? rows : [], columns: Array.isArray(fields) ? fields.map((f) => f.name ?? String(f)) : [] }
    })
  }

  async mysqlDatabases(c) {
    const r = await this.mysqlQueryRows(c, 'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME LIMIT 2000')
    return r.rows.map((row) => row[0]).filter((name) => typeof name === 'string')
  }

  async mysqlTables(c, database) {
    const db = database ?? c.database
    if (!db) fail('bad-request', 'database is required for a MySQL connection without a default database')
    const r = await this.mysqlQueryRows(c,
      `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA='${quoted(db)}' ORDER BY TABLE_NAME LIMIT 5000`)
    return r.rows.map((row) => ({ name: row[0], kind: row[1] === 'VIEW' ? 'view' : 'table' }))
  }

  async mysqlColumns(c, database, table) {
    const db = database ?? c.database
    if (!db || !table) fail('bad-request', 'database and table are required')
    const r = await this.mysqlQueryRows(c,
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${quoted(db)}' AND TABLE_NAME='${quoted(table)}' ORDER BY ORDINAL_POSITION LIMIT 2000`)
    return r.rows.map((row) => ({ name: row[0], type: row[1], nullable: row[2] === 'YES', key: row[3] ?? '', default: row[4], extra: row[5] ?? '' }))
  }

  async mysqlIndexes(c, database, table) {
    const db = database ?? c.database
    if (!db || !table) fail('bad-request', 'database and table are required')
    const r = await this.mysqlQueryRows(c,
      `SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX, COLUMN_NAME, NULLABLE, CARDINALITY, INDEX_COMMENT FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${quoted(db)}' AND TABLE_NAME='${quoted(table)}' ORDER BY INDEX_NAME, SEQ_IN_INDEX LIMIT 2000`)
    return groupIndexes(r.rows.map((row) => ({
      name: row[0], unique: row[1] === 0 || row[1] === '0', type: row[2],
      column: row[4], nullable: row[5] === 'YES', cardinality: row[6] === null ? null : Number(row[6]), comment: row[7] ?? '',
    })))
  }

  async mysqlShowCreate(c, database, table) {
    const db = database ?? c.database
    if (!db || !table) fail('bad-request', 'database and table are required')
    const r = await this.mysqlQueryRows(c, `SHOW CREATE TABLE \`${backtick(db)}\`.\`${backtick(table)}\``)
    const row = r.rows[0] ?? []
    return { ddl: row[1] ?? '' }
  }

  mysqlPreview(c, database, table, maxRows, offset = 0) {
    const db = database ?? c.database
    if (!db || !table) fail('bad-request', 'database and table are required')
    const cap = Math.min(Math.max(1, maxRows ?? 100), 1000)
    const off = Math.max(0, Math.floor(offset) || 0)
    return this.mysqlQuery(c, `SELECT * FROM \`${backtick(db)}\`.\`${backtick(table)}\` LIMIT ${off}, ${cap + 1}`, cap)
  }

  // ---------- PostgreSQL (covers TDSQL-PG) ----------

  async pgQueryRows(c, text, values) {
    return this.runOn(c, async (h) => {
      const run = h.client().query({ text, values, rowMode: 'array' })
      const r = await withTimeout(run, this.queryTimeoutMs)
      return { rows: r.rows ?? [], columns: (r.fields ?? []).map((f) => f.name) }
    })
  }

  async pgQuery(c, sql, maxRows, offset = 0) {
    assertReadOnlySql(sql, this.allowWrites)
    const cap = Math.min(Math.max(1, maxRows ?? this.maxRows), 10000)
    const off = Math.max(0, Math.floor(offset) || 0)
    const kind = statementKind(sql)
    const pageable = kind === 'query'
    const effective = pageable && SELECT_HEAD.test(sql) ? paginateSelect(sql, 'postgres', off, cap) : sql
    return this.runOn(c, async (h) => {
      const started = Date.now()
      const run = h.client().query({ text: effective, rowMode: 'array' })
      const r = await withTimeout(run, this.queryTimeoutMs)
      const tookMs = Date.now() - started
      const columns = (r.fields ?? []).map((f) => f.name ?? '')
      const rows = Array.isArray(r.rows) ? r.rows : []
      const truncated = rows.length > cap
      return {
        columns,
        rows: rows.slice(0, cap).map(normalizeRow),
        rowCount: Math.min(rows.length, cap),
        truncated,
        offset: pageable ? off : 0,
        tookMs,
        statementKind: kind,
        pageable,
      }
    })
  }

  /**
   * Like Oracle, a PostgreSQL connection opens one database and browses its
   * schemas; the "databases" list for the tree is the schema list of the
   * connected database.
   */
  async pgSchemas(c) {
    const r = await this.pgQueryRows(c,
      `SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY nspname LIMIT 2000`)
    return r.rows.map((row) => row[0]).filter((name) => typeof name === 'string')
  }

  async pgTables(c, schema) {
    if (!schema) fail('bad-request', 'schema is required')
    const r = await this.pgQueryRows(c,
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='${quoted(schema)}' ORDER BY table_name LIMIT 5000`)
    return r.rows.map((row) => ({ name: row[0], kind: row[1] === 'VIEW' ? 'view' : 'table' }))
  }

  async pgColumns(c, schema, table) {
    if (!schema || !table) fail('bad-request', 'schema and table are required')
    const r = await this.pgQueryRows(c,
      `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
              CASE WHEN kcu.column_name IS NULL THEN '' ELSE 'PRI' END
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT kcu2.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu2
           ON kcu2.constraint_name = tc.constraint_name AND kcu2.table_schema = tc.table_schema AND kcu2.table_name = tc.table_name
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '${quoted(schema)}' AND tc.table_name = '${quoted(table)}'
       ) kcu ON kcu.column_name = c.column_name
       WHERE c.table_schema = '${quoted(schema)}' AND c.table_name = '${quoted(table)}'
       ORDER BY c.ordinal_position LIMIT 2000`)
    return r.rows.map((row) => ({ name: row[0], type: row[1], nullable: row[2] === 'YES', key: row[4] ?? '', default: row[3], extra: '' }))
  }

  async pgIndexes(c, schema, table) {
    if (!schema || !table) fail('bad-request', 'schema and table are required')
    // pg_index.indkey is an int2vector; split its text form so ordinality works on every version.
    const r = await this.pgQueryRows(c,
      `SELECT i.relname, ix.indisunique, am.amname, a.attname
       FROM pg_class t
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_index ix ON ix.indrelid = t.oid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_am am ON am.oid = i.relam
       CROSS JOIN LATERAL (
         SELECT s.val::int AS attnum, s.ord
         FROM regexp_split_to_table(ix.indkey::text, '\\s+') WITH ORDINALITY AS s(val, ord)
       ) k
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
       WHERE n.nspname = '${quoted(schema)}' AND t.relname = '${quoted(table)}'
       ORDER BY i.relname, k.ord LIMIT 2000`)
    return groupIndexes(r.rows.map((row) => ({
      name: row[0], unique: row[1] === true || row[1] === 't', type: row[2],
      column: row[3], nullable: null, cardinality: null, comment: '',
    })))
  }

  pgPreview(c, schema, table, maxRows, offset = 0) {
    if (!schema || !table) fail('bad-request', 'schema and table are required')
    const cap = Math.min(Math.max(1, maxRows ?? 100), 1000)
    return this.pgQuery(c, `SELECT * FROM "${ident(schema)}"."${ident(table)}"`, cap, offset)
  }

  // ---------- routines (stored procedures / functions) ----------

  /** Gate: the feature matrix decides whether this connection type exposes routines at all. */
  assertProcedures(c) {
    if (!this.featuresOf(c).procedures) {
      fail('unsupported', `Connection type ${c.type} does not support stored procedures; its page hides them. Set features.${c.type}.procedures: true in the plugin config to override.`)
    }
  }

  async mysqlRoutines(c, database) {
    const db = database ?? c.database
    if (!db) fail('bad-request', 'database is required for a MySQL connection without a default database')
    const r = await this.mysqlQueryRows(c,
      `SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='${quoted(db)}' ORDER BY ROUTINE_TYPE, ROUTINE_NAME LIMIT 2000`)
    return r.rows.map((row) => ({ name: row[0], kind: String(row[1]).toLowerCase(), detail: '' }))
  }

  async mysqlRoutineSource(c, database, name) {
    const db = database ?? c.database
    if (!db || !name) fail('bad-request', 'database and object are required')
    const r = await this.mysqlQueryRows(c,
      `SELECT ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='${quoted(db)}' AND ROUTINE_NAME='${quoted(name)}' LIMIT 1`)
    const kind = r.rows[0]?.[0]
    if (!kind) fail('not-found', `No routine named ${name} in ${db}`)
    const ddl = await this.mysqlQueryRows(c, `SHOW CREATE ${kind === 'FUNCTION' ? 'FUNCTION' : 'PROCEDURE'} \`${backtick(db)}\`.\`${backtick(name)}\``)
    return { ddl: ddl.rows[0]?.[2] ?? '' }
  }

  async mysqlCallRoutine(c, database, name, args) {
    const db = database ?? c.database
    if (!db || !name) fail('bad-request', 'database and object are required')
    if (!this.allowWrites) fail('readonly', 'Executing a routine can modify data. Set allowWrites: true in the plugin configuration to enable it.')
    const argv = Array.isArray(args) ? args.map(String) : []
    if (argv.length > 32) fail('bad-request', 'too many routine arguments')
    return this.runOn(c, async (h) => {
      const started = Date.now()
      const placeholders = argv.map(() => '?').join(', ')
      const run = h.client().query({ sql: `CALL \`${backtick(db)}\`.\`${backtick(name)}\`(${placeholders})`, values: argv, rowsAsArray: true })
      const [rows, fields] = await withTimeout(run, this.queryTimeoutMs)
      const tookMs = Date.now() - started
      // CALL returns one entry per result set plus an OkPacket; show the first set.
      const first = Array.isArray(rows?.[0]) && Array.isArray(rows[0][0]) ? rows[0] : rows
      const firstFields = Array.isArray(fields?.[0]) ? fields[0] : fields
      const columns = Array.isArray(firstFields) ? firstFields.map((f) => f.name ?? String(f)) : []
      const list = Array.isArray(first) ? first : []
      return { columns, rows: list.slice(0, this.maxRows).map(normalizeRow), rowCount: list.length, truncated: list.length > this.maxRows, tookMs, statementKind: 'write', pageable: false }
    })
  }

  async pgRoutines(c, schema) {
    if (!schema) fail('bad-request', 'schema is required')
    const r = await this.pgQueryRows(c,
      `SELECT p.proname, CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
              pg_get_function_identity_arguments(p.oid)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${quoted(schema)}' AND p.prokind IN ('p', 'f')
       ORDER BY p.proname LIMIT 2000`)
    return r.rows.map((row) => ({ name: row[0], kind: String(row[1]).toLowerCase(), detail: row[2] ?? '' }))
  }

  async pgRoutineSource(c, schema, name) {
    if (!schema || !name) fail('bad-request', 'schema and object are required')
    // Overloads share a name; return every definition, oldest first.
    const r = await this.pgQueryRows(c,
      `SELECT pg_get_functiondef(p.oid)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${quoted(schema)}' AND p.proname = '${quoted(name)}' AND p.prokind IN ('p', 'f')
       ORDER BY p.oid LIMIT 10`)
    if (r.rows.length === 0) fail('not-found', `No routine named ${name} in ${schema}`)
    return { ddl: r.rows.map((row) => row[0]).join('\n\n') }
  }

  async pgCallRoutine(c, schema, name, args) {
    if (!schema || !name) fail('bad-request', 'schema and object are required')
    if (!this.allowWrites) fail('readonly', 'Executing a routine can modify data. Set allowWrites: true in the plugin configuration to enable it.')
    const kind = await this.pgQueryRows(c,
      `SELECT p.prokind FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${quoted(schema)}' AND p.proname = '${quoted(name)}' AND p.prokind IN ('p', 'f') LIMIT 1`)
    if (kind.rows.length === 0) fail('not-found', `No routine named ${name} in ${schema}`)
    if (kind.rows[0][0] !== 'p') fail('bad-request', `${name} is a function; only procedures can be executed (use a SELECT in the query pane for functions)`)
    const argv = Array.isArray(args) ? args.map(String) : []
    if (argv.length > 32) fail('bad-request', 'too many routine arguments')
    const placeholders = argv.map((_, i) => `$${i + 1}`).join(', ')
    return this.runOn(c, async (h) => {
      const started = Date.now()
      const run = h.client().query({ text: `CALL "${ident(schema)}"."${ident(name)}"(${placeholders})`, values: argv, rowMode: 'array' })
      await withTimeout(run, this.queryTimeoutMs)
      return { columns: [], rows: [], rowCount: 0, truncated: false, tookMs: Date.now() - started, statementKind: 'write', pageable: false }
    })
  }

  // ---------- Oracle ----------

  oracleConnectString(c) {
    if (c.connectString) return c.connectString
    if (c.sid) {
      // SID has no Easy Connect form; build a descriptor with ADDRESS_LIST failover.
      const addresses = c.hosts.map((h) => `(ADDRESS=(PROTOCOL=TCP)(HOST=${h.host})(PORT=${h.port}))`).join('')
      return `(DESCRIPTION=(ADDRESS_LIST=${addresses})(CONNECT_DATA=(SID=${c.sid})))`
    }
    return `${c.hosts.map((h) => `${h.host}:${h.port}`).join(',')}/${c.serviceName}`
  }

  /** Internal fixed-SQL reads bypass the read-only gate (the SQL is ours). */
  async oracleExecute(c, sql, maxRows, binds = []) {
    const cap = Math.min(Math.max(1, maxRows ?? this.maxRows), 10000)
    return this.runOn(c, (h) => h.run(async (conn) => {
      const oracledb = h.driver
      const run = conn.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_ARRAY,
        maxRows: cap + 1,
        fetchArraySize: 200,
      })
      const started = Date.now()
      const r = await withTimeout(run, this.queryTimeoutMs)
      const tookMs = Date.now() - started
      let columns = (r.metaData ?? []).map((m) => m.name ?? '')
      let rows = Array.isArray(r.rows) ? r.rows : []
      // Hide our own pagination helper columns (ROWNUM aliases from the wrappers).
      const keep = columns.map((name, i) => (/^DBB_(RN|PRN)$/i.test(name) ? -1 : i)).filter((i) => i >= 0)
      if (keep.length !== columns.length) {
        columns = keep.map((i) => columns[i])
        rows = rows.map((row) => keep.map((i) => row[i]))
      }
      const truncated = rows.length > cap
      return {
        columns,
        rows: rows.slice(0, cap).map(normalizeRow),
        rowCount: Math.min(rows.length, cap),
        truncated,
        tookMs,
        ...(typeof r.rowsAffected === 'number' ? { affectedRows: r.rowsAffected } : {}),
      }
    }))
  }

  async oracleQuery(c, sql, maxRows, offset = 0) {
    assertReadOnlySql(sql, this.allowWrites)
    const kind = statementKind(sql)
    const pageable = kind === 'query'
    const cap = Math.min(Math.max(1, maxRows ?? this.maxRows), 10000)
    const off = Math.max(0, Math.floor(offset) || 0)
    const effective = pageable && SELECT_HEAD.test(sql) ? paginateSelect(sql, 'oracle', off, cap) : sql
    const result = await this.oracleExecute(c, effective, cap)
    return { ...result, statementKind: kind, pageable }
  }

  async oracleSchemas(c) {
    const r = await this.oracleExecute(c, 'SELECT DISTINCT OWNER FROM ALL_OBJECTS ORDER BY OWNER', 2000)
    return r.rows.map((row) => row[0]).filter((name) => typeof name === 'string')
  }

  async oracleTables(c, schema) {
    if (!schema) fail('bad-request', 'schema is required')
    const r = await this.oracleExecute(c,
      `SELECT OBJECT_NAME, OBJECT_TYPE FROM ALL_OBJECTS WHERE OWNER='${quoted(schema)}' AND OBJECT_TYPE IN ('TABLE','VIEW') ORDER BY OBJECT_NAME`,
      5000)
    return r.rows.map((row) => ({ name: row[0], kind: String(row[1]).toLowerCase() }))
  }

  async oracleColumns(c, schema, table) {
    if (!schema || !table) fail('bad-request', 'schema and table are required')
    const r = await this.oracleExecute(c,
      `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT FROM ALL_TAB_COLUMNS WHERE OWNER='${quoted(schema)}' AND TABLE_NAME='${quoted(table)}' ORDER BY COLUMN_ID`,
      2000)
    return r.rows.map((row) => ({ name: row[0], type: row[1], nullable: row[2] === 'Y', key: '', default: row[3], extra: '' }))
  }

  async oracleIndexes(c, schema, table) {
    if (!schema || !table) fail('bad-request', 'schema and table are required')
    const r = await this.oracleExecute(c,
      `SELECT i.INDEX_NAME, i.UNIQUENESS, i.INDEX_TYPE, c.COLUMN_NAME, c.COLUMN_POSITION FROM ALL_INDEXES i JOIN ALL_IND_COLUMNS c ON c.INDEX_OWNER = i.OWNER AND c.INDEX_NAME = i.INDEX_NAME WHERE i.OWNER = '${quoted(schema)}' AND i.TABLE_NAME = '${quoted(table)}' ORDER BY i.INDEX_NAME, c.COLUMN_POSITION`,
      2000)
    return groupIndexes(r.rows.map((row) => ({
      name: row[0], unique: row[1] === 'UNIQUE', type: row[2],
      column: row[3], nullable: null, cardinality: null, comment: '',
    })))
  }

  oraclePreview(c, schema, table, maxRows, offset = 0) {
    if (!schema || !table) fail('bad-request', 'schema and table are required')
    const cap = Math.min(Math.max(1, maxRows ?? 100), 1000)
    const off = Math.max(0, Math.floor(offset) || 0)
    const base = `SELECT * FROM "${ident(schema)}"."${ident(table)}"`
    // ROWNUM works on every Oracle version; FETCH FIRST needs 12c+ (this plugin supports 11g via Thick mode).
    return this.oracleExecute(c, `SELECT * FROM (SELECT dbb_p.*, ROWNUM dbb_prn FROM (${base}) dbb_p WHERE ROWNUM <= ${off + cap + 1}) WHERE dbb_prn > ${off}`, cap)
  }

  async oracleRoutines(c, schema) {
    if (!schema) fail('bad-request', 'schema is required')
    const r = await this.oracleExecute(c,
      `SELECT OBJECT_NAME, OBJECT_TYPE, STATUS FROM ALL_OBJECTS WHERE OWNER='${quoted(schema)}' AND OBJECT_TYPE IN ('PROCEDURE','FUNCTION','PACKAGE') ORDER BY OBJECT_TYPE, OBJECT_NAME`,
      2000)
    return r.rows.map((row) => ({ name: row[0], kind: String(row[1]).toLowerCase(), detail: String(row[2] ?? '').toLowerCase() }))
  }

  async oracleRoutineSource(c, schema, name, kind) {
    if (!schema || !name) fail('bad-request', 'schema and object are required')
    // A package has a spec and a body; TYPE DESC lists PACKAGE BODY after PACKAGE.
    const types = String(kind ?? '').toLowerCase() === 'package' ? `('PACKAGE','PACKAGE BODY')` : `('${quoted(String(kind ?? 'procedure').toUpperCase())}')`
    const r = await this.oracleExecute(c,
      `SELECT TEXT FROM ALL_SOURCE WHERE OWNER='${quoted(schema)}' AND NAME='${quoted(name)}' AND TYPE IN ${types} ORDER BY TYPE DESC, LINE`,
      10000)
    if (r.rows.length === 0) fail('not-found', `No source for ${name} in ${schema}`)
    return { ddl: r.rows.map((row) => row[0]).join('') }
  }

  async oracleCallRoutine(c, schema, name, args) {
    if (!schema || !name) fail('bad-request', 'schema and object are required')
    if (!this.allowWrites) fail('readonly', 'Executing a routine can modify data. Set allowWrites: true in the plugin configuration to enable it.')
    const type = await this.oracleExecute(c,
      `SELECT OBJECT_TYPE FROM ALL_OBJECTS WHERE OWNER='${quoted(schema)}' AND OBJECT_NAME='${quoted(name)}' AND OBJECT_TYPE IN ('PROCEDURE','FUNCTION','PACKAGE')`,
      1)
    if (type.rows.length === 0) fail('not-found', `No routine named ${name} in ${schema}`)
    if (type.rows[0][0] !== 'PROCEDURE') fail('bad-request', `${name} is a ${String(type.rows[0][0]).toLowerCase()}; only standalone procedures can be executed here`)
    const argv = Array.isArray(args) ? args.map(String) : []
    if (argv.length > 32) fail('bad-request', 'too many routine arguments')
    const placeholders = argv.map((_, i) => `:${i + 1}`).join(', ')
    return this.runOn(c, (h) => h.run(async (conn) => {
      const started = Date.now()
      const run = conn.execute(`BEGIN "${ident(schema)}"."${ident(name)}"(${placeholders}); END;`, argv)
      await withTimeout(run, this.queryTimeoutMs)
      return { columns: [], rows: [], rowCount: 0, truncated: false, tookMs: Date.now() - started, statementKind: 'write', pageable: false }
    }))
  }

  // ---------- Redis ----------

  redisInfo(c) {
    return this.runOn(c, async (h) => {
      const r = h.client()
      const raw = await r.info()
      const mode = c.mode
      const dbsize = await r.dbsize().catch(() => null)
      const sections = {}
      let section = 'misc'
      for (const line of String(raw).split(/\r?\n/)) {
        if (!line) continue
        if (line.startsWith('#')) { section = line.slice(1).trim().toLowerCase(); sections[section] = {}; continue }
        const eq = line.indexOf(':')
        if (eq > 0) sections[section][line.slice(0, eq)] = line.slice(eq + 1)
      }
      return { mode, dbsize, sections }
    })
  }

  redisKeys(c, pattern, limit) {
    const match = typeof pattern === 'string' && pattern !== '' ? pattern : '*'
    const cap = Math.min(Math.max(1, limit ?? 500), 5000)
    return this.runOn(c, async (h) => {
      const r = h.client()
      const masters = c.mode === 'cluster' ? r.nodes('master') : [r]
      const keys = []
      let truncated = false
      for (const node of masters) {
        let cursor = '0'
        do {
          const [next, batch] = await node.scan(cursor, 'MATCH', match, 'COUNT', 200)
          cursor = next
          for (const key of batch) {
            if (keys.length >= cap) { truncated = true; break }
            keys.push(key)
          }
          if (truncated) break
        } while (cursor !== '0')
        if (truncated) break
      }
      keys.sort()
      return { pattern: match, keys, truncated }
    })
  }

  redisGet(c, key) {
    if (typeof key !== 'string' || key === '') fail('bad-request', 'key is required')
    return this.runOn(c, async (h) => {
      const r = h.client()
      const type = await r.type(key)
      const [ttl, pttl] = await Promise.all([r.ttl(key), r.pttl(key)])
      const base = { key, type, ttl, pttl }
      if (type === 'none') return { ...base, exists: false, value: null }
      if (type === 'string') {
        const length = await r.strlen(key)
        const cap = 65536
        const value = await r.getrange(key, 0, cap - 1)
        return { ...base, exists: true, length, value, truncated: length > cap }
      }
      if (type === 'hash') {
        const length = await r.hlen(key)
        const value = {}
        let count = 0
        let cursor = '0'
        do {
          const [next, batch] = await r.hscan(key, cursor, 'COUNT', 200)
          cursor = next
          for (let i = 0; i + 1 < batch.length && count < 500; i += 2) {
            value[batch[i]] = batch[i + 1]
            count += 1
          }
          if (count >= 500) break
        } while (cursor !== '0')
        return { ...base, exists: true, length, value, truncated: count < length }
      }
      if (type === 'list') {
        const length = await r.llen(key)
        return { ...base, exists: true, length, value: await r.lrange(key, 0, 199), truncated: length > 200 }
      }
      if (type === 'set') {
        const length = await r.scard(key)
        const value = []
        let cursor = '0'
        do {
          const [next, batch] = await r.sscan(key, cursor, 'COUNT', 200)
          cursor = next
          value.push(...batch)
          if (value.length >= 500) break
        } while (cursor !== '0')
        return { ...base, exists: true, length, value, truncated: value.length < length }
      }
      if (type === 'zset') {
        const length = await r.zcard(key)
        const flat = await r.zrange(key, 0, 199, 'WITHSCORES')
        const value = []
        for (let i = 0; i + 1 < flat.length; i += 2) value.push({ member: flat[i], score: flat[i + 1] })
        return { ...base, exists: true, length, value, truncated: length > 200 }
      }
      if (type === 'stream') {
        const length = await r.xlen(key)
        const entries = await r.xrange(key, '-', '+', 'COUNT', 100)
        return { ...base, exists: true, length, value: entries, truncated: length > 100 }
      }
      return { ...base, exists: true, value: `(type ${type} is not previewable)` }
    })
  }

  redisCommand(c, command, args) {
    const cmd = typeof command === 'string' ? command.trim().toUpperCase() : ''
    if (!cmd) fail('bad-request', 'command is required')
    if (!this.allowWrites && !REDIS_READONLY.has(cmd)) {
      fail('readonly', `Redis command ${cmd} is not in the read-only allowlist. Set allowWrites: true in the plugin configuration to enable writes.`)
    }
    const argv = Array.isArray(args) ? args.map(String) : []
    if (argv.length > 64) fail('bad-request', 'too many command arguments')
    return this.runOn(c, async (h) => ({ command: cmd, args: argv, result: await h.client().call(cmd, ...argv) }))
  }

  // ---------- shared dispatch ----------

  async test(raw, password) {
    const c = normalizeConnection(raw)
    const override = typeof password === 'string' && password !== '' ? password : undefined
    const handle = await this.openHandle(c, override)
    await handle.close()
    return { ok: true, type: c.type, ...(c.type === 'redis' ? { mode: c.mode } : {}) }
  }

  async sqlAction(id, action, args = {}) {
    const c = this.get(id)
    if (!SQL_TYPES.has(c.type)) fail('bad-request', `Connection ${id} is ${c.type}, not a SQL database`)
    const family = FAMILY[c.type]
    if (action === 'list_routines' || action === 'show_routine' || action === 'call_routine') {
      this.assertProcedures(c)
      if (action === 'list_routines') {
        if (family === 'mysql') return { database: args.database ?? c.database ?? null, routines: await this.mysqlRoutines(c, args.database) }
        if (family === 'postgres') return { database: args.database ?? null, routines: await this.pgRoutines(c, args.database) }
        return { database: args.database ?? null, routines: await this.oracleRoutines(c, args.database) }
      }
      if (action === 'show_routine') {
        if (family === 'mysql') return this.mysqlRoutineSource(c, args.database, args.object)
        if (family === 'postgres') return this.pgRoutineSource(c, args.database, args.object)
        return this.oracleRoutineSource(c, args.database, args.object, args.kind)
      }
      if (family === 'mysql') return this.mysqlCallRoutine(c, args.database, args.object, args.args)
      if (family === 'postgres') return this.pgCallRoutine(c, args.database, args.object, args.args)
      return this.oracleCallRoutine(c, args.database, args.object, args.args)
    }
    if (family === 'mysql') {
      if (action === 'list_databases') return { databases: await this.mysqlDatabases(c) }
      if (action === 'list_tables') return { database: args.database ?? c.database ?? null, tables: await this.mysqlTables(c, args.database) }
      if (action === 'describe_table') return { columns: await this.mysqlColumns(c, args.database, args.table) }
      if (action === 'preview_table') return this.mysqlPreview(c, args.database, args.table, args.maxRows, args.offset)
      if (action === 'show_create') return this.mysqlShowCreate(c, args.database, args.table)
      if (action === 'list_indexes') return { indexes: await this.mysqlIndexes(c, args.database, args.table) }
      if (action === 'query') return this.mysqlQuery(c, args.sql, args.maxRows, args.offset)
    } else if (family === 'postgres') {
      if (action === 'list_databases') return { databases: await this.pgSchemas(c) }
      if (action === 'list_tables') return { database: args.database ?? null, tables: await this.pgTables(c, args.database) }
      if (action === 'describe_table') return { columns: await this.pgColumns(c, args.database, args.table) }
      if (action === 'preview_table') return this.pgPreview(c, args.database, args.table, args.maxRows, args.offset)
      if (action === 'show_create') fail('bad-request', 'show_create is only available for MySQL-family connections')
      if (action === 'list_indexes') return { indexes: await this.pgIndexes(c, args.database, args.table) }
      if (action === 'query') return this.pgQuery(c, args.sql, args.maxRows, args.offset)
    } else {
      if (action === 'list_databases') return { databases: await this.oracleSchemas(c) }
      if (action === 'list_tables') return { database: args.database ?? null, tables: await this.oracleTables(c, args.database) }
      if (action === 'describe_table') return { columns: await this.oracleColumns(c, args.database, args.table) }
      if (action === 'preview_table') return this.oraclePreview(c, args.database, args.table, args.maxRows, args.offset)
      if (action === 'show_create') fail('bad-request', 'show_create is only available for MySQL-family connections')
      if (action === 'list_indexes') return { indexes: await this.oracleIndexes(c, args.database, args.table) }
      if (action === 'query') return this.oracleQuery(c, args.sql, args.maxRows, args.offset)
    }
    fail('bad-request', `Unknown action ${action}`)
  }

  redisAction(id, action, args = {}) {
    const c = this.get(id)
    if (c.type !== 'redis') fail('bad-request', `Connection ${id} is ${c.type}, not redis`)
    if (action === 'info') return this.redisInfo(c)
    if (action === 'keys') return this.redisKeys(c, args.pattern, args.limit)
    if (action === 'get') return this.redisGet(c, args.key)
    if (action === 'ttl') return this.runOn(c, async (h) => ({ key: args.key, ttl: await h.client().ttl(args.key), pttl: await h.client().pttl(args.key) }))
    if (action === 'dbsize') return this.runOn(c, async (h) => ({ dbsize: await h.client().dbsize() }))
    if (action === 'command') return this.redisCommand(c, args.command, args.args)
    fail('bad-request', `Unknown action ${action}`)
  }
}

/** Oracle/MySQL identifier quoting helpers. */
function quoted(value) { return String(value).replace(/'/g, "''") }
function ident(value) { return String(value).replace(/"/g, '""') }
function backtick(value) { return String(value).replace(/`/g, '``') }

/** BigInt/Buffer/Date-safe row normalization for JSON transport. */
function normalizeRow(row) {
  if (!Array.isArray(row)) return row
  return row.map((cell) => {
    if (cell === null || cell === undefined) return null
    if (typeof cell === 'bigint') return cell.toString()
    if (typeof cell === 'number' || typeof cell === 'string' || typeof cell === 'boolean') return cell
    if (cell instanceof Date) return cell.toISOString()
    if (Buffer.isBuffer(cell)) return cell.toString('utf8')
    if (cell instanceof Uint8Array) return Buffer.from(cell).toString('utf8')
    try { return JSON.parse(JSON.stringify(cell)) } catch { return String(cell) }
  })
}

function withTimeout(promise, ms, onTimeout) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.() } catch { /* best effort */ }
      reject(new DbBrowserError('timeout', `Operation timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ---------- HTTP surface ----------

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req, cap = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > cap) { reject(new DbBrowserError('payload-too-large', 'request body is too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function registerHttp(ctx, core) {
  const webServer = ctx.get('webServer')
  const connection = ctx.get('connection')
  if (!webServer) return
  const rejected = (req, res) => {
    if (!connection?.requestRejection) {
      // Fail closed: without the connection service we cannot authenticate.
      res.statusCode = 403
      res.end()
      return true
    }
    const status = connection.requestRejection(req)
    if (status === undefined) return false
    res.statusCode = status
    res.end()
    return true
  }
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      const reply = (status, body) => {
        try {
          sendJson(res, status, body)
        } catch {
          try { req.destroy() } catch { /* response already unusable */ }
        }
      }
      try {
        if (rejected(req, res)) return
        const pathname = new URL(String(req.url), 'http://localhost').pathname
        const op = pathname === ROUTE_PREFIX ? '' : pathname.slice(ROUTE_PREFIX.length + 1).replace(/^\/+|\/+$/g, '')
        if (op === 'connections' && req.method === 'GET') {
          const items = []
          for (const c of core.list()) items.push({ ...c, hasPassword: await core.hasPassword(c.id), status: core.statusOf(c.id) })
          reply(200, { ok: true, value: { connections: items, allowWrites: core.allowWrites, maxRows: core.maxRows } })
          return
        }
        if (req.method !== 'POST') { reply(405, { ok: false, error: { code: 'method-not-allowed', message: 'POST required' } }); return }
        const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
        if (essence !== 'application/json') { reply(415, { ok: false, error: { code: 'unsupported-media-type', message: 'content-type must be application/json' } }); return }
        let payload
        try {
          payload = JSON.parse(await readBody(req))
        } catch (error) {
          reply(error?.code === 'payload-too-large' ? 413 : 400, { ok: false, error: { code: error?.code ?? 'bad-request', message: 'request body must be JSON' } })
          return
        }
        const value = await dispatchPanelOp(core, op, payload)
        reply(200, { ok: true, value })
      } catch (error) {
        const code = error instanceof DbBrowserError ? error.code : 'internal'
        reply(code === 'internal' ? 500 : 400, { ok: false, error: { code, message: String(error?.message ?? error) } })
      }
    },
  }), 'db-browser: http routes')
}

async function dispatchPanelOp(core, op, p) {
  switch (op) {
    case 'save-connection': {
      // Write the secret first: saving config restarts this plugin, and a
      // restarted plugin still finds the password under the connection id.
      if (typeof p.password === 'string' && p.password !== '') {
        const next = normalizeConnection(p.connection)
        await core.savePassword(next.id, p.password)
      } else if (p.clearPassword === true) {
        const next = normalizeConnection(p.connection)
        await core.savePassword(next.id, '')
      }
      return core.saveConnection(p.connection)
    }
    case 'delete-connection': {
      // Password cleanup is best-effort: a missing credential store must not
      // block removing the config row.
      try { await core.savePassword(p.id, '') } catch { /* credential store unavailable */ }
      return core.deleteConnection(p.id)
    }
    case 'test': return core.test(p.connection, p.password)
    case 'connect': return core.startConnection(p.id)
    case 'disconnect': return core.stopConnection(p.id)
    case 'list-databases': return core.sqlAction(p.id, 'list_databases')
    case 'list-tables': return core.sqlAction(p.id, 'list_tables', p)
    case 'describe-table': return core.sqlAction(p.id, 'describe_table', p)
    case 'preview-table': return core.sqlAction(p.id, 'preview_table', p)
    case 'show-create': return core.sqlAction(p.id, 'show_create', p)
    case 'list-indexes': return core.sqlAction(p.id, 'list_indexes', p)
    case 'query': return core.sqlAction(p.id, 'query', p)
    case 'list-routines': return core.sqlAction(p.id, 'list_routines', p)
    case 'routine-source': return core.sqlAction(p.id, 'show_routine', p)
    case 'call-routine': return core.sqlAction(p.id, 'call_routine', p)
    case 'redis-info': return core.redisAction(p.id, 'info')
    case 'redis-keys': return core.redisAction(p.id, 'keys', p)
    case 'redis-get': return core.redisAction(p.id, 'get', p)
    case 'redis-dbsize': return core.redisAction(p.id, 'dbsize')
    case 'redis-command': return core.redisAction(p.id, 'command', p)
    default: fail('bad-request', `Unknown op ${op}`)
  }
}

// ---------- Agent tools ----------

function jsonRender(_args, value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

/** The two agent-facing tool definitions; shared by the DSH tool registry and the stdio MCP server. */
export function buildToolDefinitions(core) {
  return [dbToolDefinition(core), redisToolDefinition(core)]
}

function dbToolDefinition(core) {
  return {
    name: 'db_browser',
    description: [
      'Browse and query configured relational databases (MySQL, TDSQL-MySQL, GoldenDB, PostgreSQL, TDSQL-PG, Oracle).',
      'A connection must be started before any browsing or query: check status in list_connections',
      '(open = usable, stopped = closed). Use connect/disconnect to control it, or ask the user',
      'to start it in the Database panel. Connections never auto-start and close when DSH exits.',
      'Actions: list_connections (no other params); list_databases (connection);',
      'list_tables (connection, database); describe_table (connection, database, table); list_indexes (connection, database, table);',
      'preview_table (connection, database, table, optional maxRows <= 1000); show_create (MySQL family only, returns DDL);',
      'query (connection, sql, optional maxRows, optional offset — offset-paginated, truncated=true means more pages);',
      'list_routines / show_routine (connection, database, object) — stored procedures and functions, only on connection types',
      'whose features.procedures is true in list_connections (TDSQL and GoldenDB do not support them);',
      'call_routine (connection, database, object, optional args — IN arguments as strings) executes a procedure and needs allowWrites.',
      'The database argument means schema/owner for Oracle and PostgreSQL connections, database name for the MySQL family.',
      'Connections come from the Database browser plugin; ask the user to add one in the sidebar panel when none fit.',
      'Read-only by default: only SELECT/SHOW/DESC/EXPLAIN/WITH, one statement per call.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list_connections', 'connect', 'disconnect', 'list_databases', 'list_tables', 'describe_table', 'list_indexes', 'preview_table', 'show_create', 'query', 'list_routines', 'show_routine', 'call_routine'], description: 'Operation to run.' },
        connection: { type: 'string', description: 'Connection id from list_connections.' },
        database: { type: 'string', description: 'Database (MySQL family) or schema/owner (Oracle, PostgreSQL).' },
        table: { type: 'string', description: 'Table name.' },
        object: { type: 'string', description: 'Routine (procedure/function/package) name for show_routine and call_routine.' },
        kind: { type: 'string', description: 'Routine kind for show_routine on Oracle (procedure/function/package); needed when a package shares its name.' },
        args: { type: 'array', items: { type: 'string' }, description: 'IN arguments for call_routine, in declaration order, passed as strings.' },
        sql: { type: 'string', description: 'One SQL statement for action=query.' },
        maxRows: { type: 'number', description: 'Row cap per page (default from plugin config, max 10000).' },
        offset: { type: 'number', description: 'Zero-based row offset for pagination; combine with maxRows and the returned truncated flag (true = more rows available).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: jsonRender },
    isConcurrencySafe: () => true,
    async execute(args) {
      const action = args?.action
      if (action === 'list_connections') {
        return { connections: core.list().map((c) => ({ ...c, status: core.statusOf(c.id) })), allowWrites: core.allowWrites }
      }
      if (action === 'connect') return core.startConnection(args?.connection)
      if (action === 'disconnect') return core.stopConnection(args?.connection)
      const id = args?.connection
      if (typeof id !== 'string' || id === '') fail('bad-request', 'connection is required')
      return core.sqlAction(id, action, args)
    },
  }
}

function redisToolDefinition(core) {
  return {
    name: 'redis_browser',
    description: [
      'Inspect a configured Redis connection (standalone, Sentinel, or Cluster).',
      'The connection must be started first (status in db_browser list_connections); connect/disconnect control it.',
      'Actions: info (connection); keys (connection, optional pattern, optional limit <= 5000) — SCAN-based, safe on large keyspaces;',
      'get (connection, key) — type-aware value with TTL; ttl (connection, key); dbsize (connection);',
      'command (connection, command, args) — read-only commands only unless the plugin has allowWrites enabled.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['connect', 'disconnect', 'info', 'keys', 'get', 'ttl', 'dbsize', 'command'], description: 'Operation to run.' },
        connection: { type: 'string', description: 'Connection id (a redis connection from db_browser list_connections).' },
        pattern: { type: 'string', description: 'Glob pattern for keys, default *.' },
        limit: { type: 'number', description: 'Max keys returned, default 500.' },
        key: { type: 'string', description: 'Redis key for get/ttl.' },
        command: { type: 'string', description: 'Redis command name for action=command.' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments.' },
      },
      required: ['action', 'connection'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: jsonRender },
    isConcurrencySafe: () => true,
    async execute(args) {
      const id = args?.connection
      if (args?.action === 'connect') return core.startConnection(id)
      if (args?.action === 'disconnect') return core.stopConnection(id)
      if (typeof id !== 'string' || id === '') fail('bad-request', 'connection is required')
      return core.redisAction(id, args?.action, args)
    },
  }
}

function registerTools(ctx, core) {
  const tools = ctx.get('tools')
  if (!tools) return
  for (const definition of buildToolDefinitions(core)) {
    ctx.effect(() => tools.register(definition), `db-browser: ${definition.name} tool`)
  }
}

export function apply(ctx, config) {
  // Cordis validates Config before calling apply. Running it here too covers
  // direct callers and turns a bad document into a failed plugin fiber.
  const resolved = Config(config ?? {})
  const core = new DbCore(ctx, resolved)
  // Cold boot gives no start-order guarantee between this row and the services
  // it consumes: ctx.get('webServer') can return undefined here, and a silent
  // skip meant the panel's routes never existed (HTTP 404) until a hot reload.
  // ctx.inject defers the callback until the services are published and re-runs
  // it when they reload, disposing our effect registrations in between.
  ctx.inject(['webServer', 'connection'], (injected) => registerHttp(injected, core))
  ctx.inject(['tools'], (injected) => registerTools(injected, core))
  // DSH exit / plugin reload closes every started connection; nothing auto-restarts.
  ctx.effect(() => async () => {
    core.closed = true
    const sessions = [...core.sessions.values()]
    core.sessions = new Map()
    for (const s of sessions) {
      try { await s.handle.close() } catch { /* already closed */ }
    }
  }, 'db-browser: close connections')
}

// Named exports for the unit tests; the runtime only uses `apply`.
export {
  DbCore,
  paginateSelect,
  DbBrowserError,
  dispatchPanelOp,
  normalizeConnection,
  normalizeRow,
  hasMultipleStatements,
  assertReadOnlySql,
  quoted,
  ident,
  backtick,
  REDIS_READONLY,
  FAMILY,
  DEFAULT_FEATURES,
}
