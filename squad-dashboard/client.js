window.__ModuleLoader__.load({
  id: '@local/squad-dashboard',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const PANEL_ID = 'squad-dashboard'
    const NS = 'squadDashboard'
    const STYLE_ID = 'squad-dashboard-style'

    const en = {
      panel: 'ECC',
      title: 'ECC Dashboard',
      subtitle: 'Members and the work currently in progress',
      refresh: 'Refresh',
      loading: 'Loading…',
      'loading.remote': 'Loading remote Multica data…',
      'loading.refresh': 'Refreshing…',
      error: 'Could not load the board: {message}',
      retry: 'Retry',
      empty: 'No squad session is active. Start a squad leader session to see its members and tasks.',
      members: 'Members',
      tasks: 'Tasks',
      'lane.empty': 'None',
      'stat.squads': 'Squads',
      'stat.members': 'Members',
      'stat.running': 'Running',
      'stat.tasks': 'Tasks',
      'status.running': 'Running',
      'status.inactive': 'Idle',
      'status.corrupt': 'Corrupt',
      'status.unsupported': 'Unsupported',
      'status.unavailable': 'Unavailable',
      'task.pending': 'Pending',
      'task.in_progress': 'In progress',
      'task.completed': 'Done',
      'task.blocked': 'Blocked',
      'task.ready': 'Ready',
      'board.title': 'Task board',
      'board.remoteTitle': 'Multica task board',
      'workspace.untitled': 'Workspace',
      'kind.dev': 'Engineering squad',
      'kind.product': 'Product squad',
      'kind.test': 'Test squad',
      'member.noWork': 'No current task recorded',
      'leader': 'Squad leader',
      'view.config': 'Config',
      'config.title': 'Configuration',
      'config.hint': 'Local squad settings and the remote connection are managed separately.',
      'config.local': 'Local squads',
      'config.localHint': 'Set the default model, concurrency, and one model route per member here. The member roster itself is managed through the squad_config API.',
      'config.apiHint': 'The member roster is managed through the squad_config tool or GET/PUT /api/squad-dashboard/config; this page does not add or remove members.',
      'config.membersManaged': 'Members are managed through the squad_config API.',
      'config.defaults': 'Default model',
      'config.concurrency': 'Max concurrent members per model route',
      'config.followDefault': 'Use default',
      'config.save': 'Save configuration',
      'config.saving': 'Saving…',
      'config.saved': 'Saved to {path}',
      'config.error': 'Save failed: {message}',
      'config.loadModels': 'Loading model catalog…',
      'view.local': 'Local',
      'view.remote': 'Remote',
      'kind.remote': 'Remote squad',
      'remote.notConfigured': 'Remote Multica is not connected. Configure the server URL and token in Config.',
      'remote.error': 'Remote error: {message}',
      'config.remote': 'Remote Multica',
      'config.remote.url': 'Server URL',
      'config.remote.url.placeholder': 'https://multica.example.com',
      'config.remote.token': 'Token',
      'config.remote.workspace': 'Workspace (optional)',
      'config.remote.all': 'All workspaces',
      'config.remote.test': 'Test connection',
      'config.remote.testing': 'Testing…',
      'config.remote.ok': 'Connected: {count} workspace(s)',
      'config.remote.save': 'Save connection',
      'config.remote.reload': 'Reload workspaces',
      'config.remote.wsError': 'Could not load workspaces: {message}',
      'config.remote.saved': 'Saved to {path}',
      'config.remote.hint': 'Used only by the remote board; unrelated to local squad settings.',
      'config.labelWidth': 'Label width',
      'config.labelWidthHint': 'Drag to resize the label column, double-click to reset',
    }
    const zh = {
      panel: '产研ECC',
      title: '产研ECC仪表盘',
      subtitle: '各小队成员与当前事项',
      refresh: '刷新',
      loading: '加载中…',
      'loading.remote': '正在加载远端 Multica 数据…',
      'loading.refresh': '刷新中…',
      error: '仪表盘加载失败：{message}',
      retry: '重试',
      empty: '当前没有小队会话。开始一个小队 Leader 会话后，这里会显示成员与任务。',
      members: '成员',
      tasks: '任务',
      'lane.empty': '无',
      'stat.squads': '小队',
      'stat.members': '成员',
      'stat.running': '运行中',
      'stat.tasks': '任务',
      'status.running': '运行中',
      'status.inactive': '空闲',
      'status.corrupt': '数据损坏',
      'status.unsupported': '不支持',
      'status.unavailable': '不可用',
      'task.pending': '待办',
      'task.in_progress': '进行中',
      'task.completed': '已完成',
      'task.blocked': '阻塞',
      'task.ready': '可开始',
      'board.title': '任务看板',
      'board.remoteTitle': 'Multica 任务看板',
      'workspace.untitled': '工作区',
      'kind.dev': '研发小队',
      'kind.product': '产品小队',
      'kind.test': '测试小队',
      'member.noWork': '未记录当前事项',
      'leader': '小队 Leader',
      'view.config': '配置',
      'config.title': '配置',
      'config.hint': '本地小队配置与远端连接分区管理，互不影响。',
      'config.local': '本地小队配置',
      'config.localHint': '这里设置缺省模型、并发上限和每个成员的模型路由；成员名册本身由 squad_config API 维护。',
      'config.apiHint': '成员名册通过 squad_config 工具或 GET/PUT /api/squad-dashboard/config 维护；本页不增删成员。',
      'config.membersManaged': '成员由 squad_config API 维护。',
      'config.defaults': '缺省模型',
      'config.concurrency': '同一模型路由的成员并发上限',
      'config.followDefault': '使用缺省',
      'config.save': '保存配置',
      'config.saving': '保存中…',
      'config.saved': '已保存到 {path}',
      'config.error': '保存失败：{message}',
      'config.loadModels': '正在加载模型目录…',
      'view.local': '本地',
      'view.remote': '远端',
      'kind.remote': '远端小队',
      'remote.notConfigured': '远端 Multica 未连接。请在「配置」页填写服务地址与 Token。',
      'remote.error': '远端错误：{message}',
      'config.remote': '远端 Multica',
      'config.remote.url': '服务地址',
      'config.remote.url.placeholder': 'https://multica.example.com',
      'config.remote.token': 'Token',
      'config.remote.workspace': '工作区（可选）',
      'config.remote.all': '全部工作区',
      'config.remote.test': '测试连接',
      'config.remote.testing': '测试中…',
      'config.remote.ok': '连接成功：{count} 个工作区',
      'config.remote.save': '保存连接',
      'config.remote.reload': '刷新工作区',
      'config.remote.wsError': '获取工作区失败：{message}',
      'config.remote.saved': '已保存到 {path}',
      'config.remote.hint': '仅用于远端看板监控，与上面的本地小队配置无关。',
      'config.labelWidth': '标签宽度',
      'config.labelWidthHint': '拖动调整标签列宽度，双击恢复默认',
    }

    async function fetchSnapshot(source = 'local') {
      const res = await fetch(`/api/squad-dashboard/snapshot${source === 'remote' ? '?source=remote' : ''}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      return data
    }

    async function apiJson(path, init) {
      const res = await fetch(`/api/squad-dashboard${path}`, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      return data
    }

    /** Built-in squad kind labels; unknown kinds fall back to a readable id. */
    const KIND_KEY = { dev: 'kind.dev', product: 'kind.product', test: 'kind.test', remote: 'kind.remote' }

    function kindLabel(kind, t) {
      const key = KIND_KEY[kind]
      if (key) return t(key)
      const text = String(kind ?? '').replace(/[-_]+/g, ' ').trim()
      return text ? text.replace(/\b[a-z]/g, (char) => char.toUpperCase()) : String(kind ?? '')
    }

    function routeValue(route) {
      return route?.provider && route?.model ? `${route.provider}|${route.model}` : ''
    }

    function parseRoute(value) {
      if (!value) return null
      const idx = value.indexOf('|')
      if (idx <= 0) return null
      return { provider: value.slice(0, idx), model: value.slice(idx + 1) }
    }

    /** All selectable routes as provider/model flat options. */
    function routeOptions(catalog) {
      const rows = []
      for (const provider of catalog?.providers ?? []) {
        for (const model of provider.models ?? []) {
          rows.push({ value: `${provider.id}|${model.id}`, label: `${provider.id} / ${model.name || model.id}` })
        }
      }
      return rows
    }

    /** Multica web page for a remote squad or agent. */
    function remoteLink(squad, path) {
      if (!squad?.remoteUrl || !squad.workspaceSlug) return null
      return `${squad.remoteUrl}/${squad.workspaceSlug}/${path}`
    }

    function domId(prefix, value) {
      const safe = String(value ?? 'x').replace(/[^A-Za-z0-9_-]/g, '')
      return `${prefix}-${safe || 'x'}`
    }

    function statusMeta(member) {
      if (member.kind === 'diagnostic') return { key: `status.${member.reason}`, tone: 'fault' }
      if (member.activity === 'running') return { key: 'status.running', tone: 'running' }
      return { key: 'status.inactive', tone: 'idle' }
    }

    function taskMeta(task) {
      const blocked = Array.isArray(task.blockedBy) && task.blockedBy.length > 0 && task.status !== 'completed'
      if (blocked) return { key: 'task.blocked', tone: 'blocked' }
      return { key: `task.${task.status}`, tone: task.status }
    }

    function currentWork(member, tasks) {
      const owned = (tasks ?? []).find((task) => task && task.ownerName && task.ownerName === member.name && task.status !== 'completed' && task.subject)
      if (owned) return owned.subject
      return member.work || null
    }

    function sessionForTask(squad, task) {
      const owner = (squad.members ?? []).find((member) => member.name && member.name === task.ownerName && member.sessionId)
      return owner?.sessionId || squad.rootSessionId
    }

    function StatItem(props) {
      return h('li', { className: `sd-stat sd-stat-${props.tone}` },
        h('span', { className: 'sd-stat-num' }, String(props.value).padStart(2, '0')),
        h('span', { className: 'sd-stat-label' }, props.label),
      )
    }

    function shortModel(model) {
      if (!model) return null
      const idx = model.indexOf('/')
      return idx >= 0 ? model.slice(idx + 1) : model
    }

    function CrownIcon(props) {
      const size = props.size ?? 12
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size,
        fill: 'currentColor', 'aria-hidden': true,
      },
        h('path', { d: 'M3 8.5 6.6 11 12 5l5.4 6L21 8.5 19 19H5L3 8.5Z' }),
      )
    }

    function Crown(props) {
      return h('span', { className: 'sd-crown', title: props.t('leader'), 'aria-label': props.t('leader') },
        h(CrownIcon, { size: props.size ?? 12 }))
    }

    function MemberRow(props) {
      const { member, tasks, t, onOpen, href } = props
      const meta = statusMeta(member)
      const work = currentWork(member, tasks)
      const statusText = t(meta.key)
      const model = shortModel(member.model)
      return h('li', null,
        h('button', {
          type: 'button',
          className: `sd-member sd-member-${meta.tone}`,
          onClick: () => onOpen(member.sessionId, href),
          title: member.model || undefined,
        },
          h('span', { className: work ? 'sd-work' : 'sd-work sd-work-empty' }, work || t('member.noWork')),
          h('span', { className: 'sd-member-meta' },
            (member.role === 'leader' || member.isLeader === true) ? h(Crown, { t }) : null,
            h('span', { className: 'sd-member-name' }, member.name || member.path),
            model ? h('span', { className: 'sd-model' }, model) : null,
            h('span', { className: 'sd-status' },
              h('span', { className: 'sd-status-dot', 'aria-hidden': true }),
              statusText,
            ),
          ),
        ),
      )
    }

    function TaskCard(props) {
      const { task, t, onOpen, href } = props
      const meta = taskMeta(task)
      return h('button', {
        type: 'button',
        className: `sd-task sd-task-${meta.tone}`,
        onClick: () => onOpen(props.sessionId, href),
      },
        h('span', { className: 'sd-task-status' }, t(meta.key)),
        h('span', { className: 'sd-task-subject' }, task.subject),
        h('span', { className: 'sd-task-foot' },
          task.ownerName ? h('span', null, task.ownerName) : null,
          task.ready ? h('span', { className: 'sd-task-ready' }, t('task.ready')) : null,
        ),
      )
    }

    function TaskBoard(props) {
      const { squad, t, onOpen, squadHref } = props
      const [open, setOpen] = useState(false)
      const boardId = domId('sd-board', squad.rootSessionId)
      const known = new Set(['in_progress', 'pending', 'completed'])
      const lanes = [
        { key: 'in_progress', tasks: squad.tasks.filter((task) => task.status === 'in_progress') },
        { key: 'pending', tasks: squad.tasks.filter((task) => task.status === 'pending' || !known.has(task.status)) },
        { key: 'completed', tasks: squad.tasks.filter((task) => task.status === 'completed') },
      ]
      return h('div', { className: 'sd-board' },
        h('button', {
          type: 'button',
          className: 'sd-board-toggle',
          'aria-expanded': open,
          'aria-controls': boardId,
          onClick: () => setOpen(!open),
        },
          h('span', { className: 'sd-chevron', 'aria-hidden': true }),
          squad.kind === 'remote' ? t('board.remoteTitle') : t('board.title'),
          h('span', { className: 'sd-count' }, String(squad.tasks.length)),
        ),
        open
          ? h('div', { id: boardId, className: 'sd-lanes' },
              lanes.map((lane) => h('section', { key: lane.key, className: `sd-lane sd-lane-${lane.key}` },
                h('div', { className: 'sd-lane-head' },
                  h('span', { className: 'sd-lane-title' }, t(`task.${lane.key}`)),
                  h('span', { className: 'sd-lane-count' }, String(lane.tasks.length).padStart(2, '0')),
                ),
                lane.tasks.length > 0
                  ? lane.tasks.map((task) => h(TaskCard, {
                      key: task.id,
                      task,
                      t,
                      onOpen,
                      href: squadHref,
                      sessionId: sessionForTask(squad, task),
                    }))
                  : h('p', { className: 'sd-lane-empty' }, t('lane.empty')),
              )))
          : null,
      )
    }

    function SquadCard(props) {
      const { squad, t, onOpen } = props
      const squadHref = remoteLink(squad, `squads/${squad.remoteId}`)
      const headingId = domId('sd-squad', squad.rootSessionId)
      const running = squad.members.filter((member) => member.activity === 'running').length
      const leaderTitle = squad.title || squad.rootSessionId
      const kindClass = String(squad.kind ?? '').replace(/[^A-Za-z0-9_-]/g, '')
      const openMember = (sessionId) => onOpen(sessionId || squad.rootSessionId)
      return h('article', { className: `sd-card${running > 0 ? ' sd-card-live' : ''}`, 'aria-labelledby': headingId },
        h('header', { className: 'sd-card-head' },
          h('div', { className: 'sd-card-id' },
            squad.kind ? h('span', { className: `sd-kind sd-kind-${kindClass}` }, kindLabel(squad.kind, t)) : null,
            h('h4', { className: 'sd-card-heading', id: headingId },
              squad.kind !== 'remote' ? h(Crown, { t, size: 13 }) : null,
              h('button', {
                type: 'button',
                className: 'sd-card-name',
                onClick: () => onOpen(squad.rootSessionId, squadHref),
              }, leaderTitle),
            ),
          ),
          h('p', { className: 'sd-card-readout' },
            `${squad.members.length} ${t('members')}`,
            running > 0 ? ` · ${running} ${t('status.running')}` : '',
          ),
        ),
        squad.members.length > 0
          ? h('ul', { className: 'sd-members', role: 'list' },
              squad.members.map((member) => h(MemberRow, {
                key: member.path || member.sessionId || member.name,
                member,
                tasks: squad.tasks,
                t,
                href: remoteLink(squad, `agents/${member.sessionId}`),
                onOpen: openMember,
              })))
          : null,
        squad.tasks.length > 0 ? h(TaskBoard, { squad, t, onOpen: openMember, squadHref }) : null,
      )
    }

    /** Squad configuration view: manage the member roster and one model
     *  route per member, then save the shared config file Leaders can read. */
    /** Drag a handle to resize one CSS length; the value persists per panel. */
    function useDraggableWidth(initial, min, max, storageKey) {
      const read = () => {
        try {
          const saved = Number(globalThis.localStorage?.getItem(storageKey))
          if (Number.isFinite(saved) && saved >= min && saved <= max) return saved
        } catch { /* storage unavailable */ }
        return initial
      }
      const [width, setWidth] = useState(read)
      const dragRef = useRef(null)

      const onPointerDown = useCallback((event) => {
        event.preventDefault()
        const startX = event.clientX
        const startWidth = dragRef.current ?? width
        const onMove = (moveEvent) => {
          const next = Math.min(max, Math.max(min, startWidth + (moveEvent.clientX - startX)))
          dragRef.current = next
          setWidth(next)
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          const finalWidth = dragRef.current
          dragRef.current = null
          if (finalWidth !== null) {
            try { globalThis.localStorage?.setItem(storageKey, String(finalWidth)) } catch { /* ignore */ }
          }
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      }, [width, min, max, storageKey])

      const reset = useCallback(() => {
        setWidth(initial)
        try { globalThis.localStorage?.setItem(storageKey, String(initial)) } catch { /* ignore */ }
      }, [initial, storageKey])

      return [width, onPointerDown, reset]
    }

    /** Stable serialization for dirty checks. */
    function serializeLocal(draft) {
      if (!draft) return ''
      return JSON.stringify({
        defaults: draft.defaults ?? null,
        squads: draft.squads ?? {},
        members: draft.members ?? {},
        limits: draft.limits ?? {},
      })
    }
    function serializeRemote(draft) {
      if (!draft) return ''
      return JSON.stringify({
        url: draft.url ?? '',
        workspaceId: draft.workspaceId ?? '',
        pollMs: draft.pollMs ?? 30000,
        taskLimit: draft.taskLimit ?? 5,
        token: draft.token ?? '',
      })
    }

    function ConfigView(props) {
      const { t } = props
      const [labelWidth] = useDraggableWidth(112, 88, 240, 'squad-dashboard.config.labelWidth')
      const [catalog, setCatalog] = useState(null)
      const [draft, setDraft] = useState(null)
      const [bootError, setBootError] = useState(null)
      const [remoteDraft, setRemoteDraft] = useState(null)
      const [savedLocal, setSavedLocal] = useState(null)
      const [savedRemote, setSavedRemote] = useState(null)
      const [remoteStatus, setRemoteStatus] = useState('idle')
      const [remoteMessage, setRemoteMessage] = useState(null)
      const [workspaces, setWorkspaces] = useState([])
      const [workspacesError, setWorkspacesError] = useState(null)
      const [status, setStatus] = useState('loading')
      const [saveError, setSaveError] = useState(null)
      const [savedPath, setSavedPath] = useState(null)

      useEffect(() => {
        let alive = true
        Promise.all([apiJson('/models'), apiJson('/config'), apiJson('/remote/config')])
          .then(([models, current, remote]) => {
            if (!alive) return
            setCatalog(models)
            setRemoteDraft({
              url: remote?.config?.url ?? '',
              token: '',
              hasToken: Boolean(remote?.hasToken),
              workspaceId: remote?.config?.workspaceId ?? '',
              pollMs: remote?.config?.pollMs ?? 30000,
              taskLimit: remote?.config?.taskLimit ?? 5,
            })
            const conf = current?.config ?? {}
            const kinds = [...new Set([
              ...Object.keys(conf.members ?? {}),
              ...Object.keys(conf.squads ?? {}),
            ])]
            const squads = {}
            const members = {}
            for (const kind of kinds) {
              squads[kind] = { ...(conf.squads?.[kind] ?? {}) }
              const saved = Array.isArray(conf.members?.[kind]) ? conf.members[kind] : []
              members[kind] = [...new Set([...saved, ...Object.keys(squads[kind])])]
            }
            const next = {
              defaults: conf.defaults ?? null,
              squads,
              members,
              limits: conf.limits ?? {},
            }
            setDraft(next)
            setSavedLocal(serializeLocal(next))
            setSavedRemote(serializeRemote({
              url: remote?.config?.url ?? '',
              token: '',
              workspaceId: remote?.config?.workspaceId ?? '',
              pollMs: remote?.config?.pollMs ?? 30000,
              taskLimit: remote?.config?.taskLimit ?? 5,
            }))
            setStatus('ready')
            loadWorkspaces({
              url: remote?.config?.url ?? '',
              workspaceId: remote?.config?.workspaceId ?? '',
            })
          })
          .catch((err) => {
            if (!alive) return
            setBootError(err instanceof Error ? err.message : String(err))
            setStatus('error')
          })
        return () => { alive = false }
      }, [])

      const setMember = (kind, name, value) => {
        setDraft((prev) => {
          const squads = { ...prev.squads, [kind]: { ...prev.squads[kind] } }
          const route = parseRoute(value)
          if (route) squads[kind][name] = route
          else delete squads[kind][name]
          return { ...prev, squads }
        })
      }

      const setDefault = (value) => {
        setDraft((prev) => ({ ...prev, defaults: parseRoute(value) }))
      }

      const setConcurrency = (value) => {
        setDraft((prev) => {
          const limits = { ...prev.limits }
          const number = Number(value)
          if (Number.isFinite(number) && number >= 1) limits.maxConcurrentPerRoute = Math.floor(number)
          else delete limits.maxConcurrentPerRoute
          return { ...prev, limits }
        })
      }

      /** Pull the workspace list from the remote so the picker shows names. */
      const loadWorkspaces = async (input) => {
        try {
          const result = await apiJson('/remote/workspaces', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: input?.url ?? '', token: input?.token || undefined }),
          })
          setWorkspaces(result.workspaces ?? [])
          setWorkspacesError(null)
        } catch (err) {
          setWorkspaces([])
          setWorkspacesError(err instanceof Error ? err.message : String(err))
        }
      }

      const testRemote = async () => {
        setRemoteStatus('testing')
        setRemoteMessage(null)
        try {
          await apiJson('/remote/config', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              url: remoteDraft.url,
              token: remoteDraft.token || undefined,
              workspaceId: remoteDraft.workspaceId,
              pollMs: remoteDraft.pollMs,
              taskLimit: remoteDraft.taskLimit,
            }),
          })
          const result = await apiJson('/remote/test')
          setRemoteStatus('ok')
          setRemoteMessage(t('config.remote.ok', { count: (result.workspaces ?? []).length }))
        } catch (err) {
          setRemoteStatus('error')
          setRemoteMessage(err instanceof Error ? err.message : String(err))
        }
      }

      const saveRemote = async () => {
        setRemoteStatus('saving')
        setRemoteMessage(null)
        try {
          const result = await apiJson('/remote/config', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              url: remoteDraft.url,
              token: remoteDraft.token || undefined,
              workspaceId: remoteDraft.workspaceId,
              pollMs: remoteDraft.pollMs,
              taskLimit: remoteDraft.taskLimit,
            }),
          })
          setRemoteDraft((prev) => ({ ...prev, token: '', hasToken: Boolean(result.config?.token) }))
          setSavedRemote(serializeRemote({
            url: remoteDraft.url,
            token: '',
            workspaceId: remoteDraft.workspaceId,
            pollMs: remoteDraft.pollMs,
            taskLimit: remoteDraft.taskLimit,
          }))
          setRemoteStatus('saved')
          setRemoteMessage(t('config.remote.saved', { path: result.path ?? '' }))
          loadWorkspaces({ url: remoteDraft.url })
        } catch (err) {
          setRemoteStatus('error')
          setRemoteMessage(err instanceof Error ? err.message : String(err))
        }
      }

      const save = async () => {
        setStatus('saving')
        setSaveError(null)
        try {
          const result = await apiJson('/config', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(draft),
          })
          const saved = result.config ?? draft
          const next = {
            defaults: saved.defaults ?? null,
            squads: saved.squads ?? {},
            members: saved.members ?? {},
            limits: saved.limits ?? {},
          }
          setDraft(next)
          setSavedPath(result.path ?? null)
          setSavedLocal(serializeLocal(next))
          setStatus('saved')
        } catch (err) {
          setStatus('ready')
          setSaveError(err instanceof Error ? err.message : String(err))
        }
      }

      if (status === 'loading') return h('p', { className: 'sd-hint' }, t('config.loadModels'))
      if (status === 'error') {
        return h('div', { className: 'sd-error', role: 'alert' }, h('p', null, t('error', { message: bootError })))
      }

      const localDirty = serializeLocal(draft) !== (savedLocal ?? '')
      const remoteDirty = serializeRemote(remoteDraft) !== (savedRemote ?? '')
      const options = routeOptions(catalog)
      const select = (value, onChange, id) => h('select', {
        id,
        className: 'sd-select',
        value,
        onChange: (event) => onChange(event.target.value),
      },
        h('option', { value: '' }, t('config.followDefault')),
        options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
      )
      const kinds = Object.entries(draft.members ?? {})

      return h('div', { className: 'sd-config', style: { '--sd-label-w': `${labelWidth}px` } },
        h('header', { className: 'sd-hero' },
          h('div', { className: 'sd-hero-copy' },
            h('h2', { className: 'sd-title' }, t('config.title')),
            h('p', { className: 'sd-subtitle' }, t('config.hint')),
          ),
        ),
        h('section', { className: 'sd-config-block', 'aria-labelledby': 'sd-block-local' },
          h('div', { className: 'sd-block-head' },
            h('h3', { className: 'sd-block-title', id: 'sd-block-local' }, t('config.local')),
            h('p', { className: 'sd-block-hint' }, t('config.localHint')),
          ),
          h('div', { className: 'sd-config-body' },
            h('div', { className: 'sd-config-row sd-config-default' },
              h('label', { className: 'sd-config-label', htmlFor: 'sd-config-default' }, t('config.defaults')),
              select(routeValue(draft.defaults), setDefault, 'sd-config-default'),
            ),
            h('div', { className: 'sd-config-row' },
              h('label', { className: 'sd-config-label', htmlFor: 'sd-config-concurrency' }, t('config.concurrency')),
              h('input', {
                id: 'sd-config-concurrency',
                className: 'sd-input sd-input-number',
                type: 'number',
                min: 1,
                max: 16,
                value: draft.limits.maxConcurrentPerRoute ?? '',
                onChange: (event) => setConcurrency(event.target.value),
              }),
            ),
            kinds.map(([kind, roster]) =>
              h('section', { key: kind, className: 'sd-config-squad' },
                h('h3', { className: 'sd-group-title' }, kindLabel(kind, t)),
                roster.length > 0
                  ? h('ul', { className: 'sd-config-list', role: 'list' },
                      roster.map((name) => {
                        const id = domId('sd-cfg', `${kind}-${name}`)
                        return h('li', { key: name, className: 'sd-config-row sd-config-member' },
                          h('label', { className: 'sd-config-label', htmlFor: id, title: name }, name),
                          select(routeValue(draft.squads[kind]?.[name]), (value) => setMember(kind, name, value), id),
                        )
                      }))
                  : h('p', { className: 'sd-block-hint' }, t('config.membersManaged')),
              )),
            h('p', { className: 'sd-block-hint' }, t('config.apiHint')),
          ),
          h('div', { className: 'sd-config-actions' },
            h('button', { type: 'button', className: 'sd-btn sd-btn-primary', onClick: save, disabled: status === 'saving' || !localDirty },
              status === 'saving' ? t('config.saving') : t('config.save')),
            status === 'saved' && savedPath ? h('p', { className: 'sd-config-saved' }, t('config.saved', { path: savedPath })) : null,
            saveError ? h('p', { className: 'sd-config-error', role: 'alert' }, t('config.error', { message: saveError })) : null,
          ),
        ),
        remoteDraft
          ? h('section', { className: 'sd-config-block sd-config-block-remote', 'aria-labelledby': 'sd-block-remote' },
              h('div', { className: 'sd-block-head' },
                h('h3', { className: 'sd-block-title', id: 'sd-block-remote' }, t('config.remote')),
                h('p', { className: 'sd-block-hint' }, t('config.remote.hint')),
              ),
              h('div', { className: 'sd-config-row' },
                h('label', { className: 'sd-config-label', htmlFor: 'sd-remote-url' }, t('config.remote.url')),
                h('input', {
                  id: 'sd-remote-url',
                  className: 'sd-input',
                  type: 'text',
                  placeholder: t('config.remote.url.placeholder'),
                  value: remoteDraft.url,
                  onChange: (event) => setRemoteDraft({ ...remoteDraft, url: event.target.value }),
                }),
              ),
              h('div', { className: 'sd-config-row' },
                h('label', { className: 'sd-config-label', htmlFor: 'sd-remote-token' }, t('config.remote.token')),
                h('input', {
                  id: 'sd-remote-token',
                  className: 'sd-input',
                  type: 'password',
                  autoComplete: 'off',
                  placeholder: remoteDraft.hasToken ? '••••••••' : '',
                  value: remoteDraft.token,
                  onChange: (event) => setRemoteDraft({ ...remoteDraft, token: event.target.value }),
                }),
              ),
              h('div', { className: 'sd-config-row' },
                h('label', { className: 'sd-config-label', htmlFor: 'sd-remote-ws' }, t('config.remote.workspace')),
                h('select', {
                  id: 'sd-remote-ws',
                  className: 'sd-select',
                  value: remoteDraft.workspaceId,
                  onChange: (event) => setRemoteDraft({ ...remoteDraft, workspaceId: event.target.value }),
                },
                  h('option', { value: '' }, t('config.remote.all')),
                  workspaces.length === 0 && remoteDraft.workspaceId
                    ? h('option', { value: remoteDraft.workspaceId }, remoteDraft.workspaceId)
                    : null,
                  workspaces.map((workspace) => h('option', { key: workspace.id, value: workspace.id },
                    workspace.slug ? `${workspace.name}（${workspace.slug}）` : workspace.name)),
                ),
              ),
              workspacesError
                ? h('p', { className: 'sd-config-error', role: 'alert' }, t('config.remote.wsError', { message: workspacesError }))
                : null,
              h('div', { className: 'sd-config-actions' },
                h('button', { type: 'button', className: 'sd-btn', onClick: () => loadWorkspaces({ url: remoteDraft.url, token: remoteDraft.token }) },
                  t('config.remote.reload')),
                h('button', { type: 'button', className: 'sd-btn', onClick: testRemote, disabled: remoteStatus === 'testing' },
                  remoteStatus === 'testing' ? t('config.remote.testing') : t('config.remote.test')),
                h('button', { type: 'button', className: 'sd-btn sd-btn-primary', onClick: saveRemote, disabled: remoteStatus === 'saving' || !remoteDirty },
                  t('config.remote.save')),
                remoteMessage ? h('span', { className: remoteStatus === 'error' ? 'sd-config-error' : 'sd-config-saved' }, remoteMessage) : null,
              ),
            )
          : null,
      )
    }

    function SquadDashboardApp(props) {
      const { t, uiWorkspace } = props
      const [view, setView] = useState('board')
      const [source, setSource] = useState('local')
      const [snapshots, setSnapshots] = useState({})
      const [errors, setErrors] = useState({})
      const [loadingSources, setLoadingSources] = useState({ local: true })
      const timerRef = useRef(null)
      const requestRef = useRef(0)
      const snapshot = snapshots[source] ?? null
      const error = errors[source] ?? null
      const loading = Boolean(loadingSources[source])

      /** silent=true keeps the spinner hidden for background polling. */
      const load = useCallback(async (target = source, silent = false) => {
        const requestId = requestRef.current + 1
        requestRef.current = requestId
        if (!silent) setLoadingSources((prev) => ({ ...prev, [target]: true }))
        try {
          const data = await fetchSnapshot(target)
          if (requestId !== requestRef.current) return
          setSnapshots((prev) => ({ ...prev, [target]: data }))
          setErrors((prev) => ({ ...prev, [target]: null }))
        } catch (err) {
          if (requestId !== requestRef.current) return
          setErrors((prev) => ({ ...prev, [target]: err instanceof Error ? err.message : String(err) }))
        } finally {
          if (requestId === requestRef.current && !silent) {
            setLoadingSources((prev) => ({ ...prev, [target]: false }))
          }
        }
      }, [source])

      useEffect(() => {
        load(source)
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
      }, [load, source])

      useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current)
        const ms = snapshot && typeof snapshot.pollMs === 'number' && snapshot.pollMs >= 3000 ? snapshot.pollMs : 10000
        timerRef.current = setInterval(() => {
          if (typeof document === 'undefined' || document.visibilityState === 'visible') load(source, true)
        }, ms)
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
      }, [snapshot && snapshot.pollMs, load, source])

      const onOpen = useCallback((sessionId, href) => {
        if (source === 'remote') {
          if (href) window.open(href, '_blank', 'noopener')
          return
        }
        if (!sessionId || !uiWorkspace || typeof uiWorkspace.openSession !== 'function') return
        try { uiWorkspace.openSession(sessionId) } catch { /* navigation is best-effort */ }
      }, [uiWorkspace, source])

      const squads = snapshot?.squads ?? []
      const totalMembers = squads.reduce((sum, squad) => sum + squad.members.length, 0)
      const totalRunning = squads.reduce((sum, squad) => sum + squad.members.filter((member) => member.activity === 'running').length, 0)
      const totalTasks = squads.reduce((sum, squad) => sum + squad.tasks.length, 0)
      const groups = new Map()
      for (const squad of squads) {
        const key = squad.workspaceId || squad.workspaceTitle || 'workspace'
        if (!groups.has(key)) groups.set(key, { title: squad.workspaceTitle || t('workspace.untitled'), squads: [] })
        groups.get(key).squads.push(squad)
      }

      return h('div', { className: 'sd-root' },
        h('header', { className: 'sd-hero' },
          h('div', { className: 'sd-hero-copy' },
            h('h2', { className: 'sd-title' }, t('title')),
            h('p', { className: 'sd-subtitle' }, t('subtitle')),
          ),
          h('div', { className: 'sd-hero-actions' },
            h('div', { className: 'sd-tabs', role: 'tablist' },
              h('button', {
                type: 'button',
                role: 'tab',
                'aria-selected': view === 'board' && source === 'local',
                className: `sd-tab${view === 'board' && source === 'local' ? ' sd-tab-active' : ''}`,
                onClick: () => { setSource('local'); setView('board') },
              }, t('view.local')),
              h('button', {
                type: 'button',
                role: 'tab',
                'aria-selected': view === 'board' && source === 'remote',
                className: `sd-tab${view === 'board' && source === 'remote' ? ' sd-tab-active' : ''}`,
                onClick: () => { setSource('remote'); setView('board') },
              }, t('view.remote')),
              h('button', {
                type: 'button',
                role: 'tab',
                'aria-selected': view === 'config',
                className: `sd-tab${view === 'config' ? ' sd-tab-active' : ''}`,
                onClick: () => setView('config'),
              }, t('view.config')),
            ),
            view === 'board'
              ? h('button', { type: 'button', className: 'sd-btn sd-btn-primary', onClick: () => load(source), disabled: loading },
                  loading ? h('span', { className: 'sd-spinner', 'aria-hidden': true }) : null,
                  t('refresh'))
              : null,
          ),
        ),
        view === 'config'
          ? h(ConfigView, { t })
          : source === 'remote' && snapshot && snapshot.configured === false
          ? h('div', { className: 'sd-empty' }, t('remote.notConfigured'))
          : h(React.Fragment, null,
              h('ul', { className: 'sd-stats', role: 'list' },
                h(StatItem, { tone: 'squads', label: t('stat.squads'), value: squads.length }),
                h(StatItem, { tone: 'members', label: t('stat.members'), value: totalMembers }),
                h(StatItem, { tone: 'running', label: t('stat.running'), value: totalRunning }),
                h(StatItem, { tone: 'tasks', label: t('stat.tasks'), value: totalTasks }),
              ),
              loading && !snapshot
                ? h('div', { className: 'sd-loading', role: 'status', 'aria-live': 'polite' },
                    h('span', { className: 'sd-spinner sd-spinner-lg', 'aria-hidden': true }),
                    h('span', null, source === 'remote' ? t('loading.remote') : t('loading')),
                  )
                : null,
              loading && snapshot ? h('div', { className: 'sd-refreshing', role: 'status', 'aria-live': 'polite' },
                h('span', { className: 'sd-spinner', 'aria-hidden': true }),
                h('span', null, t('loading.refresh')),
              ) : null,
              error
                ? h('div', { className: 'sd-error', role: 'alert' },
                    h('p', null, t('error', { message: error })),
                    h('button', { type: 'button', className: 'sd-btn', onClick: load }, t('retry')))
                : null,
              !loading && !error && squads.length === 0 ? h('p', { className: 'sd-empty' }, t('empty')) : null,
              [...groups.entries()].map(([key, group]) =>
                h('section', { key, className: 'sd-group' },
                  h('h3', { className: 'sd-group-title', id: domId('sd-ws', key) }, group.title),
                  h('div', { className: 'sd-squads' },
                    group.squads.map((squad) => h(SquadCard, { key: squad.rootSessionId, squad, t, onOpen }))),
                )),
            ),
      )
    }

    function SquadIcon(props) {
      const size = props.size ?? 16
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      },
        h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
        h('path', { d: 'M17.5 14v7M14 17.5h7' }),
      )
    }

    let styleUsers = 0
    function acquireStyles() {
      styleUsers += 1
      let style = document.getElementById(STYLE_ID)
      if (!style) {
        style = document.createElement('style')
        style.id = STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = `
.sd-root {
  container-name: sd;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 16px 18px 24px;
  background: var(--dsw-alias-bg-base, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
}
.sd-root h2, .sd-root h3, .sd-root h4, .sd-root p { margin: 0; }
.sd-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, ButtonBorder); }
.sd-hero-copy { min-width: 0; }
.sd-title { font-size: 16px; font-weight: 600; letter-spacing: 0; color: var(--dsw-alias-label-primary, CanvasText); }
.sd-subtitle { margin-top: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-btn {
  min-block-size: 24px;
  border: 1px solid var(--dsw-alias-border-l2, ButtonBorder);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, ButtonFace);
  color: var(--dsw-alias-label-primary, ButtonText);
  padding: 4px 12px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition: background-color 150ms ease-out, border-color 150ms ease-out;
}
.sd-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border-color: var(--dsw-alias-border-l1, ButtonBorder);
  color: var(--dsw-alias-label-tertiary, GrayText);
  box-shadow: none;
}
.sd-btn-primary:disabled {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, CanvasText) 22%, var(--dsw-alias-bg-layer-2, Canvas));
  border-color: transparent;
  color: var(--dsw-alias-label-tertiary, GrayText);
}
.sd-btn:hover { background: var(--dsw-alias-bg-layer-2, ButtonFace); }
.sd-btn:active { background: var(--dsw-alias-bg-base, Canvas); }
.sd-btn-primary {
  background: var(--dsw-alias-state-business-primary, ButtonText);
  border-color: var(--dsw-alias-state-business-primary, ButtonText);
  color: var(--dsw-alias-label-on-color, Canvas);
}
.sd-btn-primary:hover { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, ButtonText) 82%, var(--dsw-alias-label-on-color, Canvas)); }
.sd-root :where(button):focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, CanvasText);
  outline-offset: 2px;
}
.sd-stats, .sd-members { list-style: none; margin: 0; padding: 0; }
.sd-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.sd-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, Canvas);
}
.sd-stat-num { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.sd-stat-label { font-size: 12px; }
.sd-stat-squads { background: var(--dsw-alias-state-business-tertiary, var(--dsw-alias-bg-layer-1)); }
.sd-stat-squads .sd-stat-num { color: var(--dsw-alias-state-business-primary, CanvasText); }
.sd-stat-squads .sd-stat-label { color: var(--dsw-alias-state-business-primary, CanvasText); }
.sd-stat-members { background: color-mix(in srgb, var(--dsw-alias-chart-tools, CanvasText) 18%, var(--dsw-alias-bg-layer-1, Canvas)); }
.sd-stat-members .sd-stat-num,
.sd-stat-members .sd-stat-label { color: var(--dsw-alias-chart-tools, CanvasText); }
.sd-stat-running { background: var(--dsw-alias-state-success-tertiary, var(--dsw-alias-bg-layer-1)); }
.sd-stat-running .sd-stat-num,
.sd-stat-running .sd-stat-label { color: var(--dsw-alias-state-success-primary, CanvasText); }
.sd-stat-tasks { background: var(--dsw-alias-state-warn-tertiary, var(--dsw-alias-bg-layer-1)); }
.sd-stat-tasks .sd-stat-num,
.sd-stat-tasks .sd-stat-label { color: var(--dsw-alias-state-warn-primary, CanvasText); }
.sd-group { display: flex; flex-direction: column; gap: 10px; }
.sd-group-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-squads { display: flex; flex-direction: column; gap: 10px; }
.sd-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l1, ButtonBorder);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, Canvas);
}
.sd-card-live { box-shadow: inset 3px 0 0 var(--dsw-alias-state-success-primary, CanvasText); }
.sd-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sd-card-id { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.sd-card-heading { min-width: 0; font: inherit; font-weight: 600; }
.sd-card-name {
  max-width: 100%;
  min-block-size: 24px;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--dsw-alias-label-primary, CanvasText);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.sd-card-name:hover { color: var(--dsw-alias-brand-primary, LinkText); }
.sd-card-readout { flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-kind {
  flex: none;
  border: 1px solid var(--dsw-alias-border-l1, ButtonBorder);
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, CanvasText);
  background: var(--dsw-alias-bg-layer-2, Canvas);
}
.sd-kind-dev {
  color: var(--dsw-alias-state-business-primary, CanvasText);
  background: var(--dsw-alias-state-business-tertiary, var(--dsw-alias-bg-layer-2));
}
.sd-kind-product {
  color: var(--dsw-alias-state-done-primary, CanvasText);
  background: color-mix(in srgb, var(--dsw-alias-state-done-primary, CanvasText) 16%, var(--dsw-alias-bg-layer-1, Canvas));
}
.sd-members { display: grid; grid-template-columns: 1fr; gap: 8px; }
.sd-member {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  min-block-size: 24px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1, ButtonBorder);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: background-color 150ms ease-out, border-color 150ms ease-out;
}
.sd-member:hover { background: var(--dsw-alias-bg-layer-2, Canvas); }
.sd-member:active { border-color: var(--dsw-alias-brand-primary, ButtonBorder); }
.sd-work {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.sd-work-empty { font-weight: 400; color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-member-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.sd-member-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-crown { display: inline-flex; align-items: center; flex: none; color: var(--dsw-alias-state-warning-primary, #e3b341); }

.sd-model {
  display: inline-flex;
  align-items: center;
  flex: none;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, GrayText);
  background: color-mix(in srgb, var(--dsw-alias-label-tertiary, GrayText) 12%, transparent);
}
.sd-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, CanvasText);
  background: var(--dsw-alias-bg-layer-2, Canvas);
}
.sd-status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary, GrayText); }
.sd-member-running .sd-status { color: var(--dsw-alias-state-success-primary, CanvasText); background: var(--dsw-alias-state-success-tertiary, var(--dsw-alias-bg-layer-2)); }
.sd-member-running .sd-status-dot { background: var(--dsw-alias-state-success-primary, CanvasText); }
.sd-member-fault .sd-status { color: var(--dsw-alias-state-error-primary, CanvasText); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, CanvasText) 16%, var(--dsw-alias-bg-layer-1, Canvas)); }
.sd-member-fault .sd-status-dot { background: var(--dsw-alias-state-error-primary, CanvasText); }
.sd-board { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; border-top: 1px solid var(--dsw-alias-border-l1, ButtonBorder); }
.sd-board-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-block-size: 24px;
  width: fit-content;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--dsw-alias-label-secondary, CanvasText);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.sd-chevron {
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
}
.sd-board-toggle[aria-expanded="true"] .sd-chevron { transform: rotate(45deg); }
.sd-count { font-variant-numeric: tabular-nums; }
.sd-lanes { display: grid; grid-template-columns: 1fr; gap: 8px; overflow-x: auto; }
.sd-lane {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l1, ButtonBorder);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, Canvas);
}
.sd-lane-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sd-lane-title, .sd-lane-count, .sd-lane-empty { font-size: 12px; color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-task {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  min-block-size: 24px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l2, ButtonBorder);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.sd-task:hover { background: var(--dsw-alias-bg-layer-2, Canvas); }
.sd-task-status { font-size: 11px; font-weight: 600; }
.sd-task-in_progress .sd-task-status { color: var(--dsw-alias-state-business-primary, CanvasText); }
.sd-task-pending .sd-task-status { color: var(--dsw-alias-state-warn-primary, CanvasText); }
.sd-task-completed .sd-task-status { color: var(--dsw-alias-state-success-primary, CanvasText); }
.sd-task-blocked { border-color: var(--dsw-alias-state-error-primary, ButtonBorder); }
.sd-task-blocked .sd-task-status { color: var(--dsw-alias-state-error-primary, CanvasText); }
.sd-task-subject { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-task-foot { display: flex; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-task-ready { color: var(--dsw-alias-state-success-primary, CanvasText); }
.sd-hint, .sd-empty { color: var(--dsw-alias-label-secondary, CanvasText); }
.sd-empty { padding: 28px 16px; border: 1px dashed var(--dsw-alias-border-l2, ButtonBorder); border-radius: 10px; text-align: center; }
.sd-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-state-error-primary, ButtonBorder);
  border-radius: 8px;
  color: var(--dsw-alias-state-error-primary, CanvasText);
}
@media (pointer: coarse) {
  .sd-btn, .sd-member, .sd-task, .sd-board-toggle { min-block-size: 32px; }
}
@media (min-width: 880px) {
  .sd-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .sd-members { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sd-lanes { grid-template-columns: repeat(3, minmax(180px, 1fr)); }
}
@supports (container-type: inline-size) {
  @media (min-width: 880px) {
    .sd-stats, .sd-lanes { grid-template-columns: 1fr; }
    .sd-members { grid-template-columns: 1fr; }
  }
  @container sd (min-width: 640px) {
    .sd-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .sd-members { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @container sd (min-width: 880px) {
    .sd-lanes { grid-template-columns: repeat(3, minmax(180px, 1fr)); }
  }
}
@media (forced-colors: active) {
  .sd-root :where(button):focus-visible { outline: 2px solid CanvasText; }
  .sd-card-live { box-shadow: inset 3px 0 0 CanvasText; }
}
/* header actions + tabs */
.sd-hero-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sd-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2, Canvas); border: 1px solid var(--dsw-alias-border-l1, ButtonBorder); }
.sd-tab {
  border: none; background: transparent; cursor: pointer;
  padding: 3px 10px; border-radius: 4px;
  font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-secondary, CanvasText);
}
.sd-tab:hover { background: var(--dsw-alias-bg-base, Canvas); }
.sd-tab-active { background: var(--dsw-alias-bg-base, Canvas); color: var(--dsw-alias-label-primary, CanvasText); font-weight: 600; }
/* squad configuration */
.sd-config { --sd-label-w: 112px; display: flex; flex-direction: column; gap: 14px; }
.sd-config-block {
  display: flex; flex-direction: column; gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1, ButtonBorder);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, Canvas) 55%, transparent);
}
.sd-config-block-remote { border-style: dashed; }
.sd-block-head { display: flex; flex-direction: column; gap: 2px; padding-bottom: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1, ButtonBorder); }
.sd-block-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary, CanvasText); }
.sd-block-hint { margin: 0; font-size: 11px; color: var(--dsw-alias-label-tertiary, GrayText); }
.sd-config-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sd-config-squad { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; border-top: 1px solid var(--dsw-alias-border-l1, ButtonBorder); }
.sd-config-list {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 32px;
}
@container sd (max-width: 720px) {
  .sd-config-list { grid-template-columns: 1fr; }
}
.sd-config-row.sd-config-member {
  display: grid;
  grid-template-columns: minmax(72px, clamp(72px, var(--sd-label-w, 112px), 150px)) minmax(160px, 1fr);
  gap: 8px;
}
.sd-config-member .sd-config-label {
  flex: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-config-member .sd-select { width: 100%; min-width: 0; }
.sd-config-squad .sd-group-title { display: flex; align-items: center; gap: 8px; }
.sd-config-default { padding-bottom: 10px; border-bottom: 1px dashed var(--dsw-alias-border-l1, ButtonBorder); }
.sd-config-label {
  flex: 0 0 var(--sd-label-w); min-width: 0;
  font-size: 12px; line-height: 20px;
  color: var(--dsw-alias-label-secondary, CanvasText);
  white-space: normal; overflow-wrap: anywhere;
}
.sd-config-body > .sd-config-row .sd-select { max-width: 420px; }
.sd-config-body { display: flex; flex-direction: column; gap: 12px; }
.sd-select, .sd-input {
  flex: 1 1 auto; min-width: 0;
  font-size: 12px; line-height: 20px;
  padding: 2px 6px; border-radius: 4px;
  color: var(--dsw-alias-label-primary, CanvasText);
  background: var(--dsw-alias-bg-base, Canvas);
  border: 1px solid var(--dsw-alias-border-l1, ButtonBorder);
}
.sd-input-number { max-width: 96px; flex: none; }
.sd-config-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, ButtonBorder); }
.sd-spinner {
  display: inline-block; inline-size: 12px; block-size: 12px;
  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-tertiary, GrayText) 45%, transparent);
  border-top-color: var(--dsw-alias-brand-primary, CanvasText);
  border-radius: 50%;
  animation: sd-spin 0.7s linear infinite;
}
.sd-spinner-lg { inline-size: 18px; block-size: 18px; border-width: 2.5px; }
@keyframes sd-spin { to { transform: rotate(360deg); } }
.sd-loading { display: flex; align-items: center; gap: 10px; padding: 28px 12px; color: var(--dsw-alias-label-secondary, CanvasText); font-size: 12px; }
.sd-refreshing { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-tertiary, GrayText); font-size: 11px; }
.sd-config-saved { margin: 0; font-size: 11px; color: var(--dsw-alias-state-success-primary, GrayText); overflow-wrap: anywhere; }
.sd-config-error { margin: 0; font-size: 11px; color: var(--dsw-alias-state-error-primary, GrayText); }
`
      return () => {
        styleUsers -= 1
        if (styleUsers <= 0) document.getElementById(STYLE_ID)?.remove()
      }
    }

    return {
      name: 'squad-dashboard',
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'squad-dashboard: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => acquireStyles(), 'squad-dashboard: styles')
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 41,
          label: () => t('panel'),
        }, SquadIcon)), 'squad-dashboard: panel icon')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, function SquadDashboardPanel() {
          return h(SquadDashboardApp, { t, uiWorkspace: ctx.uiWorkspace })
        })), 'squad-dashboard: main panel')
      },
    }
  },
})
