/**
 * Browser half of the database browser bundle: a sidebar panel-list icon and
 * the `database` main panel (connection tree, SQL editor with result grid,
 * Redis key browser). All data flows through the Host half's /db-browser/
 * routes; this module holds no secrets and no business logic beyond view state.
 */
window.__ModuleLoader__.load({
  id: '@local/db-browser',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useRef } = React

    const NS = 'db-browser'
    const PANEL_ID = 'database'
    const ROUTE = '/db-browser/'

    const zh = {
      'panel': '数据库',
      'header.subtitle': '连接、浏览并查询数据库',
      'newConnection': '新建连接',
      'refresh': '刷新',
      'edit': '编辑',
      'conn.start': '启动',
      'conn.stop': '停止',
      'conn.starting': '连接中…',
      'conn.needStart': '连接未启动',
      'form.delete': '删除连接',
      'delete': '删除',
      'test': '测试连接',
      'save': '保存',
      'cancel': '取消',
      'emptyConnections': '还没有连接。点击「新建连接」添加 MySQL / Oracle / Redis。',
      'confirmDelete': '确定删除连接「{label}」吗？其密码会一并移除。',
      'form.titleNew': '新建连接',
      'form.titleEdit': '编辑连接',
      'form.id': '标识 (id)',
      'form.idHint': '字母、数字、_ . -，保存后不可改；Agent 用它指定连接',
      'form.label': '名称',
      'form.type': '类型',
      'form.mode': '部署模式',
      'form.mode.standalone': '单机',
      'form.mode.sentinel': '哨兵 Sentinel',
      'form.mode.cluster': '集群 Cluster',
      'form.hosts': '主机列表',
      'form.hostsHint': '每行一个 host:port；多个主机按顺序故障切换。哨兵模式填 Sentinel 地址',
      'form.user': '用户名',
      'form.password': '密码',
      'form.passwordKeep': '留空则保持已保存的密码',
      'form.passwordClear': '清除已保存的密码',
      'form.database': '默认数据库',
      'form.serviceName': '服务名 (serviceName)',
      'form.sid': 'SID (与 serviceName 二选一)',
      'form.connectString': '连接串 (可选，优先于主机列表)',
      'form.masterName': '主库名称 (masterName)',
      'form.dbIndex': 'DB 序号',
      'form.testing': '测试中…',
      'form.testOk': '连接成功',
      'form.testFail': '连接失败',
      'tree.loading': '加载中…',
      'tree.retry': '重试',
      'tree.filter': '过滤表名…',
      'tree.more': '共 {total} 张，仅显示前 {shown} 张',
      'sql.placeholder': '在此输入 SQL，Cmd/Ctrl+Enter 执行。默认只读（SELECT/SHOW/DESC/EXPLAIN）。',
      'sql.run': '执行',
      'sql.running': '执行中…',
      'sql.readonly': '只读模式：写操作已被拒绝（可在插件配置中开启 allowWrites）',
      'sql.writable': '写操作已开启 (allowWrites)',
      'result.rows': '{n} 行',
      'result.truncated': '已截断',
      'result.empty': '无数据',
      'result.affected': '影响行数 {n}',
      'result.took': '耗时 {ms}ms',
      'result.renderCap': '仅渲染前 {n} 行（其余已省略）',
      'result.copyCsv': '复制 CSV',
      'result.page.prev': '上一页',
      'result.page.next': '下一页',
      'result.page.range': '第 {from}–{to} 行',
      'result.page.size': '每页',
      'table.columns': '列',
      'table.indexes': '索引',
      'table.preview': '预览数据',
      'table.openInSql': '在 SQL 中查询',
      'table.ddl': 'DDL',
      'redis.pattern': '键模式 (glob)',
      'redis.scan': '扫描',
      'redis.scanning': '扫描中…',
      'redis.keys': '键 ({n})',
      'redis.dbsize': '键总数',
      'redis.selectKey': '点击左侧键名查看值',
      'redis.ttl': 'TTL',
      'redis.noTtl': '永不过期',
      'redis.type': '类型',
      'redis.length': '长度 {n}',
            'redis.truncatedValue': '内容过多，仅显示部分',
      'error.title': '出错了',
      'welcome.title': '数据库浏览器',
      'welcome.body': '从左侧选择一个连接开始浏览，或新建连接。Agent 也可以通过 db_browser / redis_browser 工具查询这些连接。',
      'close': '关闭',
    }
    const en = {
      'panel': 'Database',
      'header.subtitle': 'Connect, browse, and query databases',
      'newConnection': 'New connection',
      'refresh': 'Refresh',
      'edit': 'Edit',
      'conn.start': 'Start',
      'conn.stop': 'Stop',
      'conn.starting': 'Connecting…',
      'conn.needStart': 'Connection stopped',
      'form.delete': 'Delete connection',
      'delete': 'Delete',
      'test': 'Test connection',
      'save': 'Save',
      'cancel': 'Cancel',
      'emptyConnections': 'No connections yet. Use "New connection" to add MySQL / Oracle / Redis.',
      'confirmDelete': 'Delete connection "{label}"? Its stored password is removed too.',
      'form.titleNew': 'New connection',
      'form.titleEdit': 'Edit connection',
      'form.id': 'Identifier (id)',
      'form.idHint': 'Letters, digits, _ . -; fixed after saving; the agent references connections by it',
      'form.label': 'Name',
      'form.type': 'Type',
      'form.mode': 'Deployment mode',
      'form.mode.standalone': 'Standalone',
      'form.mode.sentinel': 'Sentinel',
      'form.mode.cluster': 'Cluster',
      'form.hosts': 'Hosts',
      'form.hostsHint': 'One host:port per line; multiple hosts fail over in order. Sentinel mode: sentinel addresses',
      'form.user': 'User',
      'form.password': 'Password',
      'form.passwordKeep': 'Leave empty to keep the saved password',
      'form.passwordClear': 'Remove the saved password',
      'form.database': 'Default database',
      'form.serviceName': 'Service name',
      'form.sid': 'SID (alternative to service name)',
      'form.connectString': 'Connect string (optional, wins over hosts)',
      'form.masterName': 'Master name',
      'form.dbIndex': 'DB index',
      'form.testing': 'Testing…',
      'form.testOk': 'Connection succeeded',
      'form.testFail': 'Connection failed',
      'tree.loading': 'Loading…',
      'tree.retry': 'Retry',
      'tree.filter': 'Filter tables…',
      'tree.more': '{total} tables, showing first {shown}',
      'sql.placeholder': 'Type SQL here; Cmd/Ctrl+Enter runs it. Read-only by default (SELECT/SHOW/DESC/EXPLAIN).',
      'sql.run': 'Run',
      'sql.running': 'Running…',
      'sql.readonly': 'Read-only: writes are rejected (enable allowWrites in the plugin config)',
      'sql.writable': 'Writes enabled (allowWrites)',
      'result.rows': '{n} rows',
      'result.truncated': 'truncated',
      'result.empty': 'No rows',
      'result.affected': '{n} rows affected',
      'result.took': 'took {ms}ms',
      'result.renderCap': 'rendering first {n} rows only',
      'result.copyCsv': 'Copy CSV',
      'result.page.prev': 'Previous',
      'result.page.next': 'Next',
      'result.page.range': 'Rows {from}–{to}',
      'result.page.size': 'Page size',
      'table.columns': 'Columns',
      'table.indexes': 'Indexes',
      'table.preview': 'Data preview',
      'table.openInSql': 'Query in SQL editor',
      'table.ddl': 'DDL',
      'redis.pattern': 'Key pattern (glob)',
      'redis.scan': 'Scan',
      'redis.scanning': 'Scanning…',
      'redis.keys': 'Keys ({n})',
      'redis.dbsize': 'Total keys',
      'redis.selectKey': 'Click a key on the left to view its value',
      'redis.ttl': 'TTL',
      'redis.noTtl': 'No expiry',
      'redis.type': 'Type',
      'redis.length': 'Length {n}',
      'redis.truncatedValue': 'large value, showing a subset',
      'error.title': 'Something went wrong',
      'welcome.title': 'Database browser',
      'welcome.body': 'Pick a connection on the left, or create one. The agent can query the same connections through the db_browser / redis_browser tools.',
      'close': 'Close',
    }

    // Survives panel remounts: where the user was, never what the server returned.
    const viewState = { selected: null }

    // ---------- data ----------

    async function parseBody(res) {
      let body = null
      try { body = await res.json() } catch { /* fall through */ }
      if (!body || body.ok !== true) {
        const err = new Error(body?.error?.message ?? `HTTP ${res.status}`)
        err.code = body?.error?.code
        throw err
      }
      return body.value
    }

    async function call(op, args) {
      const res = await fetch(ROUTE + op, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args ?? {}),
      })
      return parseBody(res)
    }

    async function loadConnections() {
      const res = await fetch(ROUTE + 'connections', { headers: { accept: 'application/json' } })
      return parseBody(res)
    }

    function hostsToText(hosts) {
      return (hosts ?? []).map((x) => `${x.host}:${x.port}`).join('\n')
    }

    function textToHosts(text) {
      return String(text ?? '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const idx = line.lastIndexOf(':')
          if (idx > 0 && /^\d+$/.test(line.slice(idx + 1))) {
            return { host: line.slice(0, idx), port: Number(line.slice(idx + 1)) }
          }
          return { host: line }
        })
    }

    function fmt(t, key, vars) {
      try { return t(key, vars) } catch { /* fall through */ }
      let s = t(key)
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
      return s
    }

    // ---------- virtualized list helpers ----------

    /** Windowed rendering: only the visible slice of a long list hits the DOM. */
    function useWindowed(total, rowHeight, overscan = 10) {
      const ref = useRef(null)
      const [range, setRange] = useState({ start: 0, end: Math.min(total, 50) })
      const update = useCallback(() => {
        const el = ref.current
        if (!el) return
        const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - overscan)
        const end = Math.min(total, Math.ceil((el.scrollTop + el.clientHeight) / rowHeight) + overscan)
        setRange((r) => (r.start === start && r.end === end ? r : { start, end }))
      }, [total, rowHeight, overscan])
      useEffect(() => { update() }, [update])
      return { ref, range, onScroll: update }
    }

    // ---------- small components ----------

    function DbPanelIcon({ size }) {
      const s = size ?? 16
      return h('svg', { width: s, height: s, viewBox: '0 0 36 36', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M18 5c-5.5 0-10 1.7-10 4v18c0 2.3 4.5 4 10 4s10-1.7 10-4V9c0-2.3-4.5-4-10-4z', fill: 'currentColor', opacity: 0.9 }),
        h('ellipse', { cx: 18, cy: 9, rx: 10, ry: 4, fill: 'currentColor' }),
        h('ellipse', { cx: 18, cy: 9, rx: 7.2, ry: 2.6, fill: 'var(--dsw-alias-bg-base)' }),
        h('path', { d: 'M8 15.2c1.6 1.8 5.6 2.8 10 2.8s8.4-1 10-2.8M8 23.2c1.6 1.8 5.6 2.8 10 2.8s8.4-1 10-2.8', stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.6, fill: 'none' }),
      )
    }

    function TypeBadge({ type }) {
      const label = type === 'mysql' ? 'MySQL' : type === 'oracle' ? 'Oracle' : 'Redis'
      return h('span', { className: `dbb-badge dbb-badge-${type}` }, label)
    }

    function ErrorBar({ error, onClose, t }) {
      if (!error) return null
      return h('div', { className: 'dbb-error', role: 'alert' },
        h('span', { className: 'dbb-error-title' }, t('error.title') + ': '),
        h('span', null, String(error)),
        onClose ? h('button', { className: 'dbb-link', onClick: onClose }, t('close')) : null,
      )
    }

    function ResultGrid({ result, t }) {
      if (!result) return null
      if (typeof result.affectedRows === 'number' && (!result.columns || result.columns.length === 0)) {
        return h('div', { className: 'dbb-result-meta' },
          fmt(t, 'result.affected', { n: result.affectedRows }),
          typeof result.tookMs === 'number' ? ' · ' + fmt(t, 'result.took', { ms: result.tookMs }) : null)
      }
      const columns = result.columns ?? []
      const allRows = result.rows ?? []
      const rows = allRows
      const copyCsv = () => {
        const esc = (v) => {
          const s = v === null || v === undefined ? '' : String(v)
          return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
        }
        const text = [columns.map(esc).join(','), ...allRows.map((row) => columns.map((_, ci) => esc(Array.isArray(row) ? row[ci] : row?.[columns[ci]])).join(','))].join('\n')
        navigator.clipboard?.writeText(text).catch(() => {})
      }
      return h('div', { className: 'dbb-grid-wrap' },
        h('div', { className: 'dbb-result-meta' },
          fmt(t, 'result.rows', { n: result.rowCount ?? allRows.length }),
          result.truncated ? ` (${t('result.truncated')})` : '',
          typeof result.tookMs === 'number' ? ' · ' + fmt(t, 'result.took', { ms: result.tookMs }) : null,
          ' ',
          allRows.length > 0 ? h('button', { className: 'dbb-link', onClick: copyCsv }, t('result.copyCsv')) : null,
        ),
        columns.length === 0
          ? h('div', { className: 'dbb-muted' }, t('result.empty'))
          : h(VirtualGrid, { columns, rows, t }),
      )
    }

    const GRID_ROW_H = 27
    function VirtualGrid({ columns, rows, t }) {
      const { ref, range, onScroll } = useWindowed(rows.length, GRID_ROW_H)
      const topH = range.start * GRID_ROW_H
      const bottomH = Math.max(0, (rows.length - range.end) * GRID_ROW_H)
      return h('div', { className: 'dbb-grid-scroll', ref, onScroll },
        h('table', { className: 'dbb-grid' },
          h('thead', null, h('tr', null, columns.map((c, i) => h('th', { key: i }, String(c))))),
          h('tbody', null,
            topH > 0 ? h('tr', { key: 'top', className: 'dbb-spacer' }, h('td', { colSpan: columns.length, style: { height: topH, padding: 0, border: 'none' } })) : null,
            rows.slice(range.start, range.end).map((row, ri) =>
              h('tr', { key: range.start + ri }, columns.map((_, ci) => {
                const cell = Array.isArray(row) ? row[ci] : row?.[columns[ci]]
                if (cell === null || cell === undefined) return h('td', { key: ci, className: 'dbb-null' }, 'NULL')
                const text = typeof cell === 'object' ? JSON.stringify(cell) : String(cell)
                return h('td', { key: ci, title: text }, text)
              })),
            ),
            bottomH > 0 ? h('tr', { key: 'bottom', className: 'dbb-spacer' }, h('td', { colSpan: columns.length, style: { height: bottomH, padding: 0, border: 'none' } })) : null,
          ),
        ),
      )
    }

    // ---------- connection form ----------

    function ConnectionForm({ initial, onClose, onSaved, onDelete, onSaveUncertain, t }) {
      const isEdit = Boolean(initial?.id)
      const [draft, setDraft] = useState(() => initial ?? { type: 'mysql', mode: 'standalone' })
      const [password, setPassword] = useState('')
      const [clearPassword, setClearPassword] = useState(false)
      const [busy, setBusy] = useState(null)
      const [outcome, setOutcome] = useState(null)
      const set = (field) => (e) => {
        const v = e?.target ? e.target.value : e
        setDraft((d) => ({ ...d, [field]: v }))
      }
      const build = () => {
        const c = {
          id: (draft.id ?? '').trim(),
          label: (draft.label ?? '').trim(),
          type: draft.type,
          hosts: textToHosts(draft.hostsText ?? hostsToText(draft.hosts)),
        }
        if (c.type === 'redis') {
          c.mode = draft.mode ?? 'standalone'
          if (draft.masterName) c.masterName = draft.masterName
          if (draft.db !== undefined && draft.db !== '') c.db = Number(draft.db)
          if (draft.username) c.username = draft.username
        } else {
          c.user = draft.user ?? ''
          if (c.type === 'mysql') { if (draft.database) c.database = draft.database }
          else {
            if (draft.connectString) c.connectString = draft.connectString
            if (draft.serviceName) c.serviceName = draft.serviceName
            if (draft.sid) c.sid = draft.sid
          }
        }
        return c
      }
      const run = async (op) => {
        setBusy(op); setOutcome(null)
        let connection
        try {
          connection = build()
        } catch (error) {
          setOutcome({ ok: false, text: String(error.message ?? error) })
          setBusy(null)
          return
        }
        try {
          if (op === 'test') {
            await call('test', { connection, password: password || undefined })
            setOutcome({ ok: true, text: t('form.testOk') })
          } else {
            await call('save-connection', {
              connection,
              password: password !== '' ? password : undefined,
              clearPassword,
            })
            onSaved(connection.id)
          }
        } catch (error) {
          // Saving restarts the Host plugin and can cut this response even
          // though the connection was stored; let the panel verify first.
          if (op === 'save' && (await onSaveUncertain(connection.id))) return
          setOutcome({ ok: false, text: `${t('form.testFail')}: ${error.message}` })
        } finally {
          setBusy(null)
        }
      }
      const field = (labelKey, node, hintKey) =>
        h('label', { className: 'dbb-field' },
          h('span', { className: 'dbb-field-label' }, t(labelKey)),
          node,
          hintKey ? h('span', { className: 'dbb-field-hint' }, t(hintKey)) : null,
        )
      const input = (value, onChange, opts) => h('input', { className: 'dbb-input', value: value ?? '', onChange: (e) => onChange(e.target.value), ...opts })
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', { className: 'dbb-modal-mask', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
        h('div', { className: 'dbb-modal', role: 'dialog', 'aria-label': isEdit ? t('form.titleEdit') : t('form.titleNew') },
          h('div', { className: 'dbb-modal-title' }, isEdit ? t('form.titleEdit') : t('form.titleNew')),
          h('div', { className: 'dbb-modal-body' },
            field('form.type', h('select', {
              className: 'dbb-input', value: draft.type,
              onChange: (e) => setDraft((d) => ({ ...d, type: e.target.value })),
            }, ['mysql', 'oracle', 'redis'].map((v) => h('option', { key: v, value: v }, v === 'mysql' ? 'MySQL / TDSQL / GoldenDB' : v === 'oracle' ? 'Oracle' : 'Redis')))),
            draft.type === 'redis'
              ? field('form.mode', h('select', {
                  className: 'dbb-input', value: draft.mode ?? 'standalone',
                  onChange: (e) => setDraft((d) => ({ ...d, mode: e.target.value })),
                }, ['standalone', 'sentinel', 'cluster'].map((v) => h('option', { key: v, value: v }, t(`form.mode.${v}`)))))
              : null,
            field('form.id', input(draft.id, set('id'), { disabled: isEdit, placeholder: 'my-db', autoFocus: !isEdit }), 'form.idHint'),
            field('form.label', input(draft.label, set('label'), { placeholder: draft.id ?? '' })),
            field('form.hosts', h('textarea', {
              className: 'dbb-input dbb-textarea', rows: 2,
              value: draft.hostsText ?? hostsToText(draft.hosts),
              placeholder: draft.type === 'redis' && draft.mode === 'sentinel' ? '10.0.0.1:26379' : draft.type === 'oracle' ? '10.0.0.1:1521' : '10.0.0.1:3306',
              onChange: (e) => setDraft((d) => ({ ...d, hostsText: e.target.value })),
            }), 'form.hostsHint'),
            draft.type === 'redis' && draft.mode === 'sentinel' ? field('form.masterName', input(draft.masterName, set('masterName'), { placeholder: 'mymaster' })) : null,
            draft.type !== 'redis' ? field('form.user', input(draft.user, set('user'), { autoComplete: 'off' })) : null,
            draft.type === 'mysql' ? field('form.database', input(draft.database, set('database'))) : null,
            draft.type === 'oracle' ? field('form.serviceName', input(draft.serviceName, set('serviceName'), { placeholder: 'ORCLPDB1' })) : null,
            draft.type === 'oracle' ? field('form.sid', input(draft.sid, set('sid'), { placeholder: 'ORCL' })) : null,
            draft.type === 'oracle' ? field('form.connectString', input(draft.connectString, set('connectString'), { placeholder: '(DESCRIPTION=…)' })) : null,
            draft.type === 'redis' ? field('form.dbIndex', input(draft.db ?? 0, (v) => setDraft((d) => ({ ...d, db: v })), { type: 'number', min: 0 })) : null,
            draft.type === 'redis' ? field('form.user', input(draft.username, set('username'), { placeholder: '(ACL, optional)' })) : null,
            field('form.password',
              h('input', {
                className: 'dbb-input', type: 'password', value: password, autoComplete: 'new-password',
                placeholder: isEdit && initial?.hasPassword ? t('form.passwordKeep') : '',
                onChange: (e) => { setPassword(e.target.value); if (e.target.value !== '') setClearPassword(false) },
              })),
            isEdit && initial?.hasPassword
              ? h('label', { className: 'dbb-check' },
                  h('input', { type: 'checkbox', checked: clearPassword, onChange: (e) => setClearPassword(e.target.checked) }),
                  h('span', null, t('form.passwordClear')))
              : null,
            outcome ? h('div', { className: outcome.ok ? 'dbb-ok' : 'dbb-error' }, outcome.text) : null,
          ),
          h('div', { className: 'dbb-modal-foot' },
            isEdit ? h('button', { className: 'dbb-btn dbb-btn-danger', disabled: busy !== null, onClick: () => onDelete(initial) }, t('form.delete')) : null,
            h('span', { style: { flex: 1 } }),
            h('button', { className: 'dbb-btn', onClick: onClose, disabled: busy !== null }, t('cancel')),
            h('button', { className: 'dbb-btn', onClick: () => run('test'), disabled: busy !== null }, busy === 'test' ? t('form.testing') : t('test')),
            h('button', { className: 'dbb-btn dbb-btn-primary', onClick: () => run('save'), disabled: busy !== null }, busy === 'save' ? '…' : t('save')),
          ),
        ),
      )
    }

    // ---------- SQL connection view ----------

    function SqlPane({ conn, seed, clearSeed, allowWrites, t }) {
      const [sql, setSql] = useState('')
      const [running, setRunning] = useState(false)
      const [result, setResult] = useState(null)
      const [error, setError] = useState(null)
      const [page, setPage] = useState(0)
      const [pageSize, setPageSize] = useState(500)
      const run = async (override, toPage = 0) => {
        const statement = (override ?? sql).trim()
        if (!statement || running) return
        setRunning(true); setError(null)
        try {
          setResult(await call('query', { id: conn.id, sql: statement, maxRows: pageSize, offset: toPage * pageSize }))
          setPage(toPage)
        } catch (e) { setError(e); setResult(null) }
        finally { setRunning(false) }
      }
      const runRef = useRef(run)
      runRef.current = run
      // A table view's "query in editor" seeds one generated, auto-run SELECT per click.
      useEffect(() => {
        if (!seed || seed.connId !== conn.id) return
        const statement = conn.type === 'oracle'
          ? `SELECT * FROM (SELECT * FROM "${String(seed.database).replace(/"/g, '""')}"."${String(seed.table).replace(/"/g, '""')}") WHERE ROWNUM <= 100`
          : `SELECT * FROM \`${String(seed.database).replace(/`/g, '``')}\`.\`${String(seed.table).replace(/`/g, '``')}\` LIMIT 100`
        setSql(statement)
        runRef.current(statement)
        clearSeed?.()
      }, [seed, conn.id, conn.type])
      return h('div', { className: 'dbb-sql' },
        h('div', { className: 'dbb-sql-bar' },
          h('span', { className: allowWrites ? 'dbb-warn-text' : 'dbb-muted' }, allowWrites ? t('sql.writable') : t('sql.readonly')),
          h('span', { style: { flex: 1 } }),
          result && result.columns?.length > 0
            ? h('span', { className: 'dbb-page' },
                h('button', { className: 'dbb-btn', onClick: () => run(undefined, page - 1), disabled: running || page === 0 }, '‹ ' + t('result.page.prev')),
                h('span', { className: 'dbb-muted' }, fmt(t, 'result.page.range', { from: page * pageSize + 1, to: page * pageSize + (result.rowCount ?? 0) }) + (result.truncated ? ' +' : '')),
                h('button', { className: 'dbb-btn', onClick: () => run(undefined, page + 1), disabled: running || !result.truncated }, t('result.page.next') + ' ›'),
              )
            : null,
          h('label', { className: 'dbb-muted dbb-page-size' }, t('result.page.size') + ' ',
            h('select', { className: 'dbb-input dbb-select-inline', value: pageSize, onChange: (e) => { setPageSize(Number(e.target.value)); setPage(0) } },
              [100, 500, 1000].map((n) => h('option', { key: n, value: n }, n)))),
          h('button', { className: 'dbb-btn dbb-btn-primary', onClick: () => run(undefined, 0), disabled: running }, running ? t('sql.running') : t('sql.run')),
        ),
        h('textarea', {
          className: 'dbb-sql-editor', value: sql, spellCheck: false,
          placeholder: t('sql.placeholder'),
          onChange: (e) => setSql(e.target.value),
          onKeyDown: (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run() } },
        }),
        h(ErrorBar, { error: error?.message, onClose: () => setError(null), t }),
        h(ResultGrid, { result, t }),
      )
    }

    function TableView({ conn, database, table, onOpenSql, t }) {
      const [columns, setColumns] = useState(null)
      const [preview, setPreview] = useState(null)
      const [error, setError] = useState(null)
      const [ddl, setDdl] = useState(null)
      const [indexes, setIndexes] = useState(null)
      const [previewPage, setPreviewPage] = useState(0)
      const showDdl = async () => {
        if (ddl !== null) { setDdl(null); return }
        try { setDdl((await call('show-create', { id: conn.id, database, table })).ddl) }
        catch (e) { setError(e) }
      }
      useEffect(() => {
        let alive = true
        setColumns(null); setPreview(null); setError(null)
        Promise.all([
          call('describe-table', { id: conn.id, database, table }),
          call('preview-table', { id: conn.id, database, table, maxRows: 100, offset: previewPage * 100 }),
          call('list-indexes', { id: conn.id, database, table }).catch(() => ({ indexes: [] })),
        ]).then(([cols, prev, idx]) => { if (alive) { setColumns(cols.columns); setPreview(prev); setIndexes(idx.indexes) } })
          .catch((e) => { if (alive) setError(e) })
        return () => { alive = false }
      }, [conn.id, database, table, previewPage])
      return h('div', { className: 'dbb-tableview' },
        h('div', { className: 'dbb-tableview-head' },
          h('span', { className: 'dbb-tableview-name' }, `${database}.${table}`),
          h('button', { className: 'dbb-btn', onClick: () => onOpenSql(database, table) }, t('table.openInSql')),
          conn.type === 'mysql' ? h('button', { className: 'dbb-btn', onClick: showDdl }, t('table.ddl')) : null,
        ),
        ddl !== null ? h('pre', { className: 'dbb-pre' }, ddl) : null,
        h(ErrorBar, { error: error?.message, onClose: () => setError(null), t }),
        columns
          ? h('div', { className: 'dbb-section' },
              h('div', { className: 'dbb-section-title' }, t('table.columns')),
              h('div', { className: 'dbb-grid-scroll dbb-cols' },
                h('table', { className: 'dbb-grid' },
                  h('thead', null, h('tr', null, ['', 'Name', 'Type', 'Null', 'Key', 'Default', 'Extra'].map((x, i) => h('th', { key: i }, x)))),
                  h('tbody', null, columns.map((c, i) =>
                    h('tr', { key: i },
                      h('td', { className: 'dbb-muted' }, i + 1),
                      h('td', null, c.name), h('td', null, c.type),
                      h('td', null, c.nullable ? 'YES' : 'NO'), h('td', null, c.key ?? ''),
                      h('td', null, c.default === null || c.default === undefined ? '' : String(c.default)),
                      h('td', null, c.extra ?? '')))),
                ),
              ),
            )
          : h('div', { className: 'dbb-muted' }, t('tree.loading')),
        indexes && indexes.length > 0
          ? h('div', { className: 'dbb-section' },
              h('div', { className: 'dbb-section-title' }, t('table.indexes')),
              h('div', { className: 'dbb-grid-scroll dbb-cols' },
                h('table', { className: 'dbb-grid' },
                  h('thead', null, h('tr', null, ['Name', 'Columns', 'Unique', 'Type'].map((x, i) => h('th', { key: i }, x)))),
                  h('tbody', null, indexes.map((idx, i) =>
                    h('tr', { key: i },
                      h('td', null, idx.name),
                      h('td', { title: idx.columns.join(', ') }, idx.columns.join(', ')),
                      h('td', null, idx.unique ? 'YES' : 'NO'),
                      h('td', null, idx.type ?? '')))),
                ),
              ),
            )
          : null,
        h('div', { className: 'dbb-section' },
          h('div', { className: 'dbb-section-title dbb-section-title-row' },
            t('table.preview'),
            h('span', { style: { flex: 1 } }),
            preview
              ? h('span', { className: 'dbb-page' },
                  h('button', { className: 'dbb-btn', onClick: () => setPreviewPage((x) => Math.max(0, x - 1)), disabled: previewPage === 0 }, '‹ ' + t('result.page.prev')),
                  h('span', { className: 'dbb-muted' }, fmt(t, 'result.page.range', { from: previewPage * 100 + 1, to: previewPage * 100 + (preview.rowCount ?? 0) }) + (preview.truncated ? ' +' : '')),
                  h('button', { className: 'dbb-btn', onClick: () => setPreviewPage((x) => x + 1), disabled: !preview.truncated }, t('result.page.next') + ' ›'),
                )
              : null,
          ),
          preview ? h(ResultGrid, { result: preview, t }) : h('div', { className: 'dbb-muted' }, t('tree.loading')),
        ),
      )
    }

    // ---------- Redis view ----------

    function RedisValue({ info, t }) {
      if (!info) return null
      if (info.exists === false) return h('div', { className: 'dbb-muted' }, '(key not found)')
      const meta = h('div', { className: 'dbb-result-meta' },
        `${t('redis.type')}: ${info.type} · ${t('redis.ttl')}: ${info.ttl >= 0 ? `${info.ttl}s` : t('redis.noTtl')}`,
        typeof info.length === 'number' ? ` · ${fmt(t, 'redis.length', { n: info.length })}` : '',
        info.truncated ? ` · ${t('redis.truncatedValue')}` : '',
      )
      let body
      if (info.type === 'string') {
        body = h('pre', { className: 'dbb-pre' }, String(info.value ?? ''))
      } else if (info.type === 'hash') {
        const entries = Object.entries(info.value ?? {})
        body = h('div', { className: 'dbb-grid-scroll' }, h('table', { className: 'dbb-grid' },
          h('thead', null, h('tr', null, [h('th', null, 'field'), h('th', null, 'value')])),
          h('tbody', null, entries.map(([k, v]) => h('tr', { key: k }, h('td', null, k), h('td', { title: String(v) }, String(v)))))))
      } else if (info.type === 'list') {
        body = h('div', { className: 'dbb-grid-scroll' }, h('table', { className: 'dbb-grid' },
          h('thead', null, h('tr', null, [h('th', null, '#'), h('th', null, 'value')])),
          h('tbody', null, (info.value ?? []).map((v, i) => h('tr', { key: i }, h('td', { className: 'dbb-muted' }, i), h('td', { title: String(v) }, String(v)))))))
      } else if (info.type === 'set') {
        body = h('div', { className: 'dbb-grid-scroll' }, h('table', { className: 'dbb-grid' },
          h('tbody', null, (info.value ?? []).map((v, i) => h('tr', { key: i }, h('td', { title: String(v) }, String(v)))))))
      } else if (info.type === 'zset') {
        body = h('div', { className: 'dbb-grid-scroll' }, h('table', { className: 'dbb-grid' },
          h('thead', null, h('tr', null, [h('th', null, 'member'), h('th', null, 'score')])),
          h('tbody', null, (info.value ?? []).map((e2, i) => h('tr', { key: i }, h('td', null, String(e2.member)), h('td', null, String(e2.score)))))))
      } else {
        body = h('pre', { className: 'dbb-pre' }, JSON.stringify(info.value, null, 2))
      }
      return h('div', null, meta, body)
    }

    const KEY_ROW_H = 25
    function VirtualKeyList({ keys, selected, openKey }) {
      const { ref, range, onScroll } = useWindowed(keys.length, KEY_ROW_H)
      return h('div', { className: 'dbb-key-window', ref, onScroll },
        h('div', { style: { height: keys.length * KEY_ROW_H, position: 'relative' } },
          keys.slice(range.start, range.end).map((k, i) => h('div', {
            key: range.start + i,
            className: 'dbb-key' + (k === selected ? ' dbb-key-active' : ''),
            style: { position: 'absolute', top: (range.start + i) * KEY_ROW_H, left: 0, right: 0, height: KEY_ROW_H },
            onClick: () => openKey(k), title: k,
          }, k)),
        ),
      )
    }

    function RedisView({ conn, t }) {
      const [pattern, setPattern] = useState('*')
      const patternRef = useRef(pattern)
      patternRef.current = pattern
      const [keys, setKeys] = useState(null)
      const [truncated, setTruncated] = useState(false)
      const [scanning, setScanning] = useState(false)
      const [error, setError] = useState(null)
      const [selected, setSelected] = useState(null)
      const [value, setValue] = useState(null)
      const [valueError, setValueError] = useState(null)
      const scan = useCallback(async () => {
        setScanning(true); setError(null)
        try {
          const r = await call('redis-keys', { id: conn.id, pattern: patternRef.current, limit: 1000 })
          setKeys(r.keys); setTruncated(r.truncated)
        } catch (e) { setError(e) } finally { setScanning(false) }
      }, [conn.id])
      // Scan once per selected connection; re-scanning is the Scan button's job.
      useEffect(() => { setKeys(null); setSelected(null); setValue(null); scan() }, [scan])

      const [dbsize, setDbsize] = useState(null)
      const reqSeq = useRef(0)
      useEffect(() => {
        let alive = true
        call('redis-dbsize', { id: conn.id }).then((r) => { if (alive) setDbsize(r.dbsize) }).catch(() => {})
        return () => { alive = false }
      }, [conn.id, keys])
      const openKey = useCallback(async (key) => {
        const req = ++reqSeq.current
        setSelected(key); setValue(null); setValueError(null)
        try {
          const v = await call('redis-get', { id: conn.id, key })
          if (req === reqSeq.current) setValue(v)
        } catch (e) { if (req === reqSeq.current) setValueError(e) }
      }, [conn.id])
      return h('div', { className: 'dbb-redis' },
        h('div', { className: 'dbb-sql-bar' },
          h('input', { className: 'dbb-input dbb-pattern', value: pattern, onChange: (e) => setPattern(e.target.value), placeholder: t('redis.pattern'), onKeyDown: (e) => { if (e.key === 'Enter') scan() } }),
          h('button', { className: 'dbb-btn dbb-btn-primary', onClick: scan, disabled: scanning }, scanning ? t('redis.scanning') : t('redis.scan')),
          dbsize !== null ? h('span', { className: 'dbb-muted' }, t('redis.dbsize') + ': ' + dbsize) : null,
        ),
        h(ErrorBar, { error: error?.message, onClose: () => setError(null), t }),
        h('div', { className: 'dbb-redis-body' },
          h('div', { className: 'dbb-redis-keys' },
            keys === null
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('redis.pattern') + ' · ' + t('redis.scan'))
              : [
                  h('div', { key: 'm', className: 'dbb-result-meta dbb-pad' }, fmt(t, 'redis.keys', { n: keys.length }) + (truncated ? ` (${t('result.truncated')})` : '')),
                  h(VirtualKeyList, { key: 'vl', keys, selected, openKey }),
                ],
          ),
          h('div', { className: 'dbb-redis-value' },
            selected === null
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('redis.selectKey'))
              : h('div', { className: 'dbb-pad dbb-redis-value-inner' },
                  h('div', { className: 'dbb-tableview-name' }, selected),
                  h(ErrorBar, { error: valueError?.message, onClose: () => setValueError(null), t }),
                  value ? h(RedisValue, { info: value, t }) : h('div', { className: 'dbb-muted' }, t('tree.loading')),
                ),
          ),
        ),
      )
    }

    // ---------- tree ----------

    function TreeNode({ depth, label, badge, trailing, expanded, loading, error, selected, onToggle, onClick, children, t }) {
      return h('div', null,
        h('div', {
          className: 'dbb-node' + (selected ? ' dbb-node-active' : ''),
          style: { paddingLeft: 8 + depth * 16 },
          onClick: onClick ?? onToggle,
        },
          onToggle
            ? h('span', { className: 'dbb-chevron', onClick: (e) => { e.stopPropagation(); onToggle() } }, loading ? '…' : expanded ? '▾' : '▸')
            : h('span', { className: 'dbb-chevron dbb-chevron-leaf' }, '·'),
          h('span', { className: 'dbb-node-label', title: label }, label),
          trailing ? h('span', { className: 'dbb-node-trailing', onClick: (e) => e.stopPropagation() }, trailing) : null,
          badge ?? null,
        ),
        error ? h('div', { className: 'dbb-node-err', style: { paddingLeft: 24 + depth * 16 } }, String(error), ' ',
          h('button', { className: 'dbb-link', onClick: onToggle }, t('tree.retry'))) : null,
        expanded ? children : null,
      )
    }

    /** Table list under one database node: filter box + display cap for huge schemas. */
    function TableItems({ items, renderItem, t }) {
      const [filter, setFilter] = useState('')
      const needle = filter.trim().toLowerCase()
      const filtered = needle ? items.filter((tb) => String(tb.name).toLowerCase().includes(needle)) : items
      const shown = filtered.slice(0, 500)
      return [
        items.length > 50
          ? h('input', { key: 'filter', className: 'dbb-input dbb-tree-filter', placeholder: t('tree.filter'), value: filter, onChange: (e) => setFilter(e.target.value) })
          : null,
        ...shown.map(renderItem),
        filtered.length > shown.length
          ? h('div', { key: 'more', className: 'dbb-muted dbb-node-err' }, fmt(t, 'tree.more', { total: filtered.length, shown: shown.length }))
          : null,
      ]
    }

    // ---------- panel ----------

    const CSS = `
.dbb-root{display:flex;flex-direction:column;height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;overflow:hidden}
.dbb-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dbb-title{font-size:16px;font-weight:600}
.dbb-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
.dbb-body{display:flex;flex:1;min-height:0}
.dbb-aside{width:250px;flex:none;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;background:var(--dsw-alias-bg-layer-1)}
.dbb-main{flex:1;min-width:0;overflow:auto;display:flex;flex-direction:column}
.dbb-node{display:flex;align-items:center;gap:4px;padding:5px 8px;cursor:pointer;white-space:nowrap;overflow:hidden}
.dbb-node:hover{background:var(--dsw-alias-bg-layer-2)}
.dbb-node-active{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dbb-chevron{width:14px;flex:none;color:var(--dsw-alias-label-secondary);text-align:center;cursor:pointer}
.dbb-chevron-leaf{opacity:.4}
.dbb-node-label{overflow:hidden;text-overflow:ellipsis}
.dbb-node-err{padding:2px 8px;color:var(--dsw-alias-state-error-primary);font-size:12px;word-break:break-all;white-space:normal}
.dbb-badge{flex:none;font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.dbb-conn-badge{display:inline-flex;align-items:center;gap:5px}
.dbb-node-trailing{display:none;align-items:center;gap:2px;margin-left:auto}
.dbb-node:hover .dbb-node-trailing{display:inline-flex}
.dbb-row-actions{display:inline-flex;gap:2px}
.dbb-icon-btn{border:none;background:none;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;padding:2px 4px;border-radius:4px;line-height:1}
.dbb-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dbb-icon-on{color:var(--dsw-alias-state-success-primary)}
.dbb-need-start{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 24px;font-size:12px}
.dbb-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dbb-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.dbb-dot-open{background:var(--dsw-alias-state-success-primary)}
.dbb-badge-redis{color:var(--dsw-alias-brand-primary)}
.dbb-actions{display:flex;gap:6px;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dbb-btn{padding:4px 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px}
.dbb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dbb-btn:disabled{opacity:.5;cursor:default}
.dbb-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.dbb-link{border:none;background:none;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:12px;padding:0 2px}
.dbb-input{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:5px 8px;font-size:12px;width:100%;box-sizing:border-box}
.dbb-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dbb-textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
.dbb-muted{color:var(--dsw-alias-label-secondary)}
.dbb-pad{padding:12px}
.dbb-error{margin:8px 12px;padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:6px;color:var(--dsw-alias-state-error-primary);word-break:break-all}
.dbb-error-title{font-weight:600}
.dbb-ok{margin:8px 0;padding:6px 10px;color:var(--dsw-alias-state-success-primary)}
.dbb-sql{display:flex;flex-direction:column;flex:1;min-height:0;padding:8px 12px;gap:8px;overflow:auto}
.dbb-sql-bar{display:flex;align-items:center;gap:8px}
.dbb-sql-editor{min-height:110px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.dbb-sql-editor:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dbb-grid-wrap{display:flex;flex-direction:column;gap:4px;min-height:0}
.dbb-grid-scroll{overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;max-height:46vh}
.dbb-grid{border-collapse:collapse;width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.dbb-grid th{position:sticky;top:0;background:var(--dsw-alias-bg-layer-2);text-align:left;padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.dbb-grid td{padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbb-grid tr:hover td{background:var(--dsw-alias-bg-layer-1)}
.dbb-null{color:var(--dsw-alias-label-secondary);font-style:italic}
.dbb-result-meta{color:var(--dsw-alias-label-secondary);font-size:12px}
.dbb-page{display:inline-flex;align-items:center;gap:6px}
.dbb-tree-filter{width:calc(100% - 32px);margin:2px 8px 4px 24px}
.dbb-page-size{display:inline-flex;align-items:center;gap:4px;font-size:12px}
.dbb-select-inline{width:auto;padding:2px 4px}
.dbb-section-title-row{display:flex;align-items:center;gap:8px}
.dbb-spacer td{height:0}
.dbb-grid td{height:26px}
.dbb-cols{max-height:30vh;margin-bottom:10px}
.dbb-tableview{padding:8px 12px;overflow:auto}
.dbb-tableview-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.dbb-tableview-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}
.dbb-section{margin-top:8px}
.dbb-section-title{font-weight:600;margin-bottom:6px}
.dbb-warn-text{color:var(--dsw-alias-state-warn-primary);font-size:12px}
.dbb-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000}
.dbb-modal{width:460px;max-height:86vh;overflow:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:16px}
.dbb-modal-title{font-size:15px;font-weight:600;margin-bottom:12px}
.dbb-modal-body{display:flex;flex-direction:column;gap:10px}
.dbb-field{display:flex;flex-direction:column;gap:4px}
.dbb-field-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dbb-field-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dbb-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dbb-modal-foot{display:flex;gap:8px;margin-top:14px;align-items:center}
.dbb-redis{display:flex;flex-direction:column;flex:1;min-height:0;padding:8px 12px;gap:8px;overflow:hidden}
.dbb-pattern{max-width:260px}
.dbb-redis-body{display:flex;flex:1;min-height:0;gap:10px}
.dbb-redis-keys{width:300px;flex:none;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;display:flex;flex-direction:column}
.dbb-key-window{flex:1;overflow:auto;position:relative}
.dbb-key{padding:4px 10px;cursor:pointer;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbb-key:hover{background:var(--dsw-alias-bg-layer-2)}
.dbb-key-active{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dbb-redis-value{flex:1;min-width:0;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px}
.dbb-redis-value-inner .dbb-grid-scroll{max-height:none;border:none;border-radius:0}
.dbb-pre{margin:8px 0;padding:8px;background:var(--dsw-alias-bg-layer-1);border-radius:6px;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-all}
.dbb-welcome{padding:40px 24px;color:var(--dsw-alias-label-secondary)}
.dbb-welcome h2{color:var(--dsw-alias-label-primary);margin:0 0 8px}
`

    function DbPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (props.locale?.t ?? ((k) => k))
      const [data, setData] = useState(null) // { connections, allowWrites, maxRows }
      const [fatal, setFatal] = useState(null)
      const [editing, setEditing] = useState(null) // null | {} | connection
      const [selected, setSelectedRaw] = useState(null) // {kind:'conn'|'table', ...}
      const restoredRef = useRef(false)
      const setSelected = (sel) => {
        viewState.selected = sel && { kind: sel.kind, id: sel.kind === 'conn' ? sel.id : sel.conn.id, database: sel.database, table: sel.table }
        setSelectedRaw(sel)
      }
      const [tree, setTree] = useState({}) // nodeKey -> {expanded, loading, error, items}
      const [openSql, setOpenSql] = useState(null) // {conn, database, table} force sql view

      const refresh = useCallback(async () => {
        try {
          const v = await loadConnections()
          setData(v); setFatal(null)
          // Re-resolve the selection against fresh connection objects.
          setSelectedRaw((sel) => {
            if (!sel) return sel
            const id = sel.conn?.id ?? sel.id
            const fresh = v.connections.find((c) => c.id === id)
            return fresh ? { ...sel, conn: fresh } : null
          })
        } catch (e) { setFatal(e) }
      }, [])

      useEffect(() => { refresh() }, [refresh])

      // Remount restore: jump back to the previously selected connection/table
      // once the fresh connection list arrives (data itself is always refetched).
      useEffect(() => {
        if (!data || restoredRef.current) return
        restoredRef.current = true
        const vs = viewState.selected
        if (!vs) return
        const conn = data.connections.find((c) => c.id === vs.id)
        if (!conn) return
        setSelectedRaw(vs.kind === 'table' ? { kind: 'table', conn, database: vs.database, table: vs.table } : { kind: 'conn', id: conn.id, conn })
      }, [data])

      const nodeKey = (...parts) => parts.join('￨')
      const patchTree = (key, patch) => setTree((m) => ({ ...m, [key]: { ...(m[key] ?? {}), ...patch } }))

      const loadDatabases = async (conn) => {
        const key = nodeKey('conn', conn.id)
        patchTree(key, { expanded: true, loading: true, error: null })
        try {
          const r = await call('list-databases', { id: conn.id })
          patchTree(key, { loading: false, items: r.databases })
        } catch (e) { patchTree(key, { loading: false, error: e.message }) }
      }
      const toggleDatabases = (conn) => {
        const key = nodeKey('conn', conn.id)
        const node = tree[key] ?? {}
        // A failed load keeps the node expanded; toggling then retries instead of collapsing.
        if (node.expanded && !node.error && !node.needStart) { patchTree(key, { expanded: false }); return }
        if (conn.status !== 'open') {
          // Manual-start model: expanding a stopped connection offers the start button.
          patchTree(key, { expanded: true, loading: false, error: null, needStart: true })
          return
        }
        loadDatabases(conn)
      }

      const loadTables = async (conn, database) => {
        const key = nodeKey('db', conn.id, database)
        patchTree(key, { expanded: true, loading: true, error: null })
        try {
          const r = await call('list-tables', { id: conn.id, database })
          patchTree(key, { loading: false, items: r.tables })
        } catch (e) { patchTree(key, { loading: false, error: e.message }) }
      }
      const toggleTables = (conn, database) => {
        const key = nodeKey('db', conn.id, database)
        const node = tree[key] ?? {}
        if (node.expanded && !node.error) { patchTree(key, { expanded: false }); return }
        loadTables(conn, database)
      }

      const [busyConn, setBusyConn] = useState(null)
      const toggleConn = async (conn) => {
        setBusyConn(conn.id)
        const key = nodeKey('conn', conn.id)
        try {
          if (conn.status === 'open') {
            await call('disconnect', { id: conn.id })
            patchTree(key, { expanded: false, items: null, error: null })
          } else {
            await call('connect', { id: conn.id })
          }
          await refresh()
          if (conn.status !== 'open') loadDatabases(conn)
        } catch (e) {
          patchTree(key, { loading: false, error: e.message })
          await refresh()
        } finally {
          setBusyConn(null)
        }
      }

      const removeConn = async (conn) => {
        if (!window.confirm(fmt(t, 'confirmDelete', { label: conn.label }))) return
        let callError = null
        try {
          await call('delete-connection', { id: conn.id })
        } catch (e) {
          // The delete restarts the Host plugin and may cut the response; the
          // readback below decides whether it actually went away.
          callError = e
        }
        try {
          const v = await loadConnections()
          setData(v); setFatal(null)
          if (v.connections.some((c) => c.id === conn.id)) {
            setFatal(callError ?? new Error(`delete-connection ${conn.id} did not apply`))
            return
          }
          setSelected((sel) => (sel && (sel.conn?.id ?? sel.id) === conn.id) ? null : sel)
        } catch (e) { setFatal(e) }
      }

      const verifySaved = async (id) => {
        // The config save restarts the Host plugin; give it a few chances.
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await new Promise((r) => setTimeout(r, 600))
          try {
            const v = await loadConnections()
            if (v.connections.some((c) => c.id === id)) {
              setData(v)
              setEditing(null)
              return true
            }
          } catch { /* plugin still restarting; retry */ }
        }
        return false
      }

      const renderConnectionNode = (conn) => {
        const key = nodeKey('conn', conn.id)
        const node = tree[key] ?? {}
        const isSql = conn.type !== 'redis'
        const sel = selected
        const connSelected = sel?.kind === 'conn' && sel.id === conn.id
        const trailing = h('span', { className: 'dbb-row-actions' },
          h('button', {
            className: 'dbb-icon-btn' + (conn.status === 'open' ? ' dbb-icon-on' : ''),
            title: conn.status === 'open' ? t('conn.stop') : t('conn.start'),
            disabled: busyConn === conn.id,
            onClick: () => toggleConn(conn),
          }, busyConn === conn.id ? '…' : '⏻'),
          h('button', {
            className: 'dbb-icon-btn', title: t('edit'),
            onClick: () => setEditing({ ...conn }),
          }, '✎'),
        )
        return h(TreeNode, {
          key: conn.id, depth: 0, label: conn.label, t,
          trailing,
          badge: h('span', { className: 'dbb-conn-badge' },
            h('span', { className: 'dbb-dot ' + (conn.status === 'open' ? 'dbb-dot-open' : ''), title: conn.status === 'open' ? 'open' : 'stopped' }),
            h(TypeBadge, { type: conn.type })),
          expanded: node.expanded, loading: node.loading, error: node.error,
          selected: connSelected,
          onToggle: isSql ? () => toggleDatabases(conn) : undefined,
          onClick: () => {
            setSelected({ kind: 'conn', id: conn.id, conn })
            setOpenSql(null)
            if (isSql && !(tree[key] ?? {}).expanded) toggleDatabases(conn)
          },
        }, isSql && node.expanded && node.needStart && conn.status !== 'open'
          ? h('div', { className: 'dbb-need-start' },
              h('span', { className: 'dbb-muted' }, t('conn.needStart')),
              h('button', { className: 'dbb-btn dbb-btn-primary', disabled: busyConn === conn.id, onClick: () => toggleConn(conn) }, busyConn === conn.id ? t('conn.starting') : '⏻ ' + t('conn.start')))
          : isSql && node.expanded && Array.isArray(node.items)
            ? node.items.map((db) => renderDatabaseNode(conn, db))
            : null)
      }

      const renderDatabaseNode = (conn, database) => {
        const key = nodeKey('db', conn.id, database)
        const node = tree[key] ?? {}
        return h(TreeNode, {
          key, depth: 1, label: database, t,
          expanded: node.expanded, loading: node.loading, error: node.error,
          onToggle: () => toggleTables(conn, database),
        }, node.expanded && Array.isArray(node.items)
          ? h(TableItems, {
              items: node.items, t,
              renderItem: (tb) => {
                const sel = selected
                const active = sel?.kind === 'table' && sel.conn.id === conn.id && sel.database === database && sel.table === tb.name
                return h(TreeNode, {
                  key: key + '￨' + tb.name, depth: 2, label: tb.name, t,
                  badge: tb.kind === 'view' ? h('span', { className: 'dbb-badge' }, 'view') : null,
                  selected: active,
                  onClick: () => { setSelected({ kind: 'table', conn, database, table: tb.name }); setOpenSql(null) },
                })
              },
            })
          : null)
      }

      const renderMain = () => {
        if (!selected) {
          return h('div', { className: 'dbb-welcome' },
            h('h2', null, t('welcome.title')),
            h('p', null, t('welcome.body')))
        }
        if (selected.kind === 'table') {
          return h(TableView, {
            key: `${selected.conn.id}/${selected.database}/${selected.table}`,
            conn: selected.conn, database: selected.database, table: selected.table, t,
            onOpenSql: (database, table) => {
              setOpenSql({ connId: selected.conn.id, database, table })
              setSelected({ kind: 'conn', id: selected.conn.id, conn: selected.conn })
            },
          })
        }
        const conn = selected.conn
        if (conn.type === 'redis') return h(RedisView, { key: conn.id, conn, t })
        return h(SqlPane, { key: conn.id, conn, seed: openSql, clearSeed: () => setOpenSql(null), allowWrites: data?.allowWrites === true, t })
      }

      return h('div', { className: 'dbb-root' },
        h('style', null, CSS),
        h('div', { className: 'dbb-head' },
          h('span', { className: 'dbb-title' }, t('panel')),
          h('span', { className: 'dbb-sub' }, t('header.subtitle')),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dbb-btn', onClick: refresh }, t('refresh')),
        ),
        h(ErrorBar, { error: fatal?.message, onClose: () => setFatal(null), t }),
        h('div', { className: 'dbb-body' },
          h('div', { className: 'dbb-aside' },
            h('div', { className: 'dbb-actions' },
              h('button', { className: 'dbb-btn dbb-btn-primary', onClick: () => setEditing({}) }, '+ ' + t('newConnection'))),
            data === null && fatal === null
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('tree.loading'))
              : null,
            data && data.connections.length === 0
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('emptyConnections'))
              : null,
            (data?.connections ?? []).map((conn) =>
              h('div', { key: conn.id, className: 'dbb-conn' },
                renderConnectionNode(conn),
              )),
          ),
          h('div', { className: 'dbb-main' }, renderMain()),
        ),
        editing !== null
          ? h(ConnectionForm, {
              initial: editing && editing.id ? editing : null,
              t,
              onClose: () => setEditing(null),
              onDelete: async (conn) => { setEditing(null); await removeConn(conn) },
              onSaved: async (id) => {
                setEditing(null)
                try {
                  const v = await loadConnections()
                  setData(v); setFatal(null)
                  const saved = v.connections.find((c) => c.id === id)
                  if (saved) setSelected({ kind: 'conn', id: saved.id, conn: saved })
                } catch { await refresh() }
              },
              onSaveUncertain: verifySaved,
            })
          : null,
      )
    }

    /** One component owns the SQL editor; see SqlPane above. */

    return {
      name: 'db-browser',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'db-browser: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          label: () => t('panel'),
        }, DbPanelIcon)), 'db-browser: panel icon')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, DbPanel)), 'db-browser: main panel')
      },
    }
  },
})
