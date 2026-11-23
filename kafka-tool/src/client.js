import { Group, Panel, Separator } from 'react-resizable-panels'

export function factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PANEL_ID = 'kafka-tool'
    const NS = 'kafkaTool'
    const MAX_ROWS = 50000
    const POLL_LIMIT = 500
    const BACKFILL_COUNT = 100
    const BACKFILL_CONCURRENCY = 4
    const ROW_H = 26
    const RESUME_TAIL = 500

    // Remount keeps the connection and view choices. Kafka data is always reloaded.
    const panelCache = {
      connInfo: null,
      connForm: null,
      auto: null,
      configSnapshot: null,
      subId: null,
      selectedTopics: null,
      view: null,
    }

    const en = {
      panel: 'Kafka',
      'conn.brokers': 'Brokers',
      'conn.brokers.placeholder': 'host1:9092, host2:9092',
      'conn.ssl': 'SSL',
      'conn.ssl.title': 'TLS',
      'conn.sasl': 'SASL',
      'conn.sasl.title': 'SASL authentication',
      'conn.username': 'Username',
      'conn.password': 'Password',
      'conn.connect': 'Connect',
      'conn.disconnect': 'Disconnect',
      'conn.connecting': 'Connecting…',
      'conn.connected': 'Connected to {cluster}',
      'conn.required': 'Connect to a cluster first.',
      'view.stream': 'Message stream',
      'view.topics': 'Topics',
      'view.groups': 'Consumer groups',
      'topics.reload': 'Reload topics',
      'topics.empty': 'No topics.',
      'topics.col.name': 'Topic',
      'topics.col.partitions': 'Partitions',
      'topics.col.size': 'Messages',
      'topics.subscribe': 'Subscribe',
      'topics.showInternal': 'Show internal topics',
      'topics.search': 'Filter topics…',
      'topics.part.col': 'Partition',
      'topics.leader': 'Leader',
      'topics.begin': 'Begin',
      'topics.end': 'End',
      'groups.reload': 'Reload groups',
      'groups.search': 'Filter groups…',
      'groups.empty': 'No consumer groups.',
      'groups.col.id': 'Group',
      'groups.col.state': 'State',
      'groups.col.members': 'Members',
      'groups.col.protocol': 'Protocol',
      'groups.offsets.loading': 'Loading offsets…',
      'groups.offsets.col.topic': 'Topic',
      'groups.offsets.col.partition': 'Partition',
      'groups.offsets.col.committed': 'Committed',
      'groups.offsets.col.end': 'End',
      'groups.offsets.col.lag': 'Lag',
      'stream.pickTopics': '{count} topics',
      'stream.pickTopics.none': 'Select topics…',
      'stream.pick.allFiltered': 'Select all filtered',
      'stream.pick.clear': 'Clear selection',
      'stream.start.mode': 'Start from',
      'stream.start.latest': 'Latest',
      'stream.start.earliest': 'Earliest',
      'stream.start.timestamp': 'Timestamp',
      'stream.timestamp.invalid': 'Invalid timestamp',
      'stream.start.offset': 'Offset',
      'stream.subscribe': 'Subscribe',
      'stream.stop': 'Stop',
      'stream.resubscribe': 'Restart subscription',
      'stream.needTopics': 'Pick at least one topic.',
      'stream.older': 'Load older',
      'stream.older.done': 'Beginning reached',
      'stream.buffer': '{count} messages buffered',
      'stream.buffer.capped': '{count} messages buffered (oldest dropped)',
      'stream.empty': 'No messages yet. Waiting for new data…',
      'stream.expired': 'The subscription expired on the host; subscribe again.',
      'stream.resuming': 'Resuming the subscription…',
      'common.loading': 'Loading…',
      'stream.gap': 'The server buffer overflowed between polls; {count} messages were skipped. Seek or re-subscribe to see history.',
      'stream.col.time': 'Time',
      'stream.col.topic': 'Topic',
      'stream.col.partition': 'Part',
      'stream.col.offset': 'Offset',
      'stream.col.key': 'Key',
      'stream.col.size': 'Size',
      'filter.partition': 'Partition',
      'filter.all': 'All',
      'filter.key': 'Key contains…',
      'filter.offsetMin': 'Offset ≥',
      'filter.offsetMax': 'Offset ≤',
      'filter.clear': 'Clear filters',
      'filter.noMatch': 'No buffered message matches the filters.',
      'refresh.manual': 'Refresh',
      'refresh.auto': 'Auto refresh',
      'refresh.every': 'every',
      'refresh.seconds': 's',
      'refresh.last': 'Last updated {time}',
      'detail.title': 'Message detail',
      'table.colWidth': 'Drag to resize the column',
      'split.detailResize': 'Drag to resize the detail pane, double-click to reset',
      'detail.close': 'Close',
      'detail.meta': 'Metadata',
      'detail.key': 'Key',
      'detail.value': 'Value',
      'detail.headers': 'Headers',
      'detail.hex': 'Hex',
      'detail.text': 'Text',
      'detail.json': 'JSON',
      'detail.json.invalid': 'Not valid JSON; showing raw text.',
      'detail.null': '(null)',
      'detail.truncated': 'Payload truncated to the first 256 KiB by the server.',
      'detail.keySize': 'Key size',
      'detail.valueSize': 'Value size',
      'error.generic': 'Request failed: {message}',
      'common.null': '—',
    }
    const zh = {
      panel: 'Kafka',
      'conn.brokers': 'Broker 地址',
      'conn.brokers.placeholder': 'host1:9092, host2:9092',
      'conn.ssl': 'SSL',
      'conn.ssl.title': 'TLS',
      'conn.sasl': 'SASL',
      'conn.sasl.title': 'SASL 认证',
      'conn.username': '用户名',
      'conn.password': '密码',
      'conn.connect': '连接',
      'conn.disconnect': '断开',
      'conn.connecting': '连接中…',
      'conn.connected': '已连接到 {cluster}',
      'conn.required': '请先连接集群。',
      'view.stream': '消息订阅',
      'view.topics': 'Topics',
      'view.groups': '消费者组',
      'topics.reload': '刷新 topic',
      'topics.empty': '没有 topic。',
      'topics.col.name': 'Topic',
      'topics.col.partitions': '分区数',
      'topics.col.size': '消息量',
      'topics.subscribe': '订阅',
      'topics.showInternal': '显示内部 topic',
      'topics.search': '过滤 topic…',
      'topics.part.col': '分区',
      'topics.leader': 'Leader',
      'topics.begin': '起始',
      'topics.end': '末尾',
      'groups.reload': '刷新消费者组',
      'groups.search': '过滤消费者组…',
      'groups.empty': '没有消费者组。',
      'groups.col.id': '组',
      'groups.col.state': '状态',
      'groups.col.members': '成员数',
      'groups.col.protocol': '协议',
      'groups.offsets.loading': '正在读取位点…',
      'groups.offsets.col.topic': 'Topic',
      'groups.offsets.col.partition': '分区',
      'groups.offsets.col.committed': '已提交',
      'groups.offsets.col.end': '末尾',
      'groups.offsets.col.lag': '滞后',
      'stream.pickTopics': '{count} 个 topic',
      'stream.pickTopics.none': '选择 topic…',
      'stream.pick.allFiltered': '全选过滤结果',
      'stream.pick.clear': '清空选择',
      'stream.start.mode': '起始位置',
      'stream.start.latest': '最新',
      'stream.start.earliest': '最早',
      'stream.start.timestamp': '时间戳',
      'stream.timestamp.invalid': '时间戳无效',
      'stream.start.offset': 'Offset',
      'stream.subscribe': '订阅',
      'stream.stop': '停止',
      'stream.resubscribe': '重新开始订阅',
      'stream.needTopics': '请至少选择一个 topic。',
      'stream.older': '加载更早',
      'stream.older.done': '已到最开始了',
      'stream.buffer': '已缓存 {count} 条消息',
      'stream.buffer.capped': '已缓存 {count} 条消息（最旧的已丢弃）',
      'stream.empty': '还没有消息，等待新数据…',
      'stream.expired': '订阅已在服务端过期，请重新订阅。',
      'stream.resuming': '正在恢复订阅…',
      'common.loading': '加载中…',
      'stream.gap': '两次刷新之间服务端缓冲溢出，有 {count} 条消息未被显示；可通过重新订阅或定位查看历史。',
      'stream.col.time': '时间',
      'stream.col.topic': 'Topic',
      'stream.col.partition': '分区',
      'stream.col.offset': 'Offset',
      'stream.col.key': 'Key',
      'stream.col.size': '大小',
      'filter.partition': '分区',
      'filter.all': '全部',
      'filter.key': 'Key 包含…',
      'filter.noMatch': '缓冲的消息里没有匹配项。',
      'filter.offsetMin': 'Offset ≥',
      'filter.offsetMax': 'Offset ≤',
      'filter.clear': '清空过滤',
      'refresh.manual': '刷新',
      'refresh.auto': '自动刷新',
      'refresh.every': '每',
      'refresh.seconds': '秒',
      'refresh.last': '最后更新 {time}',
      'detail.title': '消息详情',
      'table.colWidth': '拖动调整列宽',
      'split.detailResize': '拖动调整详情高度，双击恢复默认',
      'detail.close': '关闭',
      'detail.meta': '元数据',
      'detail.key': 'Key',
      'detail.value': 'Value',
      'detail.headers': 'Headers',
      'detail.hex': 'Hex',
      'detail.text': '文本',
      'detail.json': 'JSON',
      'detail.json.invalid': '不是合法 JSON，显示原始文本。',
      'detail.null': '(null)',
      'detail.truncated': '服务端已将 payload 截断到前 256 KiB。',
      'detail.keySize': 'Key 大小',
      'detail.valueSize': 'Value 大小',
      'error.generic': '请求失败：{message}',
      'common.null': '—',
    }

    function b64ToBytes(b64) {
      const bin = atob(b64)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    }

    const utf8 = new TextDecoder('utf-8', { fatal: false })

    function bytesPreview(bytes, max) {
      if (bytes.length === 0) return ''
      let printable = true
      const limit = Math.min(bytes.length, max)
      for (let i = 0; i < limit; i++) {
        const b = bytes[i]
        if (b < 0x09 || (b > 0x0d && b < 0x20)) { printable = false; break }
      }
      if (printable) {
        const text = utf8.decode(bytes.subarray(0, limit))
        return bytes.length > limit ? `${text}…` : text
      }
      return `0x${Array.from(bytes.subarray(0, Math.min(bytes.length, 8))).map(b => b.toString(16).padStart(2, '0')).join(' ')}${bytes.length > 8 ? '…' : ''}`
    }

    function hexDump(bytes) {
      const lines = []
      for (let base = 0; base < bytes.length; base += 16) {
        const slice = bytes.subarray(base, Math.min(base + 16, bytes.length))
        const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ')
        const ascii = Array.from(slice).map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')
        lines.push(`${base.toString(16).padStart(8, '0')}  ${hex.padEnd(47, ' ')}  ${ascii}`)
      }
      return lines.join('\n')
    }

    function tryPrettyJson(text) {
      const trimmed = text.trim()
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        return null
      }
    }

    function fmtTime(timestamp) {
      const date = new Date(Number(timestamp))
      if (Number.isNaN(date.getTime())) return timestamp
      const pad = (n, w = 2) => String(n).padStart(w, '0')
      const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
      const now = new Date()
      const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
      return sameDay ? time : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
    }

    function fmtClock(date) {
      const pad = n => String(n).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }

    function fmtBytes(size) {
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`
      return `${(size / 1024 / 1024).toFixed(1)} MiB`
    }

    function messageKey(msg) {
      return `${msg.topic}:${String(msg.partition)}:${msg.offset}`
    }

    async function api(path, options = {}) {
      const init = { method: options.method ?? 'GET' }
      if (options.body !== undefined) {
        init.headers = { 'content-type': 'application/json' }
        init.body = JSON.stringify(options.body)
      }
      if (options.keepalive) init.keepalive = true
      const res = await fetch(`/api/kafka-tool${path}`, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      return data
    }

    function Btn(props) {
      return h('button', {
        type: 'button',
        className: `kx-btn${props.primary ? ' kx-btn-primary' : ''}${props.danger ? ' kx-btn-danger' : ''}`,
        disabled: props.disabled,
        title: props.title,
        onClick: props.onClick,
      }, props.children)
    }

    function Spinner() {
      return h('span', { className: 'kx-spinner', 'aria-hidden': true })
    }

    function Field(props) {
      return h('label', { className: 'kx-field' },
        h('span', { className: 'kx-field-label' }, props.label),
        props.children)
    }

    function KafkaIcon(props) {
      const size = props.size ?? 16
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', 'aria-hidden': true,
      },
        h('circle', { cx: 7, cy: 7, r: 2.4 }),
        h('circle', { cx: 17, cy: 7, r: 2.4 }),
        h('circle', { cx: 7, cy: 17, r: 2.4 }),
        h('circle', { cx: 17, cy: 17, r: 2.4 }),
        h('path', { d: 'M9.2 7h5.6M7 9.2v5.6M17 9.2v5.6M9.2 17h5.6' }))
    }

    function PayloadView(props) {
      const { t, base64 } = props
      const bytes = useMemo(() => (base64 === null ? null : b64ToBytes(base64)), [base64])
      const text = useMemo(() => (bytes === null ? '' : utf8.decode(bytes)), [bytes])
      const pretty = useMemo(() => (bytes === null ? null : tryPrettyJson(text)), [bytes, text])
      const printable = useMemo(() => {
        if (bytes === null) return true
        const limit = Math.min(bytes.length, 8192)
        for (let i = 0; i < limit; i++) {
          const b = bytes[i]
          if (b < 0x09 || (b > 0x0d && b < 0x20)) return false
        }
        return true
      }, [bytes])
      const [tab, setTab] = useState(() => (pretty !== null ? 'json' : printable ? 'text' : 'hex'))
      if (bytes === null) return h('div', { className: 'kx-null' }, t('detail.null'))
      const tabs = [
        ['text', t('detail.text')],
        ['json', t('detail.json')],
        ['hex', t('detail.hex')],
      ]
      return h('div', { className: 'kx-payload' },
        h('div', { className: 'kx-tabs', role: 'tablist', 'aria-label': t('detail.value') },
          tabs.map(([id, label]) => h('button', {
            key: id, type: 'button', role: 'tab',
            'aria-selected': tab === id ? 'true' : 'false',
            className: 'kx-tab',
            onClick: () => setTab(id),
          }, label))),
        tab === 'json' && pretty === null
          ? h('div', null,
              h('div', { className: 'kx-hint' }, t('detail.json.invalid')),
              h('pre', { className: 'kx-pre' }, text))
          : h('pre', { className: 'kx-pre' },
              tab === 'hex' ? hexDump(bytes) : tab === 'json' ? pretty : text))
    }

    function MessageDetail(props) {
      const { t, base, onClose } = props
      const [full, setFull] = useState(null)
      const [fetchError, setFetchError] = useState(null)
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
      const closeDialog = () => {
        const dlg = dialogRef.current
        if (dlg?.open) dlg.close()
        else onCloseRef.current()
      }
      useEffect(() => {
        let cancelled = false
        setFull(null)
        setFetchError(null)
        api('/message', {
          method: 'POST',
          body: { c: props.connId, topic: base.topic, partition: base.partition, offset: base.offset },
        })
          .then(data => { if (!cancelled) setFull(data.message) })
          .catch(err => { if (!cancelled) setFetchError(err.message) })
        return () => { cancelled = true }
      }, [props.connId, base.topic, base.partition, base.offset])
      const headers = Object.entries(base.headers ?? {})
      return h('dialog', {
          className: 'kx-modal', ref: dialogRef, closedby: 'any',
          'aria-labelledby': 'kx-detail-title',
        },
          h('div', { className: 'kx-modal-head' },
            h('span', { className: 'kx-modal-title', id: 'kx-detail-title' }, t('detail.title')),
            h('button', { type: 'button', className: 'kx-icon-btn', title: t('detail.close'), onClick: closeDialog }, '✕')),
          h('div', { className: 'kx-modal-body' },
            h('div', { className: 'kx-section' },
              h('div', { className: 'kx-section-title' }, t('detail.meta')),
              h('table', { className: 'kx-meta' },
                h('tbody', null,
                  [[t('topics.col.name'), base.topic],
                   [t('stream.col.partition'), String(base.partition)],
                   [t('stream.col.offset'), base.offset],
                   [t('stream.start.timestamp'), `${new Date(Number(base.timestamp)).toLocaleString()} (${base.timestamp})`],
                   [t('detail.keySize'), fmtBytes(base.keySize)],
                   [t('detail.valueSize'), fmtBytes(base.valueSize)],
                  ].map(([k, v]) => h('tr', { key: k }, h('td', { className: 'kx-meta-key' }, k), h('td', null, v))))),
              full?.truncated ? h('div', { className: 'kx-hint' }, t('detail.truncated')) : null),
            base.key !== null
              ? h('div', { className: 'kx-section' },
                  h('div', { className: 'kx-section-title' }, t('detail.key')),
                  h(PayloadView, { t, base64: base.key }),
                  base.keyTruncated ? h('div', { className: 'kx-hint' }, t('detail.truncated')) : null)
              : null,
            h('div', { className: 'kx-section' },
              h('div', { className: 'kx-section-title' }, t('detail.value')),
              fetchError !== null
                ? h('div', { className: 'kx-error' }, t('error.generic', { message: fetchError }))
                : full === null
                  ? h('div', { className: 'kx-hint' }, h(Spinner))
                  : h(PayloadView, { t, base64: full.value })),
            headers.length > 0
              ? h('div', { className: 'kx-section' },
                  h('div', { className: 'kx-section-title' }, t('detail.headers')),
                  h('table', { className: 'kx-meta' },
                    h('tbody', null,
                      headers.map(([name, b64]) => h('tr', { key: name },
                        h('td', { className: 'kx-meta-key' }, name),
                        h('td', null, bytesPreview(b64ToBytes(b64), 200)))))))
              : null))
    }

    function useVirtualWindow(rowCount, rowH = ROW_H) {
      const ref = useRef(null)
      const [box, setBox] = useState({ top: 0, height: 0 })
      useEffect(() => {
        const el = ref.current
        if (!el) return
        const update = () => setBox({ top: el.scrollTop, height: el.clientHeight })
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
      }, [])
      const onScroll = useCallback(() => {
        const el = ref.current
        if (el) setBox({ top: el.scrollTop, height: el.clientHeight })
      }, [])
      const start = Math.max(0, Math.floor(box.top / rowH) - 8)
      const end = Math.min(rowCount, Math.ceil((box.top + box.height) / rowH) + 8)
      return { ref, onScroll, start, end }
    }

    function VirtualRows(props) {
      const { rows, renderRow, empty, label } = props
      const win = useVirtualWindow(rows.length)
      return h('div', { ref: win.ref, className: 'kx-virt', onScroll: win.onScroll, tabIndex: 0, role: 'region', 'aria-label': label ?? 'list' },
        rows.length === 0
          ? h('div', { className: 'kx-empty' }, empty)
          : h('div', { style: { height: rows.length * ROW_H, position: 'relative' } },
              h('div', { style: { position: 'absolute', top: win.start * ROW_H, left: 0, right: 0 } },
                rows.slice(win.start, win.end).map(renderRow))))
    }

    /** Shared table column-resize wiring: drag writes <col> widths, release commits state. */
    function useColumnWidths() {
      const [widths, setWidths] = useState({})
      const stopRef = useRef(null)
      const startResize = index => event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const table = event.currentTarget.closest('table')
        const cols = table.querySelectorAll('colgroup > col')
        // Snapshot every column so switching to a fixed layout does not reflow the table.
        const latest = [...table.tHead.rows[0].cells].map((cell, i) => widths[i] ?? Math.round(cell.getBoundingClientRect().width))
        table.style.tableLayout = 'fixed'
        latest.forEach((w, i) => { cols[i].style.width = `${w}px` })
        const startX = event.clientX
        const startWidth = latest[index]
        let frame = 0
        const move = e => {
          latest[index] = Math.round(Math.max(48, startWidth + e.clientX - startX))
          if (!frame) frame = requestAnimationFrame(() => { frame = 0; cols[index].style.width = `${latest[index]}px` })
        }
        const teardown = () => {
          cancelAnimationFrame(frame)
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
          stopRef.current = null
        }
        const finish = () => {
          teardown()
          setWidths(Object.fromEntries(latest.map((w, i) => [i, w])))
        }
        stopRef.current = teardown
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
      }
      useEffect(() => () => stopRef.current?.(), [])
      return { widths, startResize, hasWidth: Object.keys(widths).length > 0 }
    }

    /** Always rendered so a drag can start before the table switches to a fixed layout. */
    function ColumnGroup({ count, widths }) {
      return h('colgroup', null, Array.from({ length: count }, (_, i) =>
        h('col', { key: i, style: widths[i] ? { width: `${widths[i]}px` } : undefined })))
    }

    /** Append one drag handle to every header cell. */
    function withColumnResizers(head, startResize, t) {
      const cells = React.Children.toArray(head.props.children)
      return React.cloneElement(head, null, cells.map((cell, i) => React.cloneElement(cell, { key: i }, [
        cell.props.children,
        h('span', {
          key: 'resize',
          className: 'kx-col-resizer',
          'aria-hidden': true,
          title: t('table.colWidth'),
          onPointerDown: startResize(i),
        }),
      ])))
    }

    // Detail stays outside this table. A variable-height row would break the window math.
    function VirtualTable(props) {
      const { head, rows, renderRow, empty, colSpan, rowH = 28, label, t } = props
      const { widths, startResize, hasWidth } = useColumnWidths()
      const columnCount = React.Children.count(head.props.children)
      const win = useVirtualWindow(rows.length, rowH)
      const spacer = height => h('tr', { style: { height }, 'aria-hidden': true },
        h('td', { colSpan, style: { padding: 0, border: 'none' } }))
      return h('div', { ref: win.ref, className: 'kx-virt', onScroll: win.onScroll, tabIndex: 0, role: 'region', 'aria-label': label ?? 'table' },
        h('table', { className: 'kx-table', style: hasWidth ? { tableLayout: 'fixed' } : undefined },
          h(ColumnGroup, { count: columnCount, widths }),
          h('thead', null, withColumnResizers(head, startResize, t)),
          h('tbody', null,
            rows.length === 0
              ? h('tr', null, h('td', { colSpan, className: 'kx-empty-cell' }, empty))
              : [
                  win.start > 0 ? spacer(win.start * rowH) : null,
                  ...rows.slice(win.start, win.end).map((row, i) => renderRow(row, win.start + i)),
                  win.end < rows.length ? spacer((rows.length - win.end) * rowH) : null,
                ])))
    }

    function TopicPicker(props) {
      const { t, topics, selected, onChange, disabled } = props
      const [open, setOpen] = useState(false)
      const [query, setQuery] = useState('')
      const wrapRef = useRef(null)
      useEffect(() => {
        if (!open) return
        const onDown = event => {
          if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = event => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])
      const visible = (topics ?? []).filter(one => query === '' || one.toLowerCase().includes(query.toLowerCase()))
      const toggle = name => {
        onChange(selected.includes(name) ? selected.filter(one => one !== name) : [...selected, name])
      }
      return h('div', { ref: wrapRef, className: 'kx-picker' },
        h('button', {
          type: 'button', className: 'kx-btn kx-picker-btn', disabled,
          onClick: () => setOpen(!open),
        }, selected.length === 0 ? t('stream.pickTopics.none') : t('stream.pickTopics', { count: selected.length }), ' ▾'),
        open ? h('div', { className: 'kx-picker-pop' },
          h('input', {
            className: 'kx-input', value: query, autoFocus: true,
            placeholder: t('topics.search'),
            onChange: event => setQuery(event.target.value),
          }),
          h('div', { className: 'kx-picker-actions' },
            h('button', {
              type: 'button', className: 'kx-link-btn', disabled: visible.length === 0,
              onClick: () => onChange([...new Set([...selected, ...visible])]),
            }, t('stream.pick.allFiltered')),
            h('button', {
              type: 'button', className: 'kx-link-btn', disabled: selected.length === 0,
              onClick: () => onChange([]),
            }, t('stream.pick.clear'))),
          h('div', { className: 'kx-picker-list' },
            topics === null
              ? h('div', { className: 'kx-empty' }, h(Spinner))
              : h(VirtualRows, {
                  rows: visible,
                  empty: t('topics.empty'),
                  label: t('topics.col.name'),
                  renderRow: name => h('label', {
                    key: name, className: 'kx-check-row', style: { height: ROW_H },
                  },
                    h('input', { type: 'checkbox', checked: selected.includes(name), onChange: () => toggle(name) }),
                    h('span', { className: 'kx-ellipsis', title: name }, name)),
                })))
          : null)
    }

    function KafkaExplorerApp(props) {
      const t = props.t
      const [connForm, setConnForm] = useState(() => panelCache.connForm ?? {
        brokers: '', ssl: false, sasl: false, mechanism: 'plain', username: '', password: '',
      })
      const [conn, setConn] = useState(() => panelCache.connInfo)
      const [connError, setConnError] = useState(null)
      const [connecting, setConnecting] = useState(false)
      const [view, setView] = useState(() => panelCache.view ?? 'stream')
      const [showInternal, setShowInternal] = useState(false)
      const [topicQuery, setTopicQuery] = useState('')
      const [groupQuery, setGroupQuery] = useState('')

      const [topics, setTopics] = useState(null)
      const [topicsError, setTopicsError] = useState(null)
      const [loadingTopics, setLoadingTopics] = useState(false)
      const [expandedTopic, setExpandedTopic] = useState(null)
      const [topicOffsets, setTopicOffsets] = useState({})
      const expandedTopicRef = useRef(null)
      useEffect(() => { expandedTopicRef.current = expandedTopic }, [expandedTopic])

      const [groups, setGroups] = useState(null)
      const [groupsError, setGroupsError] = useState(null)
      const [loadingGroups, setLoadingGroups] = useState(false)
      const [expandedGroup, setExpandedGroup] = useState(null)
      const [groupOffsets, setGroupOffsets] = useState({})
      const expandedGroupRef = useRef(null)
      useEffect(() => { expandedGroupRef.current = expandedGroup }, [expandedGroup])

      const [selectedTopics, setSelectedTopics] = useState(() => panelCache.selectedTopics ?? [])
      const [startMode, setStartMode] = useState('latest')
      const [startTimestamp, setStartTimestamp] = useState('')
      const [startOffset, setStartOffset] = useState('')

      const [sub, setSub] = useState(null) // {id, epoch, partitions}; restored by the resume effect
      const [subscribing, setSubscribing] = useState(false)
      const subscribingRef = useRef(false)
      const [streamError, setStreamError] = useState(null)
      const [olderDone, setOlderDone] = useState(false)
      const [olderLoading, setOlderLoading] = useState(false)
      const [resuming, setResuming] = useState(() => panelCache.connInfo !== null)

      const [auto, setAuto] = useState(() => panelCache.auto ?? { enabled: true, intervalSec: 10 })
      const [configReady, setConfigReady] = useState(() => panelCache.connForm !== null)
      const [lastUpdate, setLastUpdate] = useState(null)

      const [filters, setFilters] = useState({ partition: 'all', key: '', offsetMin: '', offsetMax: '' })
      const [detail, setDetail] = useState(null)
      const [gapNotice, setGapNotice] = useState(0)

      const messagesRef = useRef([])
      const [messagesVersion, setMessagesVersion] = useState(0)
      const lastSeqRef = useRef(0)
      const inFlightRef = useRef(false)
      const cappedRef = useRef(false)

      const connRef = useRef(conn)
      const subRef = useRef(sub)
      const persistedRef = useRef(panelCache.configSnapshot ?? null)
      useEffect(() => { connRef.current = conn }, [conn])
      useEffect(() => { subRef.current = sub }, [sub])

      useEffect(() => {
        panelCache.connInfo = conn
        panelCache.connForm = connForm
        panelCache.auto = auto
        panelCache.configSnapshot = persistedRef.current
        panelCache.selectedTopics = selectedTopics
        panelCache.view = view
        panelCache.subId = sub?.id ?? null
      }, [conn, connForm, auto, selectedTopics, view, sub])

      // The host file is the source of truth. The password stays in this mount.
      useEffect(() => {
        if (configReady) return
        let alive = true
        const apply = (connection, refresh) => {
          if (!alive || !connection) return
          setConnForm(prev => ({
            ...prev,
            brokers: Array.isArray(connection.brokers) ? connection.brokers.join(', ') : prev.brokers,
            ssl: connection.ssl === true,
            sasl: connection.sasl !== null && connection.sasl !== undefined,
            mechanism: connection.sasl?.mechanism ?? prev.mechanism,
            username: connection.sasl?.username ?? prev.username,
          }))
          if (refresh) setAuto(prev => ({ ...prev, ...refresh }))
          // Remember what the host already has so an unchanged mount does not rewrite the file.
          persistedRef.current = JSON.stringify({
            connection,
            refresh: refresh ?? { enabled: true, intervalSec: 10 },
          })
        }
        api('/config')
          .then(d => apply(d.config?.connection, d.config?.refresh))
          .catch(() => api('/defaults').then(d => apply({
            brokers: Array.isArray(d.brokers) ? d.brokers : [],
            ssl: d.ssl === true,
            sasl: d.sasl ?? null,
          })).catch(() => {}))
          .finally(() => { if (alive) setConfigReady(true) })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      useEffect(() => {
        if (!configReady) return
        const { password, ...rest } = connForm
        const connection = {
          brokers: String(rest.brokers ?? '').split(',').map(one => one.trim()).filter(one => one !== ''),
          ssl: rest.ssl === true,
          sasl: rest.sasl ? { mechanism: rest.mechanism, username: rest.username } : null,
        }
        const payload = { connection, refresh: auto }
        const key = JSON.stringify(payload)
        if (key === persistedRef.current) return
        const timer = setTimeout(() => {
          api('/config', { method: 'PUT', body: payload })
            .then(() => { persistedRef.current = key })
            .catch(() => {})
        }, 400)
        return () => clearTimeout(timer)
      }, [connForm, auto, configReady])

      const bumpMessages = useCallback(() => setMessagesVersion(v => v + 1), [])

      const refreshTopicOffsets = useCallback(async name => {
        const current = connRef.current
        if (!current) return
        setTopicOffsets(prev => ({ ...prev, [name]: null }))
        try {
          const data = await api(`/topic-offsets?c=${encodeURIComponent(current.id)}&topic=${encodeURIComponent(name)}`)
          setTopicOffsets(prev => ({ ...prev, [name]: data.partitions }))
        } catch (err) {
          setTopicOffsets(prev => ({ ...prev, [name]: { error: err.message } }))
        }
      }, [])

      const loadTopics = useCallback(async () => {
        const current = connRef.current
        if (!current) return
        setLoadingTopics(true)
        setTopicsError(null)
        try {
          const data = await api(`/topics?c=${encodeURIComponent(current.id)}`)
          setTopics(data.topics)
          setLastUpdate(new Date())
          if (expandedTopicRef.current !== null) refreshTopicOffsets(expandedTopicRef.current)
        } catch (err) {
          setTopicsError(err.message)
        } finally {
          setLoadingTopics(false)
        }
      }, [refreshTopicOffsets])

      const refreshGroupOffsets = useCallback(async groupId => {
        const current = connRef.current
        if (!current) return
        setGroupOffsets(prev => ({ ...prev, [groupId]: null }))
        try {
          const data = await api(`/group-offsets?c=${encodeURIComponent(current.id)}&group=${encodeURIComponent(groupId)}`)
          setGroupOffsets(prev => ({ ...prev, [groupId]: data.topics }))
        } catch (err) {
          setGroupOffsets(prev => ({ ...prev, [groupId]: { error: err.message } }))
        }
      }, [])

      const loadGroups = useCallback(async () => {
        const current = connRef.current
        if (!current) return
        setLoadingGroups(true)
        setGroupsError(null)
        try {
          const data = await api(`/groups?c=${encodeURIComponent(current.id)}`)
          setGroups(data.groups)
          setLastUpdate(new Date())
          if (expandedGroupRef.current !== null) refreshGroupOffsets(expandedGroupRef.current)
        } catch (err) {
          setGroupsError(err.message)
        } finally {
          setLoadingGroups(false)
        }
      }, [refreshGroupOffsets])

      function decorate(msg) {
        const bytes = msg.key === null ? null : b64ToBytes(msg.key)
        return {
          ...msg,
          keyPreview: bytes === null ? '' : bytesPreview(bytes, 40),
          keyText: bytes === null ? '' : utf8.decode(bytes).toLowerCase(),
        }
      }

      const poll = useCallback(async () => {
        const current = subRef.current
        if (!current || inFlightRef.current) return
        inFlightRef.current = true
        try {
          const data = await api(`/subscriptions/${encodeURIComponent(current.id)}/messages?after=${String(lastSeqRef.current)}&limit=${String(POLL_LIMIT)}`)
          // A late response after stop or disconnect must not refill cleared state.
          if (subRef.current !== current) return
          if (data.epoch !== current.epoch) {
            // A seek we did not start. Drop the local buffer.
            messagesRef.current = []
            lastSeqRef.current = 0
            cappedRef.current = false
            setGapNotice(0)
            setOlderDone(false)
            setSub({ ...current, epoch: data.epoch })
            bumpMessages()
          }
          if (data.dropped > 0) setGapNotice(data.dropped)
          if (data.messages.length > 0) {
            const merged = messagesRef.current.concat(data.messages.map(decorate))
            lastSeqRef.current = data.latest
            if (merged.length > MAX_ROWS) {
              // Tail keeps the newest rows.
              merged.splice(0, merged.length - MAX_ROWS)
              cappedRef.current = true
            }
            messagesRef.current = merged
            bumpMessages()
          }
          setLastUpdate(new Date())
          setStreamError(null)
        } catch (err) {
          if (subRef.current !== current) return
          if (/subscription not found/.test(err.message)) {
            // Idle sweep ended the tail. Rows already buffered stay readable.
            subRef.current = null
            setSub(null)
            setStreamError(t('stream.expired'))
          } else {
            setStreamError(err.message)
          }
        } finally {
          inFlightRef.current = false
        }
      }, [bumpMessages, t])

      const connect = useCallback(async (form) => {
        // A click event is not a form. Only an object with brokers is.
        const f = form !== null && typeof form === 'object' && typeof form.brokers === 'string' ? form : connForm
        setConnecting(true)
        setConnError(null)
        try {
          const brokers = f.brokers.split(',').map(one => one.trim()).filter(one => one !== '')
          const body = { brokers }
          if (f.ssl) body.ssl = true
          if (f.sasl) {
            body.sasl = { mechanism: f.mechanism, username: f.username, password: f.password }
          }
          const data = await api('/connections', { method: 'POST', body })
          connRef.current = data
          setConn(data)
          setTopics(null)
          setGroups(null)
          loadTopics()
        } catch (err) {
          setConnError(err.message)
        } finally {
          setConnecting(false)
        }
      }, [connForm, loadTopics])

      const disconnect = useCallback(() => {
        const current = connRef.current
        const currentSub = subRef.current
        connRef.current = null
        subRef.current = null
        setConn(null)
        setSub(null)
        setTopics(null)
        setGroups(null)
        setGroupOffsets({})
        setExpandedGroup(null)
        setTopicOffsets({})
        setExpandedTopic(null)
        setDetail(null)
        setStreamError(null)
        setGapNotice(0)
        setOlderDone(false)
        cappedRef.current = false
        messagesRef.current = []
        lastSeqRef.current = 0
        bumpMessages()
        if (currentSub) {
          api(`/subscriptions/${encodeURIComponent(currentSub.id)}`, { method: 'DELETE', keepalive: true }).catch(() => {})
        }
        if (current) {
          api(`/connections/${encodeURIComponent(current.id)}`, { method: 'DELETE', keepalive: true }).catch(() => {})
        }
      }, [bumpMessages])

      const stopSubscription = useCallback(() => {
        const current = subRef.current
        subRef.current = null
        setSub(null)
        setStreamError(null)
        setGapNotice(0)
        setOlderDone(false)
        cappedRef.current = false
        messagesRef.current = []
        lastSeqRef.current = 0
        bumpMessages()
        if (current) {
          api(`/subscriptions/${encodeURIComponent(current.id)}`, { method: 'DELETE', keepalive: true }).catch(() => {})
        }
      }, [bumpMessages])

      const subscribe = useCallback(async () => {
        const current = connRef.current
        if (!current || selectedTopics.length === 0 || subscribingRef.current) return
        subscribingRef.current = true
        setSubscribing(true)
        setStreamError(null)
        setGapNotice(0)
        const previous = subRef.current
        try {
          const start = { mode: startMode }
          if (startMode === 'timestamp') {
            const ts = Date.parse(startTimestamp)
            if (!Number.isFinite(ts)) throw new Error(t('stream.timestamp.invalid'))
            start.timestamp = ts
          } else if (startMode === 'offset') {
            start.offset = startOffset
          }
          const previousTopics = previous === null ? [] : [...new Set(previous.partitions.map(one => one.topic))].sort()
          const nextTopics = [...selectedTopics].sort()
          if (previous && previousTopics.length === nextTopics.length && previousTopics.every((one, i) => one === nextTopics[i])) {
            const data = await api(`/subscriptions/${encodeURIComponent(previous.id)}/seek`, { method: 'POST', body: start })
            if (subRef.current !== previous) return
            messagesRef.current = []
            lastSeqRef.current = 0
            cappedRef.current = false
            bumpMessages()
            setOlderDone(false)
            setSub({ id: data.id, epoch: data.epoch, partitions: data.partitions })
            return
          }
          const data = await api('/subscriptions', {
            method: 'POST',
            body: { c: current.id, topics: selectedTopics, start },
          })
          if (connRef.current !== current || subRef.current !== previous) {
            // Disconnect during create leaves this consumer unowned. Delete it.
            api(`/subscriptions/${encodeURIComponent(data.id)}`, { method: 'DELETE', keepalive: true }).catch(() => {})
            return
          }
          if (previous) {
            api(`/subscriptions/${encodeURIComponent(previous.id)}`, { method: 'DELETE', keepalive: true }).catch(() => {})
          }
          messagesRef.current = []
          lastSeqRef.current = 0
          cappedRef.current = false
          bumpMessages()
          setOlderDone(false)
          setSub({ id: data.id, epoch: data.epoch, partitions: data.partitions })
        } catch (err) {
          if (connRef.current === current && subRef.current === previous) setStreamError(err.message)
        } finally {
          subscribingRef.current = false
          setSubscribing(false)
        }
      }, [selectedTopics, startMode, startTimestamp, startOffset, bumpMessages, t])

      async function pool(items, size, fn) {
        const results = new Array(items.length)
        let cursor = 0
        await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
          while (cursor < items.length) {
            const index = cursor++
            results[index] = await fn(items[index])
          }
        }))
        return results
      }

      const loadOlder = useCallback(async () => {
        const currentConn = connRef.current
        const current = subRef.current
        if (!currentConn || !current || olderLoading) return
        setOlderLoading(true)
        try {
          const minByPart = new Map()
          for (const msg of messagesRef.current) {
            const key = `${msg.topic}:${String(msg.partition)}`
            const existing = minByPart.get(key)
            if (existing === undefined || BigInt(msg.offset) < BigInt(existing)) minByPart.set(key, msg.offset)
          }
          // Display filters must not shrink this window.
          const parts = current.partitions
          const results = await pool(parts, BACKFILL_CONCURRENCY, async part => {
            const key = `${part.topic}:${String(part.partition)}`
            const before = minByPart.get(key) ?? part.high
            if (BigInt(before) <= BigInt(part.low)) return { messages: [], reachedBeginning: true }
            return api('/backfill', {
              method: 'POST',
              body: { c: currentConn.id, topic: part.topic, partition: part.partition, before, count: BACKFILL_COUNT },
            })
          })
          if (subRef.current !== current) return
          const known = new Set(messagesRef.current.map(messageKey))
          const added = []
          let allAtBeginning = parts.length > 0
          for (const result of results) {
            if (!result.reachedBeginning) allAtBeginning = false
            for (const msg of result.messages) {
              const key = messageKey(msg)
              if (!known.has(key)) {
                known.add(key)
                added.push(msg)
              }
            }
          }
          if (added.length > 0) {
            const merged = messagesRef.current.concat(added.map(decorate))
            merged.sort((a, b) => {
              const dt = Number(a.timestamp) - Number(b.timestamp)
              if (dt !== 0) return dt
              const dc = a.topic.localeCompare(b.topic)
              if (dc !== 0) return dc
              if (a.partition !== b.partition) return a.partition - b.partition
              return BigInt(a.offset) < BigInt(b.offset) ? -1 : 1
            })
            if (merged.length > MAX_ROWS) {
              // History keeps the oldest rows. Drop the newest end.
              merged.splice(MAX_ROWS)
              cappedRef.current = true
            }
            messagesRef.current = merged
            bumpMessages()
          }
          if (allAtBeginning) setOlderDone(true)
          setLastUpdate(new Date())
        } catch (err) {
          if (subRef.current === current) setStreamError(err.message)
        } finally {
          setOlderLoading(false)
        }
      }, [olderLoading, bumpMessages])

      useEffect(() => {
        if (!auto.enabled) return undefined
        const sec = Math.min(Math.max(Number(auto.intervalSec) || 5, 1), 3600)
        const timer = setInterval(() => {
          if (view === 'stream') {
            if (subRef.current) poll()
          } else if (view === 'topics' && connRef.current) {
            loadTopics()
          } else if (view === 'groups' && connRef.current) {
            loadGroups()
          }
        }, sec * 1000)
        return () => clearInterval(timer)
      }, [auto.enabled, auto.intervalSec, view, poll, loadTopics, loadGroups])

      useEffect(() => {
        if (!conn) return
        if (view === 'topics' && topics === null && !loadingTopics) loadTopics()
        if (view === 'groups' && groups === null && !loadingGroups) loadGroups()
      }, [view, conn, topics, groups, loadingTopics, loadingGroups, loadTopics, loadGroups])

      const autoTriedRef = useRef(false)
      useEffect(() => {
        if (autoTriedRef.current) return
        autoTriedRef.current = true
        const cached = panelCache.connInfo
        if (cached !== null) {
          api(`/connections/${encodeURIComponent(cached.id)}`)
            .then(async info => {
              connRef.current = info
              setConn(info)
              await loadTopics()
              const subId = panelCache.subId
              if (subId !== null) {
                try {
                  const subInfo = await api(`/subscriptions/${encodeURIComponent(subId)}`)
                  const tail = await api(`/subscriptions/${encodeURIComponent(subId)}/messages?tail=${String(RESUME_TAIL)}`)
                  messagesRef.current = tail.messages.map(decorate)
                  lastSeqRef.current = tail.latest
                  cappedRef.current = false
                  bumpMessages()
                  subRef.current = subInfo
                  setSub(subInfo)
                  setStreamError(null)
                } catch {
                  panelCache.subId = null
                  subRef.current = null
                  setSub(null)
                  setStreamError(t('stream.expired'))
                }
              }
            })
            .catch(() => {
              // Host idle sweep or restart. Do not open a new connection.
              panelCache.connInfo = null
              panelCache.subId = null
              setConn(null)
            })
            .finally(() => setResuming(false))
          return
        }
        setResuming(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const topicNames = useMemo(() => {
        if (topics === null) return []
        return topics.filter(one => showInternal || !one.name.startsWith('__')).map(one => one.name)
      }, [topics, showInternal])

      const visibleTopics = useMemo(
        () => (topics ?? []).filter(one => showInternal || !one.name.startsWith('__')),
        [topics, showInternal],
      )

      const filteredTopics = useMemo(() => {
        const query = topicQuery.trim().toLowerCase()
        if (query === '') return visibleTopics
        return visibleTopics.filter(one => one.name.toLowerCase().includes(query))
      }, [visibleTopics, topicQuery])

      const filteredGroups = useMemo(() => {
        const query = groupQuery.trim().toLowerCase()
        if (query === '') return groups ?? []
        return (groups ?? []).filter(one => one.groupId.toLowerCase().includes(query))
      }, [groups, groupQuery])

      const filteredMessages = useMemo(() => {
        void messagesVersion
        const part = filters.partition
        const keyText = filters.key.trim().toLowerCase()
        const min = filters.offsetMin.trim() === '' ? null : BigInt(filters.offsetMin.trim())
        const max = filters.offsetMax.trim() === '' ? null : BigInt(filters.offsetMax.trim())
        return messagesRef.current.filter(msg => {
          if (part !== 'all' && `${msg.topic}|${String(msg.partition)}` !== part) return false
          if (min !== null && BigInt(msg.offset) < min) return false
          if (max !== null && BigInt(msg.offset) > max) return false
          if (keyText !== '' && !msg.keyText.includes(keyText)) return false
          return true
        })
      }, [messagesVersion, filters])

      const renderMessageRow = useCallback(msg => {
        const open = () => setDetail(msg)
        return h('tr', {
          key: messageKey(msg),
          className: 'kx-row',
          style: { height: ROW_H },
          tabIndex: 0,
          onClick: open,
          onKeyDown: event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            open()
          },
        },
          h('td', { className: 'kx-cell kx-col-time', title: new Date(Number(msg.timestamp)).toLocaleString() }, fmtTime(msg.timestamp)),
          h('td', { className: 'kx-cell kx-col-topic kx-ellipsis', title: msg.topic }, msg.topic),
          h('td', { className: 'kx-cell kx-col-part' }, String(msg.partition)),
          h('td', { className: 'kx-cell kx-col-offset' }, msg.offset),
          h('td', { className: 'kx-cell kx-col-key kx-ellipsis', title: msg.keyPreview }, msg.keyPreview),
          h('td', { className: 'kx-cell kx-col-size' }, fmtBytes(msg.valueSize)))
      }, [])

      const connBar = h('div', { className: 'kx-conn' },
        h('input', {
          className: 'kx-input kx-conn-brokers',
          value: connForm.brokers,
          disabled: conn !== null,
          placeholder: t('conn.brokers.placeholder'),
          title: t('conn.brokers'),
          onChange: event => setConnForm({ ...connForm, brokers: event.target.value }),
        }),
        h('label', { className: 'kx-check-inline', title: t('conn.ssl.title') },
          h('input', {
            type: 'checkbox', checked: connForm.ssl, disabled: conn !== null,
            onChange: event => setConnForm({ ...connForm, ssl: event.target.checked }),
          }),
          t('conn.ssl')),
        h('label', { className: 'kx-check-inline', title: t('conn.sasl.title') },
          h('input', {
            type: 'checkbox', checked: connForm.sasl, disabled: conn !== null,
            onChange: event => setConnForm({ ...connForm, sasl: event.target.checked }),
          }),
          t('conn.sasl')),
        connForm.sasl && conn === null
          ? h(React.Fragment, null,
              h('select', {
                className: 'kx-input kx-select', value: connForm.mechanism,
                onChange: event => setConnForm({ ...connForm, mechanism: event.target.value }),
              },
                h('option', { value: 'plain' }, 'PLAIN'),
                h('option', { value: 'scram-sha-256' }, 'SCRAM-SHA-256'),
                h('option', { value: 'scram-sha-512' }, 'SCRAM-SHA-512')),
              h('input', {
                className: 'kx-input kx-conn-user', value: connForm.username,
                placeholder: t('conn.username'),
                onChange: event => setConnForm({ ...connForm, username: event.target.value }),
              }),
              h('input', {
                className: 'kx-input kx-conn-pass', type: 'password', value: connForm.password,
                placeholder: t('conn.password'),
                onChange: event => setConnForm({ ...connForm, password: event.target.value }),
              }))
          : null,
        conn === null
          ? h(Btn, { primary: true, disabled: connecting, onClick: () => connect() }, connecting ? t('conn.connecting') : t('conn.connect'))
          : h(Btn, { onClick: disconnect }, t('conn.disconnect')),
        conn !== null
          ? h('span', { className: 'kx-conn-status' },
              h('span', { className: 'kx-dot' }),
              h('span', { className: 'kx-ellipsis', title: conn.brokers.join(', ') }, t('conn.connected', { cluster: conn.clusterId ?? conn.brokers[0] })))
          : null,
        connError ? h('span', { className: 'kx-error', title: connError }, connError) : null)

      const viewTabs = h('div', { className: 'kx-viewtabs', role: 'tablist', 'aria-label': t('panel') },
        [['stream', t('view.stream')], ['topics', t('view.topics')], ['groups', t('view.groups')]].map(([id, label]) =>
          h('button', {
            key: id, type: 'button', role: 'tab',
            'aria-selected': view === id ? 'true' : 'false',
            className: 'kx-viewtab',
            onClick: () => setView(id),
          }, label)),
        h('span', { className: 'kx-spacer' }),
        h('label', { className: 'kx-check-inline', title: t('refresh.auto') },
          h('input', {
            type: 'checkbox', checked: auto.enabled,
            onChange: event => setAuto({ ...auto, enabled: event.target.checked }),
          }),
          t('refresh.auto')),
        auto.enabled
          ? h(React.Fragment, null,
              h('span', { className: 'kx-dim' }, t('refresh.every')),
              h('input', {
                key: String(auto.intervalSec),
                className: 'kx-input kx-interval', type: 'number', min: 1, max: 3600,
                defaultValue: String(auto.intervalSec),
                onBlur: event => {
                  const sec = Math.min(Math.max(Number(event.target.value) || 5, 1), 3600)
                  if (sec !== auto.intervalSec) setAuto({ ...auto, intervalSec: sec })
                  event.target.value = String(sec)
                },
                onKeyDown: event => { if (event.key === 'Enter') event.target.blur() },
              }),
              h('span', { className: 'kx-dim' }, t('refresh.seconds')))
          : null,
        h(Btn, {
          disabled: view === 'stream' ? !sub : !conn,
          onClick: () => {
            if (view === 'stream') poll()
            else if (view === 'topics') loadTopics()
            else loadGroups()
          },
        }, t('refresh.manual')),
        lastUpdate ? h('span', { className: 'kx-dim kx-last' }, t('refresh.last', { time: fmtClock(lastUpdate) })) : null)

      const streamView = h('div', { className: 'kx-pane' },
        h('div', { className: 'kx-toolbar' },
          h(TopicPicker, {
            t, topics: topicNames, selected: selectedTopics,
            disabled: !conn,
            onChange: setSelectedTopics,
          }),
          h('select', {
            className: 'kx-input kx-select', value: startMode, disabled: !conn,
            title: t('stream.start.mode'),
            onChange: event => setStartMode(event.target.value),
          },
            h('option', { value: 'latest' }, t('stream.start.latest')),
            h('option', { value: 'earliest' }, t('stream.start.earliest')),
            h('option', { value: 'timestamp' }, t('stream.start.timestamp')),
            h('option', { value: 'offset' }, t('stream.start.offset'))),
          startMode === 'timestamp'
            ? h('input', {
                className: 'kx-input', type: 'datetime-local', step: 1,
                value: startTimestamp,
                onChange: event => setStartTimestamp(event.target.value),
              })
            : null,
          startMode === 'offset'
            ? h('input', {
                className: 'kx-input kx-offset-input', value: startOffset, placeholder: '0',
                onChange: event => setStartOffset(event.target.value.replace(/[^0-9]/g, '')),
              })
            : null,
          sub === null
            ? h(Btn, { primary: true, disabled: !conn || selectedTopics.length === 0 || subscribing, title: selectedTopics.length === 0 ? t('stream.needTopics') : undefined, onClick: subscribe }, subscribing ? h(Spinner) : null, t('stream.subscribe'))
            : h(React.Fragment, null,
                h(Btn, { disabled: subscribing, onClick: subscribe, title: t('stream.resubscribe') }, subscribing ? h(Spinner) : null, t('stream.subscribe')),
                h(Btn, { danger: true, onClick: stopSubscription }, t('stream.stop'))),
          h('span', { className: 'kx-spacer' }),
          h(Btn, {
            disabled: !sub || olderDone || olderLoading,
            title: olderDone ? t('stream.older.done') : undefined,
            onClick: loadOlder,
          }, olderLoading ? h(Spinner) : null, olderDone ? t('stream.older.done') : t('stream.older'))),
        h('div', { className: 'kx-toolbar kx-toolbar-filters' },
          h('select', {
            className: 'kx-input kx-select', value: filters.partition,
            title: t('filter.partition'),
            onChange: event => setFilters({ ...filters, partition: event.target.value }),
          },
            h('option', { value: 'all' }, `${t('filter.partition')}: ${t('filter.all')}`),
            (sub?.partitions ?? []).map(one => h('option', { key: `${one.topic}:${String(one.partition)}`, value: `${one.topic}|${String(one.partition)}` }, `${one.topic} · ${String(one.partition)}`))),
          h('input', {
            className: 'kx-input kx-filter', value: filters.key, placeholder: t('filter.key'),
            onChange: event => setFilters({ ...filters, key: event.target.value }),
          }),
          h('input', {
            className: 'kx-input kx-offset', value: filters.offsetMin, placeholder: t('filter.offsetMin'),
            onChange: event => setFilters({ ...filters, offsetMin: event.target.value.replace(/[^0-9]/g, '') }),
          }),
          h('input', {
            className: 'kx-input kx-offset', value: filters.offsetMax, placeholder: t('filter.offsetMax'),
            onChange: event => setFilters({ ...filters, offsetMax: event.target.value.replace(/[^0-9]/g, '') }),
          }),
          h(Btn, { onClick: () => setFilters({ partition: 'all', key: '', offsetMin: '', offsetMax: '' }) }, t('filter.clear')),
          h('span', { className: 'kx-spacer' }),
          h('span', { className: 'kx-dim' }, t(cappedRef.current ? 'stream.buffer.capped' : 'stream.buffer', { count: messagesRef.current.length }))),
        gapNotice > 0 ? h('div', { className: 'kx-warn-bar' }, t('stream.gap', { count: gapNotice })) : null,
        streamError ? h('div', { className: 'kx-error-bar' }, t('error.generic', { message: streamError })) : null,
        !conn
          ? h('div', { className: 'kx-empty' }, t('conn.required'))
          : h(VirtualTable, {
              head: h('tr', null,
                h('th', { className: 'kx-cell kx-col-time' }, t('stream.col.time')),
                h('th', { className: 'kx-cell kx-col-topic' }, t('stream.col.topic')),
                h('th', { className: 'kx-cell kx-col-part' }, t('stream.col.partition')),
                h('th', { className: 'kx-cell kx-col-offset' }, t('stream.col.offset')),
                h('th', { className: 'kx-cell kx-col-key' }, t('stream.col.key')),
                h('th', { className: 'kx-cell kx-col-size' }, t('stream.col.size'))),
              rows: filteredMessages,
              colSpan: 6,
              rowH: ROW_H,
              renderRow: renderMessageRow,
              t,
              label: t('stream.col.time'),
              empty: resuming && sub === null
                ? t('stream.resuming')
                : sub
                  ? (messagesRef.current.length > 0 ? t('filter.noMatch') : t('stream.empty'))
                  : t('stream.needTopics'),
            }))

      const topicsView = h('div', { className: 'kx-pane' },
        h('div', { className: 'kx-toolbar' },
          h(Btn, { disabled: !conn || loadingTopics, onClick: loadTopics }, loadingTopics ? h(Spinner) : null, t('topics.reload')),
          h('input', {
            className: 'kx-input kx-filter', value: topicQuery, placeholder: t('topics.search'),
            onChange: event => setTopicQuery(event.target.value),
          }),
          h('label', { className: 'kx-check-inline' },
            h('input', { type: 'checkbox', checked: showInternal, onChange: event => setShowInternal(event.target.checked) }),
            t('topics.showInternal')),
          topicsError ? h('span', { className: 'kx-error' }, t('error.generic', { message: topicsError })) : null),
        !conn
          ? h('div', { className: 'kx-empty' }, t('conn.required'))
          : topics === null
            ? (topicsError
                ? h('div', { className: 'kx-empty' },
                    h('div', { className: 'kx-error' }, t('error.generic', { message: topicsError })),
                    h(Btn, { onClick: loadTopics }, t('topics.reload')))
                : h('div', { className: 'kx-empty' }, h(Spinner), t('common.loading')))
            : (() => {
                const table = h(VirtualTable, {
                  t,
                  head: h('tr', null,
                    h('th', null, t('topics.col.name')),
                    h('th', { className: 'kx-num' }, t('topics.col.partitions')),
                    h('th', null, '')),
                  rows: filteredTopics,
                  colSpan: 3,
                  empty: t('topics.empty'),
                  label: t('topics.col.name'),
                  renderRow: topic => h('tr', {
                    key: topic.name,
                    className: `kx-row-click${expandedTopic === topic.name ? ' kx-row-selected' : ''}`,
                    tabIndex: 0,
                    onClick: () => {
                      const next = expandedTopic === topic.name ? null : topic.name
                      setExpandedTopic(next)
                      if (next !== null && topicOffsets[next] === undefined) refreshTopicOffsets(next)
                    },
                    onKeyDown: (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      const next = expandedTopic === topic.name ? null : topic.name
                      setExpandedTopic(next)
                      if (next !== null && topicOffsets[next] === undefined) refreshTopicOffsets(next)
                    },
                  },
                    h('td', { className: 'kx-ellipsis', title: topic.name }, topic.name),
                    h('td', { className: 'kx-num' }, String(topic.partitionCount)),
                    h('td', null,
                      h(Btn, {
                        onClick: () => {
                          setSelectedTopics(prev => prev.includes(topic.name) ? prev : [...prev, topic.name])
                          setView('stream')
                        },
                      }, t('topics.subscribe')))),
                })
                const detail = expandedTopic === null
                  ? null
                  : (() => {
                      const topic = (topics ?? []).find(one => one.name === expandedTopic)
                      const offsets = topicOffsets[expandedTopic]
                      return h('div', { className: 'kx-detail kx-detail-pane' },
                        h('div', { className: 'kx-detail-head' },
                          h('span', { className: 'kx-detail-title kx-ellipsis', title: expandedTopic }, expandedTopic),
                          h('span', { className: 'kx-spacer' }),
                          h(Btn, { onClick: () => refreshTopicOffsets(expandedTopic) }, t('refresh.manual')),
                          h('button', { type: 'button', className: 'kx-icon-btn', title: t('detail.close'), onClick: () => setExpandedTopic(null) }, '✕')),
                        offsets === undefined || offsets === null
                          ? h('div', { className: 'kx-empty' }, h(Spinner))
                          : !Array.isArray(offsets)
                            ? h('div', { className: 'kx-error' }, offsets.error)
                            : h('div', { className: 'kx-detail-body' },
                                h(VirtualTable, {
                                  t,
                                  label: t('topics.part.col'),
                                  empty: t('common.null'),
                                  colSpan: 5,
                                  head: h('tr', null,
                                    h('th', { className: 'kx-num' }, t('topics.part.col')),
                                    h('th', { className: 'kx-num' }, t('topics.leader')),
                                    h('th', { className: 'kx-num' }, t('topics.begin')),
                                    h('th', { className: 'kx-num' }, t('topics.end')),
                                    h('th', { className: 'kx-num' }, t('topics.col.size'))),
                                  rows: offsets,
                                  renderRow: part => h('tr', { key: part.partition },
                                    h('td', { className: 'kx-num' }, String(part.partition)),
                                    h('td', { className: 'kx-num' }, String(topic?.partitions.find(one => one.partition === part.partition)?.leader ?? -1)),
                                    h('td', { className: 'kx-num' }, part.low),
                                    h('td', { className: 'kx-num' }, part.high),
                                    h('td', { className: 'kx-num' }, part.size)),
                                })))
                    })()
                if (detail === null) return table
                return h(Group, { className: 'kx-split', orientation: 'vertical' },
                  h(Panel, { id: 'topics-list', minSize: 120 }, table),
                  h(Separator, { className: 'kx-splitter', title: t('split.detailResize'), 'aria-label': t('split.detailResize') }),
                  h(Panel, { id: 'topics-detail', defaultSize: 220, minSize: 120, maxSize: '70%' }, detail))
              })())

      const groupsView = h('div', { className: 'kx-pane' },
        h('div', { className: 'kx-toolbar' },
          h(Btn, { disabled: !conn || loadingGroups, onClick: loadGroups }, loadingGroups ? h(Spinner) : null, t('groups.reload')),
          h('input', {
            className: 'kx-input kx-filter', value: groupQuery, placeholder: t('groups.search'),
            onChange: event => setGroupQuery(event.target.value),
          }),
          groupsError ? h('span', { className: 'kx-error' }, t('error.generic', { message: groupsError })) : null),
        !conn
          ? h('div', { className: 'kx-empty' }, t('conn.required'))
          : groups === null
            ? (groupsError
                ? h('div', { className: 'kx-empty' },
                    h('div', { className: 'kx-error' }, t('error.generic', { message: groupsError })),
                    h(Btn, { onClick: loadGroups }, t('groups.reload')))
                : h('div', { className: 'kx-empty' }, h(Spinner), t('common.loading')))
            : (() => {
                const table = h(VirtualTable, {
                  t,
                  head: h('tr', null,
                    h('th', null, t('groups.col.id')),
                    h('th', null, t('groups.col.state')),
                    h('th', { className: 'kx-num' }, t('groups.col.members')),
                    h('th', null, t('groups.col.protocol'))),
                  rows: filteredGroups,
                  colSpan: 4,
                  empty: t('groups.empty'),
                  label: t('groups.col.id'),
                  renderRow: group => h('tr', {
                    key: group.groupId,
                    className: `kx-row-click${expandedGroup === group.groupId ? ' kx-row-selected' : ''}`,
                    tabIndex: 0,
                    onClick: () => {
                      const next = expandedGroup === group.groupId ? null : group.groupId
                      setExpandedGroup(next)
                      if (next !== null && groupOffsets[next] === undefined) refreshGroupOffsets(next)
                    },
                    onKeyDown: (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      const next = expandedGroup === group.groupId ? null : group.groupId
                      setExpandedGroup(next)
                      if (next !== null && groupOffsets[next] === undefined) refreshGroupOffsets(next)
                    },
                  },
                    h('td', { className: 'kx-ellipsis', title: group.groupId }, group.groupId),
                    h('td', null, group.state),
                    h('td', { className: 'kx-num' }, String(group.members.length)),
                    h('td', null, group.protocol || t('common.null'))),
                })
                const detail = expandedGroup === null
                  ? null
                  : (() => {
                      const offsets = groupOffsets[expandedGroup]
                      return h('div', { className: 'kx-detail kx-detail-pane' },
                        h('div', { className: 'kx-detail-head' },
                          h('span', { className: 'kx-detail-title kx-ellipsis', title: expandedGroup }, expandedGroup),
                          h('span', { className: 'kx-spacer' }),
                          h(Btn, { onClick: () => refreshGroupOffsets(expandedGroup) }, t('refresh.manual')),
                          h('button', { type: 'button', className: 'kx-icon-btn', title: t('detail.close'), onClick: () => setExpandedGroup(null) }, '✕')),
                        offsets === undefined || offsets === null
                          ? h('div', { className: 'kx-empty' }, t('groups.offsets.loading'))
                          : !Array.isArray(offsets)
                            ? h('div', { className: 'kx-error' }, offsets.error)
                            : h('div', { className: 'kx-detail-body' },
                                h(VirtualTable, {
                                  t,
                                  label: t('groups.offsets.col.topic'),
                                  empty: t('common.null'),
                                  colSpan: 5,
                                  head: h('tr', null,
                                    h('th', null, t('groups.offsets.col.topic')),
                                    h('th', { className: 'kx-num' }, t('groups.offsets.col.partition')),
                                    h('th', { className: 'kx-num' }, t('groups.offsets.col.committed')),
                                    h('th', { className: 'kx-num' }, t('groups.offsets.col.end')),
                                    h('th', { className: 'kx-num' }, t('groups.offsets.col.lag'))),
                                  rows: offsets.flatMap(topic => topic.partitions.map(part => ({ topic, part }))),
                                  renderRow: ({ topic, part }) => h('tr', { key: `${topic.topic}:${String(part.partition)}` },
                                    h('td', { className: 'kx-ellipsis', title: topic.topic }, topic.topic),
                                    h('td', { className: 'kx-num' }, String(part.partition)),
                                    h('td', { className: 'kx-num' }, part.offset),
                                    h('td', { className: 'kx-num' }, part.high ?? t('common.null')),
                                    h('td', { className: 'kx-num' }, part.lag ?? t('common.null'))),
                                })))
                    })()
                if (detail === null) return table
                return h(Group, { className: 'kx-split', orientation: 'vertical' },
                  h(Panel, { id: 'groups-list', minSize: 120 }, table),
                  h(Separator, { className: 'kx-splitter', title: t('split.detailResize'), 'aria-label': t('split.detailResize') }),
                  h(Panel, { id: 'groups-detail', defaultSize: 220, minSize: 120, maxSize: '70%' }, detail))
              })())

      return h('div', { className: 'kx-root' },
        h(Styles),
        connBar,
        viewTabs,
        view === 'stream' ? streamView : view === 'topics' ? topicsView : groupsView,
        detail ? h(MessageDetail, { t, base: detail, connId: conn?.id, onClose: () => setDetail(null) }) : null)
    }

    function Styles() {
      return h('style', null, `
.kx-root { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; color: var(--dsw-alias-label-primary); }
.kx-root input, .kx-root select, .kx-root button { font: inherit; color: inherit; }
.kx-conn { display: flex; align-items: center; gap: 6px; padding: 8px 10px; flex-wrap: wrap; border-bottom: 1px solid var(--dsw-alias-border-l3); }
.kx-conn-brokers { flex: 1 1 160px; min-width: 120px; }
.kx-conn-user { width: 110px; }
.kx-conn-pass { width: 110px; }
.kx-conn-status { display: inline-flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); max-width: 220px; }
.kx-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-success-primary, #3ba55d); flex: none; }
.kx-viewtabs { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l3); flex-wrap: wrap; }
.kx-viewtab { position: relative; border: none; background: transparent; padding: 4px 10px; border-radius: 6px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.kx-viewtab:hover { background: var(--dsw-alias-interactive-bg-hover); }
.kx-viewtab[aria-selected="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.kx-viewtab[aria-selected="true"]::after { content: ""; position: absolute; inset: auto 8px 2px; border-bottom: 2px solid var(--dsw-alias-brand-primary); }
.kx-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.kx-toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; flex-wrap: wrap; }
.kx-toolbar-filters { border-bottom: 1px solid var(--dsw-alias-border-l3); padding-top: 0; }
.kx-spacer { flex: 1; }
.kx-input { background: var(--dsw-alias-bg-l1); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; padding: 3px 8px; outline: none; }
.kx-input:focus { border-color: var(--dsw-alias-border-selected); }
.kx-select { max-width: 200px; }
.kx-btn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-l1); border-radius: 6px; padding: 3px 10px; cursor: pointer; color: var(--dsw-alias-label-primary); }
.kx-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.kx-btn:disabled { opacity: 0.5; cursor: default; }
.kx-btn-primary { background: var(--dsw-alias-state-business-primary, #2f6fdd); border-color: transparent; color: var(--dsw-alias-label-on-color, #ffffff); }
.kx-btn-danger:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); }
.kx-icon-btn { border: none; background: transparent; cursor: pointer; padding: 2px 6px; border-radius: 4px; color: var(--dsw-alias-label-secondary); }
.kx-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.kx-check-inline { display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.kx-interval { width: 52px; }
.kx-offset, .kx-offset-input { width: 90px; }
.kx-filter { width: 120px; }
.kx-dim { color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.kx-last { margin-left: 4px; }
.kx-error { color: var(--dsw-alias-state-error-primary); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kx-error-bar { padding: 4px 10px; color: var(--dsw-alias-state-error-primary); border-bottom: 1px solid var(--dsw-alias-border-l3); }
.kx-warn-bar { padding: 4px 10px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-l2); border-bottom: 1px solid var(--dsw-alias-border-l3); }
/* Data tables: header cells carry a drag handle, rows are real table rows. */
.kx-table tr.kx-row { cursor: pointer; }
.kx-table tr.kx-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.kx-table tr.kx-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.kx-table th.kx-cell { padding: 0 10px; height: 26px; }
.kx-table td.kx-cell { padding: 0 10px; }
.kx-cell { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.kx-col-resizer { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 2; }
.kx-col-resizer:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }
.kx-col-time { width: 132px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
.kx-col-part { width: 42px; text-align: right; }
.kx-col-offset { width: 110px; text-align: right; font-variant-numeric: tabular-nums; }
.kx-col-key { color: var(--dsw-alias-label-secondary); }
.kx-col-size { width: 70px; text-align: right; color: var(--dsw-alias-label-tertiary); }
.kx-virt { flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
/* Topic/group list and its detail share one vertical pane group (react-resizable-panels). */
.kx-split { flex: 1; min-height: 0; }
.kx-split [data-panel] { display: flex; min-width: 0; min-height: 0; }
.kx-split [data-panel] > * { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; height: 100%; }
.kx-splitter { height: 6px; flex: none; cursor: row-resize; touch-action: none; background: transparent; border-radius: 3px; }
.kx-splitter:hover, .kx-splitter[data-separator="active"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }
.kx-detail.kx-detail-pane { flex: 1; min-height: 0; max-height: none; height: 100%; border-top: none; }
.kx-empty { display: flex; align-items: center; justify-content: center; gap: 6px; height: 100%; min-height: 80px; color: var(--dsw-alias-label-tertiary); }
.kx-empty-cell { text-align: center; color: var(--dsw-alias-label-tertiary); padding: 16px !important; }
.kx-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kx-table { width: 100%; border-collapse: collapse; }
.kx-table th { text-align: left; padding: 5px 10px; color: var(--dsw-alias-label-tertiary); font-weight: 600; border-bottom: 1px solid var(--dsw-alias-border-l3); position: sticky; top: 0; background: var(--dsw-alias-bg-base); }
.kx-table td { padding: 5px 10px; border-bottom: 1px solid var(--dsw-alias-border-l3); }
.kx-table .kx-num, .kx-table th.kx-num { text-align: right; font-variant-numeric: tabular-nums; }
.kx-table-sub { margin: 4px 0 8px 16px; width: calc(100% - 16px); }
.kx-table-sub th { position: static; }
.kx-row-click { cursor: pointer; }
.kx-row-click:hover { background: var(--dsw-alias-interactive-bg-hover); }
.kx-row-click:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.kx-row-selected { background: var(--dsw-alias-interactive-bg-active); }
.kx-detail { flex: none; max-height: 40%; display: flex; flex-direction: column; border-top: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-l1); }
.kx-detail-head { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l3); }
.kx-detail-title { font-weight: 600; }
.kx-detail-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.kx-picker { position: relative; }
.kx-picker-btn { min-width: 130px; justify-content: space-between; }
.kx-picker-pop { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; width: 260px; max-height: 300px; display: flex; flex-direction: column; gap: 4px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
.kx-picker-actions { display: flex; justify-content: space-between; gap: 8px; padding: 0 2px; }
.kx-link-btn { border: none; background: none; padding: 2px; cursor: pointer; font-size: 12px; color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-primary)); }
.kx-link-btn:hover:not(:disabled) { text-decoration: underline; }
.kx-link-btn:disabled { opacity: 0.5; cursor: default; }
.kx-picker-list { overflow: auto; display: flex; flex-direction: column; }
.kx-check-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 4px; cursor: pointer; }
.kx-check-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.kx-modal { width: min(720px, 92vw); max-height: 85vh; display: flex; flex-direction: column; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; box-shadow: 0 16px 48px rgba(0,0,0,0.35); padding: 0; }
.kx-modal:not([open]) { display: none; }
dialog.kx-modal:modal { overscroll-behavior: contain; }
.kx-modal::backdrop { background: var(--dsw-alias-bg-mask-1); overflow: hidden; overscroll-behavior: contain; }
.kx-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l3); }
.kx-modal-title { font-weight: 600; }
.kx-modal-body { overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
.kx-section-title { font-weight: 600; color: var(--dsw-alias-label-secondary); margin-bottom: 4px; }
.kx-meta { border-collapse: collapse; }
.kx-meta td { padding: 2px 12px 2px 0; vertical-align: top; }
.kx-meta-key { color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.kx-tabs { display: inline-flex; gap: 2px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; padding: 2px; margin-bottom: 6px; }
.kx-tab { position: relative; border: none; background: transparent; padding: 2px 10px; border-radius: 4px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.kx-tab[aria-selected="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.kx-tab[aria-selected="true"]::after { content: ""; position: absolute; inset: auto 6px 1px; border-bottom: 2px solid var(--dsw-alias-brand-primary); }
.kx-pre { margin: 0; padding: 8px; background: var(--dsw-alias-markdown-code-block); border-radius: 6px; overflow: auto; max-height: 320px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.kx-hint { color: var(--dsw-alias-label-tertiary); margin-bottom: 4px; }
.kx-null { color: var(--dsw-alias-label-dimmed); }
.kx-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--dsw-alias-label-tertiary); border-top-color: transparent; border-radius: 50%; animation: kx-spin 0.8s linear infinite; }
@keyframes kx-spin { to { transform: rotate(360deg); } }
`)
    }

    return {
      name: 'kafka-tool',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'kafka-tool: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 40,
          label: () => t('panel'),
        }, KafkaIcon)), 'kafka-tool: panel icon')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, function KafkaExplorerPanel() {
          return h(KafkaExplorerApp, { t })
        })), 'kafka-tool: main panel')
      },
    }
}
