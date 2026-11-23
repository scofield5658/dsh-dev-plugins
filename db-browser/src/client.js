import { BaseTable, features, useTablePipeline } from '@guozhi5658/srp-table'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'

// srp-table ships light-theme defaults; every color maps onto the host theme tokens instead.
const TABLE_THEME = {
  '--color': 'var(--dsw-alias-label-primary)',
  '--bgcolor': 'var(--dsw-alias-bg-base)',
  '--hover-bgcolor': 'var(--dsw-alias-bg-layer-1)',
  '--highlight-bgcolor': 'var(--dsw-alias-bg-layer-2)',
  '--header-color': 'var(--dsw-alias-label-primary)',
  '--header-bgcolor': 'var(--dsw-alias-bg-layer-2)',
  '--header-hover-bgcolor': 'var(--dsw-alias-bg-layer-2)',
  '--header-highlight-bgcolor': 'var(--dsw-alias-bg-layer-2)',
  '--border-color': 'var(--dsw-alias-border-l1)',
  '--cell-border-vertical': 'none',
  '--header-cell-border-vertical': 'none',
  '--row-height': '26px',
  '--header-row-height': '28px',
  '--cell-padding': '4px 10px',
  '--font-size': '12px',
  '--line-height': '18px',
}
const RESIZE_HANDLE = 'color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent)'

function readStoredNumber(key, fallback, min, max) {
  try {
    const saved = Number(globalThis.localStorage?.getItem(key))
    if (Number.isFinite(saved) && saved >= min && saved <= max) return saved
  } catch { /* storage unavailable */ }
  return fallback
}

export function hostsToText(hosts) {
  return (hosts ?? []).map((x) => `${x.host}:${x.port}`).join(', ')
}

export function textToHosts(text) {
  return String(text ?? '')
    .split(/[,;\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.lastIndexOf(':')
      if (idx > 0 && /^\d+$/.test(part.slice(idx + 1))) {
        return { host: part.slice(0, idx).trim(), port: Number(part.slice(idx + 1)) }
      }
      return { host: part }
    })
}

/** Redis INFO keyspace -> the non-empty logical databases, ordered by index. */
function parseRedisKeyspace(info) {
  const section = info?.sections?.keyspace ?? {}
  const dbs = []
  for (const [name, raw] of Object.entries(section)) {
    const match = /^db(\d+)$/.exec(name)
    if (!match) continue
    const keys = /keys=(\d+)/.exec(String(raw))
    dbs.push({ name, index: Number(match[1]), keys: keys ? Number(keys[1]) : 0 })
  }
  return dbs.sort((a, b) => a.index - b.index)
}

export function factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

    const NS = 'db-browser'
    const PANEL_ID = 'database'
    const ROUTE = '/db-browser/'

    const zh = {
      'panel': '数据库',
      'loadMore': '加载更多',
      'header.subtitle': '连接、浏览并查询数据库',
      'newConnection': '新建连接',
      'refresh': '刷新',
      'edit': '编辑',
      'copy': '复制连接',
      'copy.suffix': '副本',
      'conn.start': '启动',
      'conn.stop': '停止',
      'conn.starting': '连接中…',
      'conn.needStart': '连接未启动',
      'conn.dragHint': '拖动调整连接顺序',
      'aside.resizeHint': '拖动调整列表宽度，双击恢复默认',
      'redis.keyspaceEmpty': '该实例还没有键',
      'redis.keyCount': '{n} 个键',
      'form.delete': '删除连接',
      'delete': '删除',
      'test': '测试连接',
      'save': '保存',
      'cancel': '取消',
      'emptyConnections': '还没有连接。点击「新建连接」添加 MySQL / TDSQL / GoldenDB / PostgreSQL / Oracle / Redis。',
      'confirmDelete': '确定删除连接「{label}」吗？其密码会一并移除。',
      'form.titleNew': '新建连接',
      'form.titleEdit': '编辑连接',
      'form.titleDuplicate': '复制连接',
      'form.id': '标识 (id)',
      'form.idHint': '字母、数字、_ . -，保存后不可改；Agent 用它指定连接',
      'form.label': '名称',
      'form.type': '类型',
      'form.mode': '部署模式',
      'form.mode.standalone': '单机',
      'form.mode.sentinel': '哨兵 Sentinel',
      'form.mode.cluster': '集群 Cluster',
      'form.hosts': '主机列表',
      'form.hostsHint': '多个 host:port 用英文逗号分隔，按顺序故障切换。哨兵模式填 Sentinel 地址',
      'form.user': '用户名',
      'form.password': '密码',
      'form.passwordKeep': '留空则保持已保存的密码',
      'form.passwordClear': '清除已保存的密码',
      'form.poolMax': '连接池大小',
      'form.poolMaxHint': '这个连接的池上限，1–50。面板和 Agent 共用。不填则用插件默认值。',
      'form.allowWrites': '允许写入',
      'form.allowWritesHint': '关闭时这个连接只读。不单独设置时跟随插件的 allowWrites。',
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
      'result.kind.query': '查询结果',
      'result.kind.plan': '执行计划',
      'result.kind.catalog': '语句结果',
      'result.kind.write': '执行完成',
      'tab.close': '关闭标签',
      'tab.empty': '从左侧打开一个连接。每个连接同时只保留一个标签。',
      'table.columns': '列',
      'table.indexes': '索引',
      'table.preview': '预览数据',
      'table.openInSql': '在 SQL 中查询',
      'table.ddl': 'DDL',
      'redis.pattern': '键模式，例如 prefix*',
      'redis.scanHint': '输入 glob 模式后扫描，例如 prefix*。连接后不会扫描全部键。',
      'redis.view.text': '文本',
      'redis.view.json': 'JSON',
      'redis.view.jsonInvalid': '不是合法 JSON，显示原始文本。',
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
      'tab.sql': 'SQL',
      'tab.routines': '存储过程',
      'routine.schema': '模式 / 数据库',
      'routine.refresh': '刷新',
      'routine.empty': '该模式下没有存储过程或函数',
      'routine.select': '从列表中选择一个对象查看定义',
      'routine.args': '参数（JSON 数组，按声明顺序，例如 ["1001", "test"]）',
      'routine.call': '执行',
      'routine.calling': '执行中…',
      'routine.done': '执行成功',
      'routine.needWrites': '执行存储过程可能修改数据，需要在插件配置中开启 allowWrites',
      'routine.onlyProcedure': '只有独立存储过程（procedure）支持在此执行',
      'routine.loading': '加载中…',
      'grid.region': '结果表格（聚焦后可用方向键滚动）',
      'grid.null': 'NULL',
      'cols.name': '列名',
      'cols.type': '类型',
      'cols.null': '可空',
      'cols.yes': '是',
      'cols.no': '否',
      'cols.key': '键',
      'cols.default': '默认值',
      'cols.extra': '额外信息',
      'idx.columns': '包含列',
      'idx.unique': '唯一',
      'redis.kv.field': '字段',
      'redis.kv.value': '值',
      'redis.kv.member': '成员',
      'redis.kv.score': '分值',
      'redis.keyNotFound': '（键不存在）',
      'conn.status.open': '已启动',
      'conn.status.stopped': '未启动',
      'form.aclOptional': '（ACL，可选）',
    }
    const en = {
      'panel': 'Database',
      'loadMore': 'Load more',
      'header.subtitle': 'Connect, browse, and query databases',
      'newConnection': 'New connection',
      'refresh': 'Refresh',
      'edit': 'Edit',
      'copy': 'Duplicate connection',
      'copy.suffix': 'copy',
      'conn.start': 'Start',
      'conn.stop': 'Stop',
      'conn.starting': 'Connecting…',
      'conn.needStart': 'Connection stopped',
      'conn.dragHint': 'Drag to reorder connections',
      'aside.resizeHint': 'Drag to resize the list; double-click to reset',
      'redis.keyspaceEmpty': 'No keys in this instance yet',
      'redis.keyCount': '{n} keys',
      'form.delete': 'Delete connection',
      'delete': 'Delete',
      'test': 'Test connection',
      'save': 'Save',
      'cancel': 'Cancel',
      'emptyConnections': 'No connections yet. Use "New connection" to add MySQL / TDSQL / GoldenDB / PostgreSQL / Oracle / Redis.',
      'confirmDelete': 'Delete connection "{label}"? Its stored password is removed too.',
      'form.titleNew': 'New connection',
      'form.titleEdit': 'Edit connection',
      'form.titleDuplicate': 'Duplicate connection',
      'form.id': 'Identifier (id)',
      'form.idHint': 'Letters, digits, _ . -; fixed after saving; the agent references connections by it',
      'form.label': 'Name',
      'form.type': 'Type',
      'form.mode': 'Deployment mode',
      'form.mode.standalone': 'Standalone',
      'form.mode.sentinel': 'Sentinel',
      'form.mode.cluster': 'Cluster',
      'form.hosts': 'Hosts',
      'form.hostsHint': 'Comma-separated host:port entries. Multiple hosts fail over in order. Sentinel mode: sentinel addresses',
      'form.user': 'User',
      'form.password': 'Password',
      'form.passwordKeep': 'Leave empty to keep the saved password',
      'form.passwordClear': 'Remove the saved password',
      'form.poolMax': 'Pool size',
      'form.poolMaxHint': 'Pool limit for this connection, 1–50, shared by the panel and the agent. Leave empty to use the plugin default.',
      'form.allowWrites': 'Allow writes',
      'form.allowWritesHint': 'Off keeps this connection read-only. When unset, the connection follows the plugin allowWrites setting.',
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
      'result.kind.query': 'Query result',
      'result.kind.plan': 'Execution plan',
      'result.kind.catalog': 'Statement result',
      'result.kind.write': 'Completed',
      'tab.close': 'Close tab',
      'tab.empty': 'Open a connection on the left. Each connection keeps at most one tab.',
      'table.columns': 'Columns',
      'table.indexes': 'Indexes',
      'table.preview': 'Data preview',
      'table.openInSql': 'Query in SQL editor',
      'table.ddl': 'DDL',
      'redis.pattern': 'Key pattern, for example prefix*',
      'redis.scanHint': 'Enter a glob pattern, then scan. Example: prefix*. Connecting does not scan every key.',
      'redis.view.text': 'Text',
      'redis.view.json': 'JSON',
      'redis.view.jsonInvalid': 'Not valid JSON; showing raw text.',
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
      'tab.sql': 'SQL',
      'tab.routines': 'Routines',
      'routine.schema': 'Schema / database',
      'routine.refresh': 'Refresh',
      'routine.empty': 'No stored procedures or functions in this schema',
      'routine.select': 'Pick an object on the left to view its definition',
      'routine.args': 'Arguments (JSON array, in declaration order, e.g. ["1001", "test"])',
      'routine.call': 'Execute',
      'routine.calling': 'Executing…',
      'routine.done': 'Executed successfully',
      'routine.needWrites': 'Executing a routine can modify data; enable allowWrites in the plugin config first',
      'routine.onlyProcedure': 'Only standalone procedures can be executed here',
      'routine.loading': 'Loading…',
      'grid.region': 'Data grid (scroll with arrow keys when focused)',
      'grid.null': 'NULL',
      'cols.name': 'Name',
      'cols.type': 'Type',
      'cols.null': 'Null',
      'cols.yes': 'Yes',
      'cols.no': 'No',
      'cols.key': 'Key',
      'cols.default': 'Default',
      'cols.extra': 'Extra',
      'idx.columns': 'Columns',
      'idx.unique': 'Unique',
      'redis.kv.field': 'field',
      'redis.kv.value': 'value',
      'redis.kv.member': 'member',
      'redis.kv.score': 'score',
      'redis.keyNotFound': '(key not found)',
      'conn.status.open': 'open',
      'conn.status.stopped': 'stopped',
      'form.aclOptional': '(ACL, optional)',
    }

    // Remount keeps the user's place, not server data.
    const viewState = { tabs: [], activeId: null, views: {} }

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

    function fmt(t, key, vars) {
      try { return t(key, vars) } catch { /* fall through */ }
      let s = t(key)
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
      return s
    }

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

    function DbPanelIcon({ size }) {
      const s = size ?? 16
      return h('svg', { width: s, height: s, viewBox: '0 0 36 36', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M18 5c-5.5 0-10 1.7-10 4v18c0 2.3 4.5 4 10 4s10-1.7 10-4V9c0-2.3-4.5-4-10-4z', fill: 'currentColor', opacity: 0.9 }),
        h('ellipse', { cx: 18, cy: 9, rx: 10, ry: 4, fill: 'currentColor' }),
        h('ellipse', { cx: 18, cy: 9, rx: 7.2, ry: 2.6, fill: 'var(--dsw-alias-bg-base)' }),
        h('path', { d: 'M8 15.2c1.6 1.8 5.6 2.8 10 2.8s8.4-1 10-2.8M8 23.2c1.6 1.8 5.6 2.8 10 2.8s8.4-1 10-2.8', stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.6, fill: 'none' }),
      )
    }

    const FAMILY = {
      mysql: 'mysql', 'tdsql-mysql': 'mysql', goldendb: 'mysql',
      postgres: 'postgres', 'tdsql-pg': 'postgres',
      oracle: 'oracle', redis: 'redis',
    }
    const TYPE_OPTIONS = [
      ['mysql', 'MySQL'],
      ['tdsql-mysql', 'TDSQL (MySQL)'],
      ['goldendb', 'GoldenDB'],
      ['postgres', 'PostgreSQL'],
      ['tdsql-pg', 'TDSQL (PG)'],
      ['oracle', 'Oracle'],
      ['redis', 'Redis'],
    ]
    const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS)
    const FAMILY_PORT = { mysql: 3306, postgres: 5432, oracle: 1521 }
    function hostsPlaceholder(type, mode) {
      const port = type === 'redis'
        ? (mode === 'sentinel' ? 26379 : 6379)
        : (FAMILY_PORT[FAMILY[type]] ?? 3306)
      return `10.0.0.1:${port}, 10.0.0.2:${port}`
    }

    function TypeBadge({ type }) {
      return h('span', { className: `dbb-badge dbb-badge-${FAMILY[type] ?? type}` }, TYPE_LABELS[type] ?? type)
    }

    function ErrorBar({ error, onClose, t }) {
      if (!error) return null
      return h('div', { className: 'dbb-error', role: 'alert' },
        h('span', { className: 'dbb-error-title' }, t('error.title') + ': '),
        h('span', null, String(error)),
        onClose ? h('button', { className: 'dbb-link', onClick: onClose }, t('close')) : null,
      )
    }

    function resultSummary(result, t) {
      const parts = []
      if (result.statementKind) parts.push(t(`result.kind.${result.statementKind}`))
      if (typeof result.tookMs === 'number') parts.push(fmt(t, 'result.took', { ms: result.tookMs }))
      if (typeof result.affectedRows === 'number' && (!result.columns || result.columns.length === 0)) {
        parts.push(fmt(t, 'result.affected', { n: result.affectedRows }))
      } else {
        parts.push(fmt(t, 'result.rows', { n: result.rowCount ?? (result.rows ?? []).length }))
        if (result.truncated) parts.push(t('result.truncated'))
      }
      return parts.join(' · ')
    }

    function cellText(row, column, index) {
      const cell = Array.isArray(row) ? row[index] : row?.[column]
      if (cell === null || cell === undefined) return null
      return typeof cell === 'object' ? JSON.stringify(cell) : String(cell)
    }

    function ResultGrid({ result, t }) {
      if (!result) return null
      const columns = result.columns ?? []
      const allRows = result.rows ?? []
      const planText = result.statementKind === 'plan'
        ? allRows.map((row) => columns.map((column, index) => cellText(row, column, index)).filter((text) => text !== null).join('\t')).join('\n')
        : ''
      const copyCsv = () => {
        const esc = (v) => {
          const s = v === null || v === undefined ? '' : String(v)
          return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
        }
        const text = [columns.map(esc).join(','), ...allRows.map((row) => columns.map((_, ci) => esc(Array.isArray(row) ? row[ci] : row?.[columns[ci]])).join(','))].join('\n')
        navigator.clipboard?.writeText(text).catch(() => {})
      }
      const wide = result.statementKind === 'plan' || result.statementKind === 'catalog'
      return h('div', { className: 'dbb-grid-wrap' },
        h('div', { className: 'dbb-result-meta' },
          resultSummary(result, t),
          ' ',
          allRows.length > 0 ? h('button', { className: 'dbb-link', onClick: copyCsv }, t('result.copyCsv')) : null,
        ),
        planText && columns.length <= 2
          ? h('pre', { className: 'dbb-pre dbb-plan' }, planText)
          : null,
        columns.length === 0
          ? (typeof result.affectedRows === 'number' ? null : h('div', { className: 'dbb-muted' }, t('result.empty')))
          : h(VirtualGrid, { columns, rows: allRows, t, wide, label: t('grid.region') }),
      )
    }

    const GRID_ROW_H = 27
    function VirtualGrid({ columns, rows, wide, label, t }) {
      const gridColumns = useMemo(() => columns.map((column, index) => ({
        name: String(column),
        value: (row) => cellText(row, column, index) ?? t('grid.null'),
        cellProps: (row) => {
          const text = cellText(row, column, index)
          return text === null ? { className: 'dbb-null' } : { title: text }
        },
      })), [columns, t])
      return h(DataTable, { columns: gridColumns, rows, wide, label, empty: t('result.empty') })
    }

    function ConnectionForm({ initial, defaults, onClose, onSaved, onDelete, onSaveUncertain, t }) {
      const isEdit = Boolean(initial?.id)
      // A prefilled object without id is a duplicate: id is fixed after save, and the panel never has the password.
      const isDuplicate = Boolean(initial) && !isEdit
      const dialogRef = useRef(null)
      const onCloseRef = useRef(onClose)
      onCloseRef.current = onClose
      useEffect(() => {
        const dlg = dialogRef.current
        if (!dlg) return
        if (!dlg.open) dlg.showModal()
        const syncClose = () => onCloseRef.current()
        dlg.addEventListener('close', syncClose)
        // The dialog is the target of clicks on its own padding, so hit-test the rect.
        // Browsers with closedBy already dismiss outside clicks.
        let pressedOutside = false
        const outside = (e) => {
          const r = dlg.getBoundingClientRect()
          return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
        }
        const onDown = (e) => { pressedOutside = outside(e) }
        const onUp = (e) => {
          if ('closedBy' in HTMLDialogElement.prototype) return
          if (pressedOutside && outside(e)) dlg.close()
        }
        dlg.addEventListener('pointerdown', onDown)
        dlg.addEventListener('pointerup', onUp)
        return () => {
          dlg.removeEventListener('close', syncClose)
          dlg.removeEventListener('pointerdown', onDown)
          dlg.removeEventListener('pointerup', onUp)
        }
      }, [])
      const closeDialog = useCallback(() => {
        const dlg = dialogRef.current
        if (dlg?.open) dlg.close()
        else onCloseRef.current()
      }, [])
      const pluginPool = Number.isInteger(defaults?.poolMax) ? defaults.poolMax : 4
      const pluginWrites = defaults?.allowWrites === true
      const [draft, setDraft] = useState(() => {
        const base = initial ?? { type: 'mysql', mode: 'standalone' }
        return {
          ...base,
          poolMax: Number.isInteger(base.poolMax) ? base.poolMax : pluginPool,
          allowWrites: typeof base.allowWrites === 'boolean' ? base.allowWrites : pluginWrites,
        }
      })
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
          poolMax: draft.poolMax,
          allowWrites: draft.allowWrites === true,
        }
        if (c.type === 'redis') {
          c.mode = draft.mode ?? 'standalone'
          if (draft.masterName) c.masterName = draft.masterName
          if (draft.db !== undefined && draft.db !== '') c.db = Number(draft.db)
          if (draft.username) c.username = draft.username
        } else {
          c.user = draft.user ?? ''
          const family = FAMILY[c.type]
          if (family === 'mysql' || family === 'postgres') { if (draft.database) c.database = draft.database }
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
          // Saving restarts the Host plugin and can drop this response after the row was stored.
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
      return h('dialog', {
          className: 'dbb-modal', ref: dialogRef, closedby: 'any',
          'aria-labelledby': 'dbb-conn-form-title',
        },
          h('div', { className: 'dbb-modal-title', id: 'dbb-conn-form-title' }, isEdit ? t('form.titleEdit') : isDuplicate ? t('form.titleDuplicate') : t('form.titleNew')),
          h('div', { className: 'dbb-modal-body' },
            field('form.type', h('select', {
              className: 'dbb-input', value: draft.type,
              onChange: (e) => setDraft((d) => ({ ...d, type: e.target.value })),
            }, TYPE_OPTIONS.map(([v, label]) => h('option', { key: v, value: v }, label)))),
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
              placeholder: hostsPlaceholder(draft.type, draft.mode),
              onChange: (e) => setDraft((d) => ({ ...d, hostsText: e.target.value })),
            }), 'form.hostsHint'),
            draft.type === 'redis' && draft.mode === 'sentinel' ? field('form.masterName', input(draft.masterName, set('masterName'), { placeholder: 'mymaster' })) : null,
            draft.type !== 'redis' ? field('form.user', input(draft.user, set('user'), { autoComplete: 'off' })) : null,
            FAMILY[draft.type] === 'mysql' || FAMILY[draft.type] === 'postgres' ? field('form.database', input(draft.database, set('database'), { placeholder: FAMILY[draft.type] === 'postgres' ? 'postgres' : '' })) : null,
            draft.type === 'oracle' ? field('form.serviceName', input(draft.serviceName, set('serviceName'), { placeholder: 'ORCLPDB1' })) : null,
            draft.type === 'oracle' ? field('form.sid', input(draft.sid, set('sid'), { placeholder: 'ORCL' })) : null,
            draft.type === 'oracle' ? field('form.connectString', input(draft.connectString, set('connectString'), { placeholder: '(DESCRIPTION=…)' })) : null,
            draft.type === 'redis' ? field('form.dbIndex', input(draft.db ?? 0, (v) => setDraft((d) => ({ ...d, db: v })), { type: 'number', min: 0 })) : null,
            draft.type === 'redis' ? field('form.user', input(draft.username, set('username'), { placeholder: t('form.aclOptional') })) : null,
            field('form.poolMax', input(draft.poolMax ?? '', (v) => setDraft((d) => ({ ...d, poolMax: v })), { type: 'number', min: 1, max: 50 }), 'form.poolMaxHint'),
            h('label', { className: 'dbb-check' },
              h('input', {
                type: 'checkbox',
                checked: draft.allowWrites === true,
                onChange: (e) => setDraft((d) => ({ ...d, allowWrites: e.target.checked })),
              }),
              h('span', null, t('form.allowWrites'))),
            h('span', { className: 'dbb-field-hint' }, t('form.allowWritesHint')),
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
            isEdit ? h('button', { type: 'button', className: 'dbb-btn dbb-btn-danger', disabled: busy !== null, onClick: () => onDelete(initial) }, t('form.delete')) : null,
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', className: 'dbb-btn', onClick: closeDialog, disabled: busy !== null }, t('cancel')),
            h('button', { type: 'button', className: 'dbb-btn', onClick: () => run('test'), disabled: busy !== null }, busy === 'test' ? t('form.testing') : t('test')),
            h('button', { type: 'button', className: 'dbb-btn dbb-btn-primary', onClick: () => run('save'), disabled: busy !== null }, busy === 'save' ? '…' : t('save')),
          ),
      )
    }

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
      useEffect(() => {
        if (!seed || seed.connId !== conn.id) return
        const family = FAMILY[conn.type]
        const statement = family === 'oracle'
          ? `SELECT * FROM (SELECT * FROM "${String(seed.database).replace(/"/g, '""')}"."${String(seed.table).replace(/"/g, '""')}") WHERE ROWNUM <= 100`
          : family === 'postgres'
            ? `SELECT * FROM "${String(seed.database).replace(/"/g, '""')}"."${String(seed.table).replace(/"/g, '""')}" LIMIT 100`
            : `SELECT * FROM \`${String(seed.database).replace(/`/g, '``')}\`.\`${String(seed.table).replace(/`/g, '``')}\` LIMIT 100`
        setSql(statement)
        runRef.current(statement)
        clearSeed?.()
      }, [seed, conn.id, conn.type])
      return h('div', { className: 'dbb-sql' },
        h('div', { className: 'dbb-sql-bar' },
          h('span', { className: allowWrites ? 'dbb-warn-text' : 'dbb-muted' }, allowWrites ? t('sql.writable') : t('sql.readonly')),
          h('span', { style: { flex: 1 } }),
          result && result.pageable !== false && result.columns?.length > 0
            ? h('span', { className: 'dbb-page' },
                h('button', { className: 'dbb-btn', onClick: () => run(undefined, page - 1), disabled: running || page === 0 }, '‹ ' + t('result.page.prev')),
                h('span', { className: 'dbb-muted' }, fmt(t, 'result.page.range', { from: page * pageSize + 1, to: page * pageSize + (result.rowCount ?? 0) }) + (result.truncated ? ' +' : '')),
                h('button', { className: 'dbb-btn', onClick: () => run(undefined, page + 1), disabled: running || !result.truncated }, t('result.page.next') + ' ›'),
              )
            : null,
          result?.pageable === false
            ? null
            : h('label', { className: 'dbb-muted dbb-page-size' }, t('result.page.size') + ' ',
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
      const [nonce, setNonce] = useState(0)
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
      }, [conn.id, database, table, previewPage, nonce])
      return h('div', { className: 'dbb-tableview' },
        h('div', { className: 'dbb-tableview-head' },
          h('span', { className: 'dbb-tableview-name' }, `${database}.${table}`),
          h('button', { className: 'dbb-btn', onClick: () => onOpenSql(database, table) }, t('table.openInSql')),
          conn.features?.showCreate ? h('button', { className: 'dbb-btn', onClick: showDdl }, t('table.ddl')) : null,
        ),
        ddl !== null ? h('pre', { className: 'dbb-pre' }, ddl) : null,
        h(ErrorBar, { error: error?.message, onClose: () => setError(null), t }),
        error ? h('div', null, h('button', { className: 'dbb-btn', onClick: () => setNonce((n) => n + 1) }, t('tree.retry'))) : null,
        columns
          ? h('div', { className: 'dbb-section' },
              h('div', { className: 'dbb-section-title' }, t('table.columns')),
              h(DataTable, {
                className: 'dbb-cols',
                columns: [
                  { name: '', width: 48, value: (_, i) => i + 1, cellProps: () => ({ className: 'dbb-muted' }) },
                  { name: t('cols.name'), value: (c) => c.name },
                  { name: t('cols.type'), value: (c) => c.type },
                  { name: t('cols.null'), width: 80, value: (c) => (c.nullable ? t('cols.yes') : t('cols.no')) },
                  { name: t('cols.key'), width: 80, value: (c) => c.key ?? '' },
                  { name: t('cols.default'), value: (c) => (c.default === null || c.default === undefined ? '' : String(c.default)) },
                  { name: t('cols.extra'), value: (c) => c.extra ?? '' },
                ],
                rows: columns,
                rowKey: 'name',
                label: t('table.columns'),
                empty: t('result.empty'),
              }),
            )
          : (error ? null : h('div', { className: 'dbb-muted' }, t('tree.loading'))),
        indexes && indexes.length > 0
          ? h('div', { className: 'dbb-section' },
              h('div', { className: 'dbb-section-title' }, t('table.indexes')),
              h(DataTable, {
                className: 'dbb-cols',
                columns: [
                  { name: t('cols.name'), value: (idx) => idx.name },
                  { name: t('idx.columns'), width: 240, value: (idx) => idx.columns.join(', '), cellProps: (idx) => ({ title: idx.columns.join(', ') }) },
                  { name: t('idx.unique'), width: 80, value: (idx) => (idx.unique ? t('cols.yes') : t('cols.no')) },
                  { name: t('cols.type'), value: (idx) => idx.type ?? '' },
                ],
                rows: indexes,
                rowKey: 'name',
                label: t('table.indexes'),
                empty: t('result.empty'),
              }),
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
          preview ? h(ResultGrid, { result: preview, t }) : (error ? null : h('div', { className: 'dbb-muted' }, t('tree.loading'))),
        ),
      )
    }

    function RoutinesView({ conn, allowWrites, t }) {
      const [schemas, setSchemas] = useState(null)
      const [schema, setSchema] = useState(null)
      const [routines, setRoutines] = useState(null)
      const [listError, setListError] = useState(null)
      const [selected, setSelected] = useState(null) // { name, kind, detail }
      const [source, setSource] = useState(null)
      const [sourceError, setSourceError] = useState(null)
      const [argsText, setArgsText] = useState('')
      const [calling, setCalling] = useState(false)
      const [callOutcome, setCallOutcome] = useState(null)
      const reqSeq = useRef(0)
      const [nonce, setNonce] = useState(0)

      useEffect(() => {
        let alive = true
        setSchemas(null); setSchema(null); setRoutines(null); setSelected(null); setSource(null); setListError(null)
        call('list-databases', { id: conn.id })
          .then((r) => {
            if (!alive) return
            setSchemas(r.databases)
            const first = conn.database && r.databases.includes(conn.database) ? conn.database : r.databases[0]
            if (first) setSchema(first)
          })
          .catch((e) => { if (alive) setListError(e) })
        return () => { alive = false }
      }, [conn.id, nonce])

      const loadRoutines = useCallback(async (schemaName) => {
        if (!schemaName) return
        setRoutines(null); setListError(null); setSelected(null); setSource(null); setCallOutcome(null)
        try {
          const r = await call('list-routines', { id: conn.id, database: schemaName })
          setRoutines(r.routines)
        } catch (e) { setListError(e); setRoutines([]) }
      }, [conn.id])

      useEffect(() => { if (schema) loadRoutines(schema) }, [schema, loadRoutines])

      const openRoutine = useCallback(async (routine) => {
        const req = ++reqSeq.current
        setSelected(routine); setSource(null); setSourceError(null); setCallOutcome(null); setArgsText('')
        try {
          const r = await call('routine-source', { id: conn.id, database: schema, object: routine.name, kind: routine.kind })
          if (req === reqSeq.current) setSource(r.ddl)
        } catch (e) { if (req === reqSeq.current) setSourceError(e) }
      }, [conn.id, schema])

      const callRoutine = async () => {
        if (calling || !selected) return
        let args = []
        if (argsText.trim() !== '') {
          try {
            args = JSON.parse(argsText)
            if (!Array.isArray(args)) throw new Error('not an array')
          } catch {
            setCallOutcome({ ok: false, text: `${t('routine.args')}` })
            return
          }
        }
        setCalling(true); setCallOutcome(null)
        try {
          const r = await call('call-routine', { id: conn.id, database: schema, object: selected.name, args: args.map(String) })
          const rows = r.rowCount > 0 ? ` · ${fmt(t, 'result.rows', { n: r.rowCount })}` : ''
          setCallOutcome({ ok: true, text: `${t('routine.done')} · ${fmt(t, 'result.took', { ms: r.tookMs })}${rows}` })
        } catch (e) {
          setCallOutcome({ ok: false, text: e.message })
        } finally {
          setCalling(false)
        }
      }

      const callable = allowWrites && selected?.kind === 'procedure'
      return h('div', { className: 'dbb-routines' },
        h('div', { className: 'dbb-sql-bar' },
          h('label', { className: 'dbb-muted' }, t('routine.schema')),
          h('select', {
            className: 'dbb-input dbb-select-inline', value: schema ?? '',
            onChange: (e) => setSchema(e.target.value),
          }, (schemas ?? []).map((s) => h('option', { key: s, value: s }, s))),
          h('button', { className: 'dbb-btn', onClick: () => loadRoutines(schema), disabled: !schema }, t('routine.refresh')),
          h('span', { style: { flex: 1 } }),
          allowWrites ? null : h('span', { className: 'dbb-muted' }, t('routine.needWrites')),
        ),
        h(ErrorBar, { error: listError?.message, onClose: () => setListError(null), t }),
        h(Group, { className: 'dbb-routines-body', orientation: 'horizontal' },
          h(Panel, { id: 'routines-list', defaultSize: 320, minSize: 200, maxSize: 620, groupResizeBehavior: 'preserve-pixel-size' },
            h('div', { className: 'dbb-routines-list' },
            schemas === null && listError
              ? h('div', { className: 'dbb-muted dbb-pad' },
                  h('button', { className: 'dbb-btn', onClick: () => setNonce((n) => n + 1) }, t('tree.retry')))
              : routines === null
                ? h('div', { className: 'dbb-muted dbb-pad' }, t('routine.loading'))
                : routines.length === 0
                  ? h('div', { className: 'dbb-muted dbb-pad' }, t('routine.empty'))
                  : routines.map((r) => h('button', {
                    key: `${r.kind}:${r.name}`, type: 'button',
                    className: 'dbb-key' + (selected?.name === r.name && selected?.kind === r.kind ? ' dbb-key-active' : ''),
                    onClick: () => openRoutine(r), title: r.detail ? `${r.name}(${r.detail})` : r.name,
                  },
                    h('span', { className: 'dbb-node-label' }, r.name),
                    ' ',
                    h('span', { className: 'dbb-badge' }, r.kind),
                    r.detail && r.kind !== 'package' ? h('span', { className: 'dbb-muted' }, ` (${r.detail})`) : null,
                  )),
            ),
          ),
          h(Separator, { className: 'dbb-splitter' }),
          h(Panel, { id: 'routines-detail', minSize: 200 },
            h('div', { className: 'dbb-routines-detail' },
            selected === null
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('routine.select'))
              : h('div', { className: 'dbb-pad' },
                  h('div', { className: 'dbb-tableview-head' },
                    h('span', { className: 'dbb-tableview-name' }, `${schema}.${selected.name}`),
                    h('span', { className: 'dbb-badge' }, selected.kind),
                    h('span', { style: { flex: 1 } }),
                    selected.kind !== 'procedure' ? h('span', { className: 'dbb-muted' }, t('routine.onlyProcedure')) : null,
                  ),
                  h(ErrorBar, { error: sourceError?.message, onClose: () => setSourceError(null), t }),
                  source !== null ? h('pre', { className: 'dbb-pre dbb-routine-src' }, source) : (sourceError ? null : h('div', { className: 'dbb-muted' }, t('routine.loading'))),
                  h('div', { className: 'dbb-routine-call' },
                    h('input', {
                      className: 'dbb-input', value: argsText, disabled: !callable,
                      placeholder: t('routine.args'),
                      onChange: (e) => setArgsText(e.target.value),
                    }),
                    h('button', {
                      className: 'dbb-btn dbb-btn-primary', disabled: !callable || calling,
                      title: !allowWrites ? t('routine.needWrites') : '',
                      onClick: callRoutine,
                    }, calling ? t('routine.calling') : t('routine.call')),
                  ),
                  callOutcome ? h('div', { className: callOutcome.ok ? 'dbb-ok' : 'dbb-error' }, callOutcome.text) : null,
                ),
            ),
          ),
        ),
      )
    }

    function tryPrettyJson(text) {
      const trimmed = String(text ?? '').trim()
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        return null
      }
    }

    function StringValue({ text, t }) {
      const raw = String(text ?? '')
      const pretty = tryPrettyJson(raw)
      const [tab, setTab] = useState(pretty !== null ? 'json' : 'text')
      const tabs = [
        ['text', t('redis.view.text')],
        ['json', t('redis.view.json')],
      ]
      const body = tab === 'json' && pretty !== null ? pretty : raw
      return h('div', null,
        h('div', { className: 'dbb-subtabs dbb-value-tabs', role: 'tablist', 'aria-label': t('redis.kv.value') },
          tabs.map(([id, label]) => h('button', {
            key: id, type: 'button', role: 'tab',
            className: 'dbb-subtab',
            'aria-selected': tab === id ? 'true' : 'false',
            onClick: () => setTab(id),
          }, label))),
        tab === 'json' && pretty === null ? h('div', { className: 'dbb-field-hint' }, t('redis.view.jsonInvalid')) : null,
        h('pre', { className: 'dbb-pre' }, body),
      )
    }

    function RedisValue({ info, t }) {
      if (!info) return null
      if (info.exists === false) return h('div', { className: 'dbb-muted' }, t('redis.keyNotFound'))
      const meta = h('div', { className: 'dbb-result-meta' },
        `${t('redis.type')}: ${info.type} · ${t('redis.ttl')}: ${info.ttl >= 0 ? `${info.ttl}s` : t('redis.noTtl')}`,
        typeof info.length === 'number' ? ` · ${fmt(t, 'redis.length', { n: info.length })}` : '',
        info.truncated ? ` · ${t('redis.truncatedValue')}` : '',
      )
      let body
      if (info.type === 'string') {
        body = h(StringValue, { text: info.value ?? '', t })
      } else if (info.type === 'hash') {
        body = h(DataTable, {
          columns: [
            { name: t('redis.kv.field'), width: 220, value: ([k]) => k },
            { name: t('redis.kv.value'), width: 360, value: ([, v]) => String(v), cellProps: ([, v]) => ({ title: String(v) }) },
          ],
          rows: Object.entries(info.value ?? {}),
          rowKey: ([k]) => k,
          label: t('redis.type'),
          empty: t('result.empty'),
        })
      } else if (info.type === 'list') {
        body = h(DataTable, {
          columns: [
            { name: '#', width: 64, value: (_, i) => i, cellProps: () => ({ className: 'dbb-muted' }) },
            { name: t('redis.kv.value'), width: 360, value: (v) => String(v), cellProps: (v) => ({ title: String(v) }) },
          ],
          rows: info.value ?? [],
          label: t('redis.type'),
          empty: t('result.empty'),
        })
      } else if (info.type === 'set') {
        body = h(DataTable, {
          columns: [{ name: t('redis.kv.value'), width: 360, value: (v) => String(v), cellProps: (v) => ({ title: String(v) }) }],
          rows: info.value ?? [],
          hasHeader: false,
          label: t('redis.type'),
          empty: t('result.empty'),
        })
      } else if (info.type === 'zset') {
        body = h(DataTable, {
          columns: [
            { name: t('redis.kv.member'), width: 260, value: (e2) => String(e2.member) },
            { name: t('redis.kv.score'), width: 140, value: (e2) => String(e2.score) },
          ],
          rows: info.value ?? [],
          label: t('redis.type'),
          empty: t('result.empty'),
        })
      } else {
        body = h('pre', { className: 'dbb-pre' }, JSON.stringify(info.value, null, 2))
      }
      return h('div', null, meta, body)
    }

    const KEY_ROW_H = 25
    /**
     * Every data table renders through srp-table: virtual rows, sticky header and resizable columns.
     * columns: [{ name, width, value(row, index), cellProps(row) }]; a filler column takes the spare width.
     * className picks the frame (height cap, borders) of the scroll container the table virtualizes against.
     */
    function DataTable({ columns, rows, rowKey, label, empty, className, wide = false, hasHeader = true }) {
      const artColumns = useMemo(() => columns.map((col, i) => ({
        code: `c${i}`,
        name: col.name,
        width: col.width ?? (wide ? 360 : 160),
        getValue: col.value,
        getCellProps: col.cellProps ? (_, row) => col.cellProps(row) : undefined,
      })), [columns, wide])
      const EmptyContent = useMemo(() => () => h('div', { className: 'dbb-muted' }, empty), [empty])

      const pipeline = useTablePipeline()
      pipeline.input({ dataSource: rows, columns: artColumns })
      if (rowKey) pipeline.primaryKey(rowKey)
      pipeline
        .use(features.fillRemainingWidth())
        .use(features.columnResize({ minSize: 48, handleHoverBackground: RESIZE_HANDLE, handleActiveBackground: RESIZE_HANDLE }))

      return h('div', { className: `dbb-grid-scroll${wide ? ' dbb-grid-scroll-wide' : ''}${className ? ` ${className}` : ''}`, tabIndex: 0, role: 'region', 'aria-label': label },
        h(BaseTable, {
          ...pipeline.getProps(),
          hasHeader,
          style: TABLE_THEME,
          estimatedRowHeight: GRID_ROW_H,
          emptyCellHeight: 40,
          components: { EmptyContent },
        }))
    }

    function VirtualKeyList({ keys, selected, openKey }) {
      const { ref, range, onScroll } = useWindowed(keys.length, KEY_ROW_H)
      return h('div', { className: 'dbb-key-window', ref, onScroll },
        h('div', { style: { height: keys.length * KEY_ROW_H, position: 'relative' } },
          keys.slice(range.start, range.end).map((k, i) => h('button', {
            key: range.start + i, type: 'button',
            className: 'dbb-key' + (k === selected ? ' dbb-key-active' : ''),
            style: { position: 'absolute', top: (range.start + i) * KEY_ROW_H, left: 0, right: 0, height: KEY_ROW_H },
            onClick: () => openKey(k), title: k,
          }, k)),
        ),
      )
    }

    function RedisView({ conn, t }) {
      const [pattern, setPattern] = useState('')
      const patternRef = useRef(pattern)
      patternRef.current = pattern
      const [keys, setKeys] = useState(null)
      const [truncated, setTruncated] = useState(false)
      const [keyCursor, setKeyCursor] = useState(null)
      const [valueBusy, setValueBusy] = useState(false)
      const scanSeq = useRef(0)
      const activePattern = useRef('')
      const [scanning, setScanning] = useState(false)
      const [error, setError] = useState(null)
      const [selected, setSelected] = useState(null)
      const [value, setValue] = useState(null)
      const [valueError, setValueError] = useState(null)
      const started = conn.status === 'open'
      const scan = useCallback(async (more = false) => {
        more = more === true
        const request = ++scanSeq.current
        const match = more ? activePattern.current : patternRef.current.trim()
        if (conn.status !== 'open' || match === '') return
        setScanning(true); setError(null)
        try {
          const r = await call('redis-keys', { id: conn.id, pattern: match, limit: 1000, cursor: more ? keyCursor : undefined })
          if (request !== scanSeq.current) return
          activePattern.current = match
          setKeys(old => more ? [...new Set([...(old ?? []), ...r.keys])] : r.keys); setTruncated(r.truncated); setKeyCursor(r.nextCursor)
        } catch (e) { setError(e) } finally { setScanning(false) }
      }, [conn.id, conn.status, keyCursor])

      const [dbsize, setDbsize] = useState(null)
      const reqSeq = useRef(0)
      useEffect(() => {
        if (conn.status !== 'open') { setDbsize(null); return }
        let alive = true
        call('redis-dbsize', { id: conn.id }).then((r) => { if (alive) setDbsize(r.dbsize) }).catch(() => {})
        return () => { alive = false }
      }, [conn.id, conn.status])
      const openKey = useCallback(async (key, more = false) => {
        const req = ++reqSeq.current
        setSelected(key); if (!more) setValue(null); setValueError(null); setValueBusy(true)
        try {
          const v = await call('redis-get', { id: conn.id, key, limit: 1000, cursor: more ? value?.nextCursor : undefined })
          if (req === reqSeq.current) setValue(old => {
            if (!more || !old || old.type !== v.type) return v
            if (v.type === 'string' && old.valueBase64 !== undefined && v.valueBase64 !== undefined) {
              const raw = atob(old.valueBase64) + atob(v.valueBase64)
              return { ...v, valueBase64: btoa(raw), value: new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))) }
            }
            const merged = v.type === 'hash' ? { ...old.value, ...v.value } : v.type === 'string' ? old.value + v.value : v.type === 'set' ? [...new Set([...old.value, ...v.value])] : [...old.value, ...v.value]
            return { ...v, value: merged }
          })
        } catch (e) { if (req === reqSeq.current) setValueError(e) } finally { if (req === reqSeq.current) setValueBusy(false) }
      }, [conn.id, value])
      return h('div', { className: 'dbb-redis' },
        h('div', { className: 'dbb-sql-bar' },
          h('input', { className: 'dbb-input dbb-pattern', value: pattern, onChange: (e) => setPattern(e.target.value), placeholder: t('redis.pattern'), onKeyDown: (e) => { if (e.key === 'Enter') scan() } }),
          h('button', { className: 'dbb-btn dbb-btn-primary', onClick: scan, disabled: scanning || !started || pattern.trim() === '' }, scanning ? t('redis.scanning') : t('redis.scan')),
          dbsize !== null ? h('span', { className: 'dbb-muted' }, t('redis.dbsize') + ': ' + dbsize) : null,
        ),
        h(ErrorBar, { error: error?.message, onClose: () => setError(null), t }),
        h(Group, { className: 'dbb-redis-body', orientation: 'horizontal' },
          h(Panel, { id: 'redis-keys', defaultSize: 300, minSize: 180, maxSize: 620, groupResizeBehavior: 'preserve-pixel-size' },
            h('div', { className: 'dbb-redis-keys' },
            !started
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('conn.needStart'))
              : keys === null
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('redis.scanHint'))
              : [
                  h('div', { key: 'm', className: 'dbb-result-meta dbb-pad' }, fmt(t, 'redis.keys', { n: keys.length }) + (truncated ? ` (${t('result.truncated')})` : '')),
                  h(VirtualKeyList, { key: 'vl', keys, selected, openKey }),
                  keyCursor ? h('button', { key: 'more', className: 'dbb-btn', disabled: scanning || !started, onClick: () => scan(true) }, t('loadMore')) : null,
                ],
            ),
          ),
          h(Separator, { className: 'dbb-splitter' }),
          h(Panel, { id: 'redis-value', minSize: 160 },
            h('div', { className: 'dbb-redis-value' },
            selected === null
              ? h('div', { className: 'dbb-muted dbb-pad' }, t('redis.selectKey'))
              : h('div', { className: 'dbb-pad dbb-redis-value-inner' },
                  h('div', { className: 'dbb-tableview-name' }, selected),
                  h(ErrorBar, { error: valueError?.message, onClose: () => setValueError(null), t }),
                  value ? h(RedisValue, { info: value, t }) : h('div', { className: 'dbb-muted' }, t('tree.loading')),
                  value?.nextCursor ? h('button', { className: 'dbb-btn', disabled: valueBusy || !started, onClick: () => openKey(selected, true) }, t('loadMore')) : null,
                ),
            ),
          ),
        ),
      )
    }

    function TreeNode({ depth, label, badge, trailing, expanded, loading, error, selected, onToggle, onClick, children, t,
      draggable, dragging, drop, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) {
      return h('div', null,
        h('div', {
          className: 'dbb-node' +
            (selected ? ' dbb-node-active' : '') +
            (dragging ? ' dbb-node-dragging' : '') +
            (drop === 'before' ? ' dbb-node-drop-before' : drop === 'after' ? ' dbb-node-drop-after' : ''),
          style: { paddingLeft: 8 + depth * 16 },
          onClick: onClick ?? onToggle,
          draggable, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
        },
          onToggle
            ? h('span', { className: 'dbb-chevron', onClick: (e) => { e.stopPropagation(); onToggle() } }, loading ? '…' : expanded ? '▾' : '▸')
            : h('span', { className: 'dbb-chevron dbb-chevron-leaf', 'aria-hidden': 'true' }, '·'),
          h('span', { className: 'dbb-node-label', title: label }, label),
          trailing ? h('span', { className: 'dbb-node-actions', onClick: (e) => e.stopPropagation() }, trailing) : null,
          badge ?? null,
        ),
        error ? h('div', { className: 'dbb-node-err', style: { paddingLeft: 24 + depth * 16 } }, String(error), ' ',
          h('button', { className: 'dbb-link', onClick: onToggle }, t('tree.retry'))) : null,
        expanded ? children : null,
      )
    }

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

    const CSS = `
.dbb-root{display:flex;flex-direction:column;height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;overflow:hidden}
.dbb-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dbb-title{font-size:16px;font-weight:600}
.dbb-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
/* Pane groups: react-resizable-panels owns the flex track, our divs fill each panel. */
.dbb-body,.dbb-redis-body,.dbb-routines-body{flex:1;min-width:0;min-height:0}
.dbb-body [data-panel],.dbb-redis-body [data-panel],.dbb-routines-body [data-panel]{display:flex;min-width:0;min-height:0}
.dbb-body [data-panel]>*,.dbb-redis-body [data-panel]>*,.dbb-routines-body [data-panel]>*{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;height:100%}
.dbb-aside,.dbb-main,.dbb-redis-keys,.dbb-redis-value,.dbb-routines-list,.dbb-routines-detail{flex:1;min-width:0;min-height:0;height:100%}
.dbb-aside{border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;background:var(--dsw-alias-bg-layer-1)}
.dbb-splitter{width:6px;flex:none;cursor:col-resize;touch-action:none;background:transparent;border-radius:3px}
.dbb-splitter:hover,.dbb-splitter[data-separator="active"]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent)}
.dbb-main{flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column}
.dbb-tabs{display:flex;align-items:stretch;gap:2px;padding:0 8px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow:auto}
.dbb-tab{display:inline-flex;align-items:center;gap:6px;max-width:220px;border:none;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px 8px 6px;cursor:pointer;font-size:12px}
.dbb-tab[aria-selected="true"]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.dbb-tab-label{border:none;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbb-tab-close{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0 2px;border-radius:4px;line-height:1}
.dbb-tab-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dbb-tab-panes{flex:1;min-height:0;display:flex;flex-direction:column}
.dbb-tab-pane{display:none;flex:1;min-height:0;overflow:auto;flex-direction:column}
.dbb-tab-pane-active{display:flex}
.dbb-node{position:relative;display:flex;align-items:center;gap:4px;padding:5px 8px;cursor:pointer;white-space:nowrap;overflow:hidden}
.dbb-node:hover{background:var(--dsw-alias-bg-layer-2)}
.dbb-node-active{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dbb-node-dragging{opacity:.45}
.dbb-node-drop-before{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary)}
.dbb-node-drop-after{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
.dbb-chevron{width:14px;flex:none;color:var(--dsw-alias-label-secondary);text-align:center;cursor:pointer}
.dbb-chevron-leaf{opacity:.4}
.dbb-node-label{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dbb-node-err{padding:2px 8px;color:var(--dsw-alias-state-error-primary);font-size:12px;word-break:break-all;white-space:normal}
.dbb-badge{flex:none;font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.dbb-conn-badge{display:inline-flex;align-items:center;gap:5px;flex:none;margin-left:auto}
.dbb-node > .dbb-badge{margin-left:auto}
.dbb-node-actions{position:absolute;top:50%;right:6px;transform:translateY(-50%);display:inline-flex;align-items:center;gap:2px;padding-left:10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);opacity:0;pointer-events:none}
.dbb-node:hover .dbb-node-actions,.dbb-node:focus-within .dbb-node-actions{opacity:1;pointer-events:auto}
.dbb-node:hover .dbb-conn-badge,.dbb-node:focus-within .dbb-conn-badge{visibility:hidden}
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
/* Data tables (srp-table): this div is the scroll container the table virtualizes against. */
.dbb-grid-scroll{overflow-x:hidden;overflow-y:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;max-height:46vh;resize:vertical;min-height:96px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dbb-grid-scroll .art-table-header th{font-weight:600;white-space:nowrap}
.dbb-grid-scroll td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbb-grid-scroll-wide td{white-space:pre-wrap;vertical-align:top}
.dbb-grid-scroll-wide{max-height:none}
.dbb-plan{max-height:40vh}
.dbb-null{color:var(--dsw-alias-label-secondary);font-style:italic}
.dbb-result-meta{color:var(--dsw-alias-label-secondary);font-size:12px}
.dbb-page{display:inline-flex;align-items:center;gap:6px}
.dbb-tree-filter{width:calc(100% - 32px);margin:2px 8px 4px 24px}
.dbb-page-size{display:inline-flex;align-items:center;gap:4px;font-size:12px}
.dbb-select-inline{width:auto;padding:2px 4px}
.dbb-section-title-row{display:flex;align-items:center;gap:8px}
.dbb-cols{max-height:30vh;margin-bottom:10px}
.dbb-tableview{padding:8px 12px;overflow:auto}
.dbb-tableview-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.dbb-tableview-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}
.dbb-section{margin-top:8px}
.dbb-section-title{font-weight:600;margin-bottom:6px}
.dbb-warn-text{color:var(--dsw-alias-state-warn-primary);font-size:12px}
.dbb-modal{width:460px;max-width:calc(100vw - 32px);max-height:86vh;overflow:auto;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:16px}
.dbb-modal:not([open]){display:none}
dialog.dbb-modal:modal{overscroll-behavior:contain}
.dbb-modal::backdrop{background:var(--dsw-alias-bg-mask-1);overflow:hidden;overscroll-behavior:contain}
.dbb-modal-title{font-size:15px;font-weight:600;margin-bottom:12px}
.dbb-modal-body{display:flex;flex-direction:column;gap:10px}
.dbb-field{display:flex;flex-direction:column;gap:4px}
.dbb-field-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dbb-field-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dbb-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dbb-modal-foot{display:flex;gap:8px;margin-top:14px;align-items:center}
.dbb-redis{display:flex;flex-direction:column;flex:1;min-height:0;padding:8px 12px;gap:8px;overflow:hidden}
.dbb-pattern{max-width:260px}
.dbb-redis-keys{overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;display:flex;flex-direction:column}
.dbb-key-window{flex:1;overflow:auto;position:relative}
.dbb-key{display:block;width:100%;box-sizing:border-box;border:none;background:none;color:inherit;text-align:left;padding:4px 10px;cursor:pointer;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbb-key:hover{background:var(--dsw-alias-bg-layer-2)}
.dbb-key-active{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dbb-redis-value{flex:1;min-width:0;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px}
.dbb-redis-value-inner .dbb-grid-scroll{max-height:none;border:none;border-radius:0}
.dbb-pre{margin:8px 0;padding:8px;background:var(--dsw-alias-bg-layer-1);border-radius:6px;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-all}
.dbb-welcome{padding:40px 24px;color:var(--dsw-alias-label-secondary)}
.dbb-pane-col{display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto}
.dbb-value-tabs{padding:0;margin:8px 0 0}
.dbb-subtabs{display:flex;gap:2px;padding:6px 12px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dbb-subtab{border:none;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 10px 5px;cursor:pointer;font-size:12px}
.dbb-subtab[aria-selected="true"]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.dbb-routines{display:flex;flex-direction:column;flex:1;min-height:0;padding:8px 12px;gap:8px;overflow:hidden}
.dbb-routines-list{overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px}
.dbb-routines-detail{flex:1;min-width:0;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px}
.dbb-routine-src{max-height:44vh}
.dbb-routine-call{display:flex;gap:8px;margin-top:8px}
.dbb-welcome h2{color:var(--dsw-alias-label-primary);margin:0 0 8px}
`

    function DbPanel(props) {
      const rootRef = useRef(null)
      const asidePanelRef = usePanelRef()
      // The pane geometry belongs to react-resizable-panels; we only remember its pixel width.
      const initialAsideWidth = useRef(readStoredNumber('db-browser.asideWidth', 250, 160, 560)).current
      const persistAsideWidth = useCallback(() => {
        const size = asidePanelRef.current?.getSize()
        if (!size) return
        try { globalThis.localStorage?.setItem('db-browser.asideWidth', String(Math.round(size.inPixels))) } catch { /* ignore */ }
      }, [])
      const t = typeof props.t === 'function' ? props.t : (props.locale?.t ?? ((k) => k))
      const [data, setData] = useState(null) // { connections, allowWrites, maxRows }
      const [fatal, setFatal] = useState(null)
      const [editing, setEditing] = useState(null) // null | {} | connection
      const [tabs, setTabs] = useState([])
      const [activeId, setActiveId] = useState(null)
      const [views, setViews] = useState({})
      const tabsRef = useRef([])
      const viewsRef = useRef({})
      const activeRef = useRef(null)
      const restoredRef = useRef(false)
      const publishTabs = (nextTabs, nextActive, nextViews) => {
        tabsRef.current = nextTabs
        viewsRef.current = nextViews
        activeRef.current = nextActive
        viewState.tabs = nextTabs
        viewState.activeId = nextActive
        viewState.views = nextViews
        setTabs(nextTabs)
        setViews(nextViews)
        setActiveId(nextActive)
      }
      const focusTab = (id, view) => {
        // Omitting view keeps the tab's current page.
        const nextTabs = tabsRef.current.includes(id) ? tabsRef.current : [...tabsRef.current, id]
        const nextViews = view ? { ...viewsRef.current, [id]: view } : viewsRef.current
        publishTabs(nextTabs, id, nextViews)
      }
      const closeTab = (id) => {
        const index = tabsRef.current.indexOf(id)
        const nextTabs = tabsRef.current.filter((item) => item !== id)
        const nextActive = activeRef.current === id ? (nextTabs[Math.max(0, index - 1)] ?? null) : activeRef.current
        const nextViews = { ...viewsRef.current }
        delete nextViews[id]
        publishTabs(nextTabs, nextActive, nextViews)
      }
      const [tree, setTree] = useState({}) // nodeKey -> {expanded, loading, error, items}

      const refresh = useCallback(async () => {
        try {
          const v = await loadConnections()
          setData(v); setFatal(null)
          const live = new Set(v.connections.map((c) => c.id))
          const nextTabs = tabsRef.current.filter((id) => live.has(id))
          if (nextTabs.length !== tabsRef.current.length || (activeRef.current && !live.has(activeRef.current))) {
            const nextViews = { ...viewsRef.current }
            for (const id of Object.keys(nextViews)) if (!live.has(id)) delete nextViews[id]
            const nextActive = nextTabs.includes(activeRef.current) ? activeRef.current : (nextTabs[0] ?? null)
            publishTabs(nextTabs, nextActive, nextViews)
          }
        } catch (e) { setFatal(e) }
      }, [])

      useEffect(() => { refresh() }, [refresh])

      useEffect(() => {
        rootRef.current?.querySelector('.dbb-tab[aria-selected="true"]')
          ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', container: 'nearest' })
      }, [activeId])

      useEffect(() => {
        if (!data || restoredRef.current) return
        restoredRef.current = true
        const ids = (viewState.tabs ?? []).filter((id) => data.connections.some((c) => c.id === id))
        if (ids.length === 0) return
        const nextViews = {}
        for (const id of ids) if (viewState.views?.[id]) nextViews[id] = viewState.views[id]
        const nextActive = ids.includes(viewState.activeId) ? viewState.activeId : ids[0]
        publishTabs(ids, nextActive, nextViews)
      }, [data])

      const nodeKey = (...parts) => parts.join('￨')
      const patchTree = (key, patch) => setTree((m) => ({ ...m, [key]: { ...(m[key] ?? {}), ...patch } }))

      const loadDatabases = async (conn) => {
        const key = nodeKey('conn', conn.id)
        patchTree(key, { expanded: true, loading: true, error: null, needStart: false })
        try {
          const r = await call('list-databases', { id: conn.id })
          patchTree(key, { loading: false, items: r.databases })
        } catch (e) { patchTree(key, { loading: false, error: e.message }) }
      }
      // Redis has no schemas, but INFO keyspace lists its non-empty logical databases.
      const loadRedisKeyspace = async (conn) => {
        const key = nodeKey('conn', conn.id)
        patchTree(key, { expanded: true, loading: true, error: null, needStart: false })
        try {
          const info = await call('redis-info', { id: conn.id })
          patchTree(key, { loading: false, items: parseRedisKeyspace(info) })
        } catch (e) { patchTree(key, { loading: false, error: e.message }) }
      }
      const toggleConnectionNode = (conn) => {
        const key = nodeKey('conn', conn.id)
        const node = tree[key] ?? {}
        if (node.expanded && !node.error) { patchTree(key, { expanded: false }); return }
        // A failed load stays expanded so the next toggle retries. A stopped connection expands to the start button.
        if (conn.status !== 'open') {
          patchTree(key, { expanded: true, loading: false, error: null, needStart: true })
          return
        }
        if (conn.type === 'redis') loadRedisKeyspace(conn)
        else loadDatabases(conn)
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
          if (conn.status !== 'open') {
            // The click still sees the pre-start status, so expand the node the way a toggle would.
            if (conn.type === 'redis') loadRedisKeyspace(conn)
            else loadDatabases(conn)
          }
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
          callError = e
        }
        try {
          const v = await loadConnections()
          setData(v); setFatal(null)
          if (v.connections.some((c) => c.id === conn.id)) {
            setFatal(callError ?? new Error(`delete-connection ${conn.id} did not apply`))
            return
          }
          closeTab(conn.id)
        } catch (e) { setFatal(e) }
      }

      const duplicateConn = (conn) => {
        const { id, hasPassword, status, family, ...rest } = conn
        setEditing({ ...rest, label: `${conn.label} ${t('copy.suffix')}` })
      }

      const verifySaved = async (id) => {
        // Saving restarts the plugin, so the new row may not be visible on the first read.
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

      const [dragState, setDragState] = useState(null) // { id, over, after } while a connection row is dragged
      const dragIdRef = useRef(null)
      const moveConnection = async (fromId, toId, after) => {
        const current = data?.connections ?? []
        const ids = current.map((c) => c.id)
        if (!ids.includes(fromId) || !ids.includes(toId)) return
        const next = ids.filter((id) => id !== fromId)
        const at = next.indexOf(toId)
        next.splice(after ? at + 1 : at, 0, fromId)
        if (next.every((id, i) => id === ids[i])) return
        // Show the new order at once, then let the host persist it and re-read the list.
        const byId = new Map(current.map((c) => [c.id, c]))
        setData((d) => ({ ...d, connections: next.map((id) => byId.get(id)) }))
        try {
          await call('reorder-connections', { ids: next })
        } catch (e) { setFatal(e) }
        await refresh()
      }
      const dragProps = (conn) => ({
        draggable: true,
        dragging: dragState?.id === conn.id,
        drop: dragState && dragState.id !== conn.id && dragState.over === conn.id ? (dragState.after ? 'after' : 'before') : null,
        onDragStart: (event) => {
          dragIdRef.current = conn.id
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', conn.id)
          setDragState({ id: conn.id, over: null, after: false })
        },
        onDragOver: (event) => {
          const from = dragIdRef.current
          if (!from || from === conn.id) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          const rect = event.currentTarget.getBoundingClientRect()
          const after = event.clientY > rect.top + rect.height / 2
          setDragState((cur) => (cur && cur.id === from && cur.over === conn.id && cur.after === after ? cur : { id: from, over: conn.id, after }))
        },
        onDragLeave: (event) => {
          // Moving between children of the same row must not clear the indicator.
          if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return
          setDragState((cur) => (cur && cur.over === conn.id ? { ...cur, over: null } : cur))
        },
        onDrop: (event) => {
          const from = dragIdRef.current
          dragIdRef.current = null
          setDragState(null)
          if (!from || from === conn.id) return
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          moveConnection(from, conn.id, event.clientY > rect.top + rect.height / 2)
        },
        onDragEnd: () => { dragIdRef.current = null; setDragState(null) },
      })

      const renderConnectionNode = (conn) => {
        const key = nodeKey('conn', conn.id)
        const node = tree[key] ?? {}
        const isSql = conn.type !== 'redis'
        const connSelected = activeId === conn.id
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
          h('button', {
            className: 'dbb-icon-btn', title: t('copy'),
            onClick: () => duplicateConn(conn),
          }, '⧉'),
        )
        return h(TreeNode, {
          key: conn.id, depth: 0, label: conn.label, t,
          trailing,
          badge: h('span', { className: 'dbb-conn-badge' },
            h('span', { className: 'dbb-dot ' + (conn.status === 'open' ? 'dbb-dot-open' : ''), title: conn.status === 'open' ? t('conn.status.open') : t('conn.status.stopped') }),
            h(TypeBadge, { type: conn.type })),
          expanded: node.expanded, loading: node.loading, error: node.error,
          selected: connSelected,
          onToggle: () => toggleConnectionNode(conn),
          onClick: () => {
            focusTab(conn.id)
            if (!(tree[key] ?? {}).expanded) toggleConnectionNode(conn)
          },
          ...dragProps(conn),
        }, !node.expanded
          ? null
          : node.needStart && conn.status !== 'open'
            ? h('div', { className: 'dbb-need-start' },
                h('span', { className: 'dbb-muted' }, t('conn.needStart')),
                h('button', { className: 'dbb-btn dbb-btn-primary', disabled: busyConn === conn.id, onClick: () => toggleConn(conn) }, busyConn === conn.id ? t('conn.starting') : '⏻ ' + t('conn.start')))
            : Array.isArray(node.items)
              ? !isSql
                ? node.items.length === 0
                  ? h('div', { className: 'dbb-muted dbb-need-start' }, t('redis.keyspaceEmpty'))
                  : node.items.map((db) => h(TreeNode, {
                      key: key + '￨' + db.name, depth: 1, label: db.name, t,
                      badge: h('span', { className: 'dbb-badge' }, fmt(t, 'redis.keyCount', { n: db.keys })),
                      onClick: () => focusTab(conn.id),
                    }))
                : node.items.map((db) => renderDatabaseNode(conn, db))
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
                const view = views[conn.id]
                const active = activeId === conn.id && view?.kind === 'table' && view.database === database && view.table === tb.name
                return h(TreeNode, {
                  key: key + '￨' + tb.name, depth: 2, label: tb.name, t,
                  badge: tb.kind === 'view' ? h('span', { className: 'dbb-badge' }, 'view') : null,
                  selected: active,
                  onClick: () => focusTab(conn.id, { kind: 'table', database, table: tb.name }),
                })
              },
            })
          : null)
      }

      const renderTabBody = (conn) => {
        const view = views[conn.id] ?? { kind: conn.type === 'redis' ? 'redis' : 'sql' }
        if (view.kind === 'table') {
          return h(TableView, {
            key: `${conn.id}/${view.database}/${view.table}`,
            conn, database: view.database, table: view.table, t,
            onOpenSql: (database, table) => focusTab(conn.id, { kind: 'sql', seed: { connId: conn.id, database, table } }),
          })
        }
        if (conn.type === 'redis') return h(RedisView, { key: conn.id, conn, t })
        const strip = conn.features?.procedures
          ? h('div', { className: 'dbb-subtabs', role: 'tablist', 'aria-label': conn.label || conn.id },
              h('button', {
                type: 'button', role: 'tab', 'aria-selected': view.kind !== 'routines' ? 'true' : 'false',
                className: 'dbb-subtab',
                onClick: () => focusTab(conn.id, { kind: 'sql' }),
              }, t('tab.sql')),
              h('button', {
                type: 'button', role: 'tab', 'aria-selected': view.kind === 'routines' ? 'true' : 'false',
                className: 'dbb-subtab',
                onClick: () => focusTab(conn.id, { kind: 'routines' }),
              }, t('tab.routines')),
            )
          : null
        if (view.kind === 'routines' && conn.features?.procedures) {
          return h('div', { className: 'dbb-pane-col' },
            strip,
            h(RoutinesView, { key: `${conn.id}/routines`, conn, allowWrites: typeof conn.allowWrites === 'boolean' ? conn.allowWrites : data?.allowWrites === true, t }),
          )
        }
        return h('div', { className: 'dbb-pane-col' },
          strip,
          h(SqlPane, {
            key: conn.id, conn, seed: view.seed ?? null,
            clearSeed: () => focusTab(conn.id, { kind: 'sql' }),
            allowWrites: typeof conn.allowWrites === 'boolean' ? conn.allowWrites : data?.allowWrites === true, t,
          }),
        )
      }

      const renderMain = () => {
        const open = tabs.map((id) => data?.connections.find((c) => c.id === id)).filter(Boolean)
        return h(React.Fragment, null,
          open.length > 0
            ? h('div', { className: 'dbb-tabs', role: 'tablist' },
                open.map((conn) => h('div', {
                  key: conn.id,
                  className: 'dbb-tab' + (conn.id === activeId ? ' dbb-tab-active' : ''),
                  role: 'tab',
                  'aria-selected': conn.id === activeId,
                },
                  h('button', {
                    className: 'dbb-tab-label',
                    onClick: () => focusTab(conn.id),
                  }, conn.label || conn.id),
                  h('button', {
                    className: 'dbb-tab-close',
                    'aria-label': t('tab.close'),
                    title: t('tab.close'),
                    onClick: () => closeTab(conn.id),
                  }, '×'),
                )))
            : null,
          h('div', { className: 'dbb-tab-panes' },
            open.length === 0
              ? h('div', { className: 'dbb-welcome' },
                  h('h2', null, t('welcome.title')),
                  h('p', null, t('tab.empty')))
              : open.map((conn) => h('div', {
                  key: conn.id,
                  className: 'dbb-tab-pane' + (conn.id === activeId ? ' dbb-tab-pane-active' : ''),
                  role: 'tabpanel',
                }, renderTabBody(conn))),
          ),
        )
      }

      return h('div', { className: 'dbb-root', ref: rootRef },
        h('style', null, CSS),
        h('div', { className: 'dbb-head' },
          h('span', { className: 'dbb-title' }, t('panel')),
          h('span', { className: 'dbb-sub' }, t('header.subtitle')),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dbb-btn', onClick: refresh }, t('refresh')),
        ),
        h(ErrorBar, { error: fatal?.message, onClose: () => setFatal(null), t }),
        h(Group, {
          className: 'dbb-body',
          orientation: 'horizontal',
          onLayoutChanged: persistAsideWidth,
        },
          h(Panel, {
            id: 'aside',
            panelRef: asidePanelRef,
            defaultSize: initialAsideWidth,
            minSize: 160,
            maxSize: 560,
            groupResizeBehavior: 'preserve-pixel-size',
            className: 'dbb-aside-panel',
          },
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
          ),
          h(Separator, {
            className: 'dbb-splitter',
            title: t('aside.resizeHint'),
            'aria-label': t('aside.resizeHint'),
            // The built-in reset returns to defaultSize, which is the remembered width, not the default.
            disableDoubleClick: true,
            onDoubleClick: () => asidePanelRef.current.resize(250),
          }),
          h(Panel, { id: 'main', className: 'dbb-main-panel', minSize: 120 },
            h('div', { className: 'dbb-main' }, renderMain())),
        ),
        editing !== null
          ? h(ConnectionForm, {
              // {} is a blank form. An object without id is a duplicate.
              initial: editing && Object.keys(editing).length > 0 ? editing : null,
              defaults: { allowWrites: data?.allowWrites === true, poolMax: data?.poolMax ?? 4 },
              t,
              onClose: () => setEditing(null),
              onDelete: async (conn) => { setEditing(null); await removeConn(conn) },
              onSaved: async (id) => {
                setEditing(null)
                try {
                  const v = await loadConnections()
                  setData(v); setFatal(null)
                  const saved = v.connections.find((c) => c.id === id)
                  if (saved) focusTab(saved.id, { kind: saved.type === 'redis' ? 'redis' : 'sql' })
                } catch { await refresh() }
              },
              onSaveUncertain: verifySaved,
            })
          : null,
      )
    }

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
}
