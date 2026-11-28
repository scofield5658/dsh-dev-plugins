import Schema from '@deepseek-ai/schemastery'
import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const name = 'squad-dashboard'

/** Root for user-owned data. DSH sets DSH_HOME on every platform; the
 *  fallback matches the default the host uses when the variable is absent.
 *  A relative DSH_HOME resolves under the home directory, never process.cwd(). */
export function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim()) {
    const value = configured.trim()
    return path.isAbsolute(value) ? path.resolve(value) : path.resolve(homedir(), value)
  }
  return path.join(homedir(), '.dsh')
}

const PLUGIN_ID = 'squad-dashboard'

/** Per-plugin data directory: $DSH_HOME/plugins/<loader-id>. */
export function pluginDataDir() {
  return path.join(dshHome(), 'plugins', PLUGIN_ID)
}

export const Config = Schema.object({
  pollMs: Schema.number().default(10000).description('Suggested client-side refresh interval in milliseconds.'),
  squadPresetPrefix: Schema.string().default('squad-').description('Agent preset id prefix that marks a session as a squad root.'),
  squadKinds: Schema.dict(Schema.array(Schema.string())).default({}).description('Optional squad kind aliases: { "<kind>": ["<preset id>", ...] }. Empty means the kind is derived from the preset id.'),
  squadConfigPath: Schema.string().default('').description('Squad configuration file; empty means $DSH_HOME/plugins/squad-dashboard/squad-member-models.json. Relative paths resolve under $DSH_HOME.'),
  remoteConfigPath: Schema.string().default('').description('Remote Multica configuration file; empty means $DSH_HOME/plugins/squad-dashboard/squad-remote.json. Relative paths resolve under $DSH_HOME.'),
})

const ROUTE_PREFIX = '/api/squad-dashboard'

/** Resolve a preset id to a squad kind. Explicit aliases win; otherwise the
 *  kind is the preset id with the configured prefix and a "-leader" suffix
 *  removed, so "squad-dev-leader" -> "dev" without a hardcoded table. */
export function squadKind(presetId, config = {}) {
  if (typeof presetId !== 'string' || !presetId) return null
  const aliases = config && typeof config.squadKinds === 'object' && config.squadKinds ? config.squadKinds : {}
  for (const [kind, ids] of Object.entries(aliases)) {
    if (Array.isArray(ids) && ids.includes(presetId)) return kind
  }
  const prefix = typeof config.squadPresetPrefix === 'string' ? config.squadPresetPrefix : 'squad-'
  if (!prefix || !presetId.startsWith(prefix)) return null
  const rest = presetId.slice(prefix.length).replace(/-leader$/, '')
  return rest || null
}

/** Preset ids that an explicit squad kind aliases, so a custom naming scheme
 *  is detected even when it does not use the configured prefix. */
function aliasPresetIds(config = {}) {
  const aliases = config && typeof config.squadKinds === 'object' && config.squadKinds ? config.squadKinds : {}
  const ids = []
  for (const list of Object.values(aliases)) {
    if (!Array.isArray(list)) continue
    for (const id of list) {
      if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

export function isSquad({ teamEnabled, presetId, memberCount, prefix, presetIds = [] }) {
  return teamEnabled === true
    || (Array.isArray(presetIds) && presetIds.includes(presetId))
    || (Boolean(prefix) && typeof presetId === 'string' && presetId.startsWith(prefix))
    || memberCount > 0
}

export function mapMember(entry) {
  if (entry.kind === 'diagnostic') {
    return {
      name: entry.id,
      sessionId: entry.id,
      activity: 'inactive',
      kind: 'diagnostic',
      reason: entry.reason,
      work: null,
    }
  }
  return {
    name: entry.name || entry.path,
    path: entry.path || null,
    sessionId: entry.id,
    activity: entry.activity,
    kind: 'child',
    reason: null,
    work: entry.label || null,
  }
}

function optional(ctx, name) {
  try { return ctx.get(name) } catch { return null }
}

/** Read one session's current model through the durable modelSelection
 *  projection; returns "provider/model" or null when unavailable. */
async function readModel(ctx, sessionId) {
  const projections = optional(ctx, 'sessionProjections')
  if (!projections || typeof projections.snapshot !== 'function') return null
  const agents = optional(ctx, 'agents')
  const agent = agents && await read(() => agents.get(sessionId))
  if (!agent) return null
  const snap = await read(() => projections.snapshot(agent.session ?? agent))
  const sel = snap?.values?.modelSelection
  const cur = sel?.next ?? sel?.lastUsed
  return cur?.provider && cur?.model ? `${cur.provider}/${cur.model}` : null
}

async function read(fn) {
  try { return await fn() } catch { return null }
}

async function buildSquadView(ctx, config, workspace, sessionId, savedConfig, presetIds) {
  const agents = optional(ctx, 'agents')
  const agent = agents && await read(() => agents.get(sessionId))
  if (!agent) return null

  const presets = optional(ctx, 'agentPresets')
  const titles = optional(ctx, 'sessionTitle')
  const teams = optional(ctx, 'agentTeams')
  const subagents = optional(ctx, 'subagents')
  const session = agent.session

  const [presetId, titleSnapshot, teamEnabled, descendants] = await Promise.all([
    presets ? read(() => presets.presetForSession(session)) : null,
    titles ? read(() => titles.get(session)) : null,
    teams ? read(() => teams.isEnabled(agent)) : false,
    subagents ? read(() => subagents.listDescendants(sessionId)) : null,
  ])

  const members = (descendants ?? []).map(mapMember)
  // A member that has descendants of its own is a nested squad leader; the
  // name fallback covers leaders whose children have not been spawned yet.
  const paths = members.map((member) => member.path).filter(Boolean)
  for (const member of members) {
    const own = member.path
    const leadsChildren = Boolean(own) && paths.some((p) => p !== own && p.startsWith(`${own}/`))
    const segment = own ? own.split('/').pop() : member.name
    member.isLeader = leadsChildren || /leader/i.test(segment || '')
  }
  if (!isSquad({
    teamEnabled,
    presetId,
    memberCount: members.length,
    prefix: config.squadPresetPrefix,
    presetIds,
  })) return null

  const tasks = teamEnabled && teams ? ((await read(() => teams.listTasks(agent))) ?? []) : []
  // Member models via the durable modelSelection projection; null stays null
  // and the UI hides the chip, so a missing projection never breaks the card.
  const uniqueIds = [...new Set(members.map((member) => member.sessionId).filter(Boolean))]
  const models = await Promise.all(uniqueIds.map((id) => readModel(ctx, id)))
  const modelById = new Map(uniqueIds.map((id, i) => [id, models[i]]))
  const kind = squadKind(presetId, config)
  // Configured member routes are the fallback when the live projection is not
  // readable, so the panel still shows what the Leader will dispatch.
  const memberConfig = kind ? savedConfig.squads[kind] ?? {} : {}
  const routeOf = (route) => (route?.provider && route?.model ? `${route.provider}/${route.model}` : null)
  for (const member of members) {
    member.model = modelById.get(member.sessionId) ?? routeOf(memberConfig[member.name]) ?? null
  }
  return {
    rootSessionId: sessionId,
    workspaceId: workspace.id,
    workspaceTitle: workspace.title || workspace.path || workspace.id,
    presetId,
    kind,
    title: titleSnapshot?.title || null,
    model: (await readModel(ctx, sessionId)) ?? routeOf(savedConfig.defaults),
    members,
    tasks,
  }
}

async function buildSnapshot(ctx, config) {
  const registry = optional(ctx, 'workspaceRegistry')
  const workspaces = registry ? await read(() => registry.list()) : null
  // Read the shared squad config and preset aliases once per snapshot instead
  // of per squad session.
  const savedConfig = (await loadConfig(config)).config
  const presetIds = aliasPresetIds(config)
  const squads = []
  for (const workspace of workspaces ?? []) {
    for (const sessionId of workspace.sessionIds ?? []) {
      const view = await buildSquadView(ctx, config, workspace, sessionId, savedConfig, presetIds)
      if (view) squads.push(view)
    }
  }
  return { pollMs: config.pollMs, squads }
}

/** Optional remote Multica view: configuration file, REST client and mapping. */
function remoteConfigPath(config) {
  if (config.remoteConfigPath) return path.resolve(dshHome(), config.remoteConfigPath)
  return path.join(pluginDataDir(), 'squad-remote.json')
}

async function loadRemoteConfig(config) {
  const file = remoteConfigPath(config)
  const raw = await read(() => fsp.readFile(file, 'utf8'))
  if (!raw) return { path: file, config: { url: '', token: '', workspaceId: '', pollMs: 30000, taskLimit: 5 } }
  try {
    const parsed = JSON.parse(raw)
    return {
      path: file,
      config: {
        url: typeof parsed.url === 'string' ? parsed.url.replace(/\/+$/, '') : '',
        token: typeof parsed.token === 'string' ? parsed.token : '',
        workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : '',
        pollMs: Number.isFinite(parsed.pollMs) && parsed.pollMs >= 10000 ? Math.floor(parsed.pollMs) : 30000,
        taskLimit: Number.isFinite(parsed.taskLimit) ? Math.min(20, Math.max(1, Math.floor(parsed.taskLimit))) : 5,
      },
    }
  } catch {
    return { path: file, config: { url: '', token: '', workspaceId: '', pollMs: 30000, taskLimit: 5 }, error: 'remote config is not valid JSON' }
  }
}

async function saveRemoteConfig(config, input) {
  const file = remoteConfigPath(config)
  const existing = (await loadRemoteConfig(config)).config
  const next = {
    url: typeof input?.url === 'string' ? input.url.trim().replace(/\/+$/, '') : '',
    // Omitting token keeps the stored one, so the UI never needs to echo it back.
    token: typeof input?.token === 'string' && input.token.trim() ? input.token.trim() : existing.token,
    workspaceId: typeof input?.workspaceId === 'string' ? input.workspaceId.trim() : '',
    pollMs: Number.isFinite(Number(input?.pollMs)) ? Math.max(10000, Math.floor(Number(input.pollMs))) : 30000,
    taskLimit: Number.isFinite(Number(input?.taskLimit)) ? Math.min(20, Math.max(1, Math.floor(Number(input.taskLimit)))) : 5,
  }
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fsp.rename(tmp, file)
  return next
}

/** Read-only Multica REST call with the configured bearer token. */
async function multicaGet(cfg, apiPath) {
  if (!cfg.url || !cfg.token) throw new Error('remote Multica URL and token are not configured')
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(15000) : undefined
  const res = await fetch(`${cfg.url}${apiPath}`, {
    headers: { authorization: `Bearer ${cfg.token}`, accept: 'application/json' },
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message = data && typeof data.error === 'string' ? data.error : `HTTP ${res.status}`
    throw new Error(message)
  }
  return data
}

function multicaWorkspaceQuery(workspaceId) {
  return workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
}

/** /api/agents/{id}/tasks with a correct query string in both scoped and
 *  all-workspace modes. */
function multicaTasksPath(agentId, workspaceId, limit) {
  const params = new URLSearchParams()
  if (workspaceId) params.set('workspace_id', workspaceId)
  params.set('limit', String(limit))
  return `/api/agents/${agentId}/tasks?${params.toString()}`
}

/** Multica run status -> the status vocabulary the panel already renders. */
function mapRunStatus(status) {
  if (status === 'running' || status === 'dispatched' || status === 'claimed') return 'in_progress'
  if (status === 'completed' || status === 'succeeded') return 'completed'
  return 'pending'
}

/** Multica folds every project workflow state into four canonical categories;
 *  a state is terminal only when its category is done or closed. */
const ISSUE_CATEGORY = {
  backlog: 'unstarted', todo: 'unstarted',
  in_progress: 'started', in_review: 'started', blocked: 'started',
  done: 'done', completed: 'done', resolved: 'done',
  cancelled: 'closed', canceled: 'closed', closed: 'closed',
  duplicate: 'closed', archived: 'closed',
}
const TERMINAL_CATEGORIES = new Set(['done', 'closed'])

function normalizeIssueCategory(value) {
  if (typeof value !== 'string' || !value) return null
  const key = value.toLowerCase()
  if (key === 'unstarted' || key === 'started' || key === 'done' || key === 'closed') return key
  return ISSUE_CATEGORY[key] ?? null
}

function issueCategory(issue) {
  return normalizeIssueCategory(issue?.status_category) ?? normalizeIssueCategory(issue?.status)
}

function isTerminalIssue(issue) {
  return TERMINAL_CATEGORIES.has(issueCategory(issue))
}

/** A run outside any issue is terminal once it completed; an issue run follows
 *  the project workflow state instead of the run's own status. When the issue
 *  lookup itself failed, keep the row rather than guessing a terminal state. */
function remoteTaskIsTerminal(run, issue) {
  if (issue) return isTerminalIssue(issue)
  if (run?.issue_id) return false
  return mapRunStatus(run?.status) === 'completed'
}

function runSubject(run, issueTitleById) {
  if (run.trigger_summary) return String(run.trigger_summary).slice(0, 160)
  const issueTitle = run.issue_id ? issueTitleById.get(run.issue_id) : null
  if (issueTitle) return issueTitle
  if (run.result && typeof run.result.output === 'string') return run.result.output.slice(0, 160)
  return run.kind ? `run:${run.kind}` : 'run'
}

/** Milliseconds for sorting mixed ISO timestamps; invalid values sort last. */
function timestampOf(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/** One list row per Multica issue, carrying the issue's own workflow status
 *  instead of the fixed lane vocabulary. Runs without an issue keep their own
 *  id so chat-only executions are still listed. */
function remoteTaskFromRun(run, agent, issue, memberNames, agentById) {
  const fallbackStatus = mapRunStatus(run.status)
  const created = issue?.created_at || run.created_at || run.dispatched_at || null
  // A run's attribution names the human who started the work even when an
  // agent created the issue; fall back to the issue creator.
  let initiator = run.attribution?.originator?.name || run.attribution?.initiator?.name || null
  if (!initiator && issue?.creator_id) {
    initiator = issue.creator_type === 'agent'
      ? agentById.get(issue.creator_id)?.name ?? null
      : memberNames.get(issue.creator_id) ?? null
  }
  return {
    id: issue?.id || run.id,
    identifier: issue?.identifier || (typeof run.id === 'string' ? run.id.slice(0, 8) : null),
    subject: issue?.title || runSubject(run, new Map()),
    status: issue?.status_category || issue?.status || fallbackStatus,
    statusName: typeof issue?.status_name === 'string' && issue.status_name.trim() ? issue.status_name.trim() : null,
    createdAt: created,
    initiator,
    agentId: agent.id,
    ownerName: agent.name,
    ready: false,
    blockedBy: [],
  }
}

/** Keep the newest run per issue and list the result newest first. */
function dedupeRemoteTasks(tasks) {
  const byKey = new Map()
  for (const task of tasks) {
    if (!task) continue
    const key = task.id || `${task.identifier ?? ''}:${task.subject ?? ''}`
    const previous = byKey.get(key)
    if (!previous || timestampOf(task.createdAt) > timestampOf(previous.createdAt)) byKey.set(key, task)
  }
  return [...byKey.values()].sort((left, right) => timestampOf(right.createdAt) - timestampOf(left.createdAt))
}

/** A squad member leads the squad when Multica tags the role "leader" or when
 *  the squad's leader_id points at it. Some workspaces leave every member role
 *  empty and only fill leader_id, so both marks count; the agent id is accepted
 *  because agent-typed members carry it as member_id on some releases. */
export function remoteMemberIsLeader(member, squad, agentId) {
  if (!member) return false
  if (member.role === 'leader') return true
  const leaderId = squad?.leader_id ?? squad?.leaderId ?? null
  if (!leaderId) return false
  return member.member_id === leaderId || member.memberId === leaderId || agentId === leaderId
}

/** Workspace member names keyed by user id, used to name an issue creator. */
async function loadRemoteMemberNames(remote, workspaceId) {
  const rows = (await read(() => multicaGet(remote, `/api/workspaces/${encodeURIComponent(workspaceId)}/members`))) ?? []
  const names = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.user_id) names.set(row.user_id, row.name || row.email || null)
  }
  return names
}

/** Resolve all issue ids of one workspace in batches; a failed batch leaves
 *  those runs on their (identifier-less) run fallback. */
async function loadRemoteIssues(remote, workspaceId, issueIds) {
  const unique = [...new Set(issueIds.filter((id) => typeof id === 'string' && id))]
  const issues = new Map()
  for (let index = 0; index < unique.length; index += 50) {
    const params = new URLSearchParams()
    params.set('workspace_id', workspaceId)
    params.set('ids', unique.slice(index, index + 50).join(','))
    const data = await read(() => multicaGet(remote, `/api/issues?${params.toString()}`))
    const rows = Array.isArray(data?.issues) ? data.issues : Array.isArray(data) ? data : []
    for (const issue of rows) if (issue?.id) issues.set(issue.id, issue)
  }
  return issues
}

async function buildRemoteSnapshot(ctx, config) {
  const { config: remote } = await loadRemoteConfig(config)
  if (!remote.url || !remote.token) {
    return { source: 'remote', configured: false, squads: [], error: 'remote Multica is not configured' }
  }
  const workspaces = await multicaGet(remote, '/api/workspaces')
  const scope = remote.workspaceId
    ? workspaces.filter((w) => w.id === remote.workspaceId)
    : workspaces
  const squads = []
  for (const workspace of scope.slice(0, 10)) {
    const query = multicaWorkspaceQuery(workspace.id)
    const list = (await read(() => multicaGet(remote, `/api/squads${query}`))) ?? []
    const agents = (await read(() => multicaGet(remote, `/api/agents${query}`))) ?? []
    const agentById = new Map(agents.map((agent) => [agent.id, agent]))
    const memberNames = await loadRemoteMemberNames(remote, workspace.id)

    // Read every squad's runs first so one workspace-wide issue lookup covers them all.
    const drafts = []
    const issueIds = []
    for (const squad of Array.isArray(list) ? list : []) {
      const members = (await read(() => multicaGet(remote, `/api/squads/${squad.id}/members${query}`))) ?? []
      const rows = []
      for (const member of Array.isArray(members) ? members : []) {
        const agent = agentById.get(member.member_id)
        if (!agent) continue
        const runs = (await read(() => multicaGet(remote, multicaTasksPath(agent.id, workspace.id, remote.taskLimit)))) ?? []
        const runList = (Array.isArray(runs) ? runs : [])
          .slice()
          .sort((left, right) => timestampOf(right.created_at) - timestampOf(left.created_at))
        for (const run of runList) if (run?.issue_id) issueIds.push(run.issue_id)
        rows.push({ agent, member, runList })
      }
      drafts.push({ squad, rows })
    }

    const issues = await loadRemoteIssues(remote, workspace.id, issueIds)
    for (const { squad, rows } of drafts) {
      const members = rows.map(({ agent, member, runList }) => {
        const tasks = dedupeRemoteTasks(
          runList
            .filter((run) => !remoteTaskIsTerminal(run, run.issue_id ? issues.get(run.issue_id) : null))
            .map((run) => remoteTaskFromRun(
              run,
              agent,
              run.issue_id ? issues.get(run.issue_id) : null,
              memberNames,
              agentById,
            )),
        )
        const running = runList.some((run) => mapRunStatus(run.status) === 'in_progress')
        const isLeader = remoteMemberIsLeader(member, squad, agent.id)
        return {
          name: agent.name,
          sessionId: agent.id,
          activity: running ? 'running' : 'inactive',
          kind: 'child',
          reason: null,
          model: agent.model || null,
          work: tasks[0]?.subject || (isLeader ? 'leader' : null),
          role: isLeader ? 'leader' : member.role || 'member',
          isLeader,
          tasks,
        }
      })
      squads.push({
        rootSessionId: `remote:${squad.id}`,
        workspaceId: workspace.id,
        workspaceTitle: workspace.name || workspace.slug || workspace.id,
        workspaceSlug: workspace.slug || '',
        presetId: null,
        kind: 'remote',
        remoteId: squad.id,
        title: squad.name,
        model: null,
        remoteUrl: remote.url,
        members,
        tasks: dedupeRemoteTasks(members.flatMap((row) => row.tasks)),
      })
    }
  }
  return {
    source: 'remote',
    configured: true,
    pollMs: remote.pollMs,
    generatedAt: new Date().toISOString(),
    stats: { workspaces: scope.length, squads: squads.length },
    squads,
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Resolve the squad configuration file path under the plugin data directory. */
function configPathOf(config) {
  if (config.squadConfigPath) return path.resolve(dshHome(), config.squadConfigPath)
  return path.join(pluginDataDir(), 'squad-member-models.json')
}

function emptyConfig() {
  return { defaults: null, squads: {}, members: {}, limits: {} }
}

/** Read the squad configuration; a missing file means "no overrides". */
async function loadConfig(config) {
  const file = configPathOf(config)
  const raw = await read(() => fsp.readFile(file, 'utf8'))
  if (!raw) return { path: file, config: emptyConfig() }
  try {
    const parsed = JSON.parse(raw)
    return {
      path: file,
      config: {
        defaults: parsed.defaults ?? null,
        squads: parsed.squads && typeof parsed.squads === 'object' && !Array.isArray(parsed.squads) ? parsed.squads : {},
        members: parsed.members && typeof parsed.members === 'object' && !Array.isArray(parsed.members) ? parsed.members : {},
        limits: parsed.limits && typeof parsed.limits === 'object' ? parsed.limits : {},
      },
    }
  } catch {
    return { path: file, config: emptyConfig(), error: 'config file is not valid JSON' }
  }
}

/** Only accept the shape the UI produces; unknown member names are kept. */
function normalizeRoute(route) {
  if (!route || typeof route !== 'object') return null
  const provider = typeof route.provider === 'string' ? route.provider.trim() : ''
  const model = typeof route.model === 'string' ? route.model.trim() : ''
  if (!provider || !model) return null
  const out = { provider, model }
  if (typeof route.reasoningEffort === 'string' && route.reasoningEffort.trim()) out.reasoningEffort = route.reasoningEffort.trim()
  return out
}

/** Normalize the roster names a squad leader dispatches to. The list is
 *  user-defined, so any non-empty string is accepted and de-duplicated. */
function normalizeMembers(input) {
  const members = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return members
  for (const [kind, names] of Object.entries(input)) {
    const clean = []
    for (const name of Array.isArray(names) ? names : []) {
      const value = typeof name === 'string' ? name.trim() : ''
      if (value && !clean.includes(value)) clean.push(value)
    }
    members[kind] = clean
  }
  return members
}

function normalizeConfig(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const squads = {}
  const squadsInput = source.squads && typeof source.squads === 'object' && !Array.isArray(source.squads) ? source.squads : {}
  for (const [kind, members] of Object.entries(squadsInput)) {
    if (!members || typeof members !== 'object' || Array.isArray(members)) continue
    const clean = {}
    for (const [name, route] of Object.entries(members)) {
      const normalized = normalizeRoute(route)
      if (normalized) clean[name] = normalized
    }
    squads[kind] = clean
  }
  const limits = {}
  const cap = Number(source.limits?.maxConcurrentPerRoute)
  if (Number.isFinite(cap) && cap >= 1) limits.maxConcurrentPerRoute = Math.floor(cap)
  return { defaults: normalizeRoute(source.defaults), squads, members: normalizeMembers(source.members), limits }
}

async function saveConfig(config, input) {
  const file = configPathOf(config)
  const normalized = normalizeConfig(input)
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  await fsp.rename(tmp, file)
  return normalized
}

/** Provider routes and their advertised models for the member picker. */
async function listModelCatalog(ctx) {
  const llm = optional(ctx, 'llm')
  if (!llm || typeof llm.listProviders !== 'function') return { providers: [], error: 'llm service unavailable' }
  const providers = (await read(() => llm.listProviders())) ?? []
  const rows = []
  for (const provider of providers) {
    const models = typeof llm.listModels === 'function' ? (await read(() => llm.listModels(provider.id))) ?? [] : []
    rows.push({
      id: provider.id,
      name: provider.name || provider.id,
      models: models.map((model) => ({ id: model.id, name: model.name || model.id })),
    })
  }
  return { providers: rows }
}

/** Read a bounded JSON request body; never buffers more than 256 KiB. */
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let settled = false
    const finish = (value) => { if (!settled) { settled = true; resolve(value) } }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 256 * 1024) { finish({ ok: false, error: 'request body too large' }); req.destroy?.(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        finish({ ok: true, value: text ? JSON.parse(text) : {} })
      } catch {
        finish({ ok: false, error: 'request body is not valid JSON' })
      }
    })
    req.on('error', () => finish({ ok: false, error: 'request failed' }))
  })
}

function registerHttp(ctx, service, resolvedConfig) {
  const webServer = ctx.get('webServer')
  const connection = ctx.get('connection')
  if (!webServer || typeof webServer.register !== 'function') return
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      try {
        const status = connection?.requestRejection?.(req)
        if (status !== undefined) { res.statusCode = status; res.end(); return }
        const pathname = new URL(String(req.url), 'http://localhost').pathname
        if (req.method === 'GET' && (pathname === ROUTE_PREFIX || pathname === `${ROUTE_PREFIX}/snapshot`)) {
          const source = new URL(String(req.url), 'http://localhost').searchParams.get('source')
          sendJson(res, 200, await service.snapshot(source))
          return
        }
        if (req.method === 'GET' && pathname === `${ROUTE_PREFIX}/remote/config`) {
          sendJson(res, 200, await service.remoteConfig())
          return
        }
        if ((req.method === 'PUT' || req.method === 'POST') && pathname === `${ROUTE_PREFIX}/remote/config`) {
          const body = await readJsonBody(req)
          if (!body.ok) { sendJson(res, 400, { error: body.error }); return }
          const saved = await service.saveRemoteConfig(body.value)
          sendJson(res, 200, { ok: true, config: { ...saved, token: saved.token ? '***' : '' }, path: remoteConfigPath(resolvedConfig) })
          return
        }
        if ((req.method === 'POST' || req.method === 'PUT') && pathname === `${ROUTE_PREFIX}/remote/workspaces`) {
          const body = await readJsonBody(req)
          if (!body.ok) { sendJson(res, 400, { error: body.error }); return }
          try {
            sendJson(res, 200, await service.remoteWorkspaces(body.value))
          } catch (error) {
            sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
          return
        }
        if (req.method === 'GET' && pathname === `${ROUTE_PREFIX}/remote/test`) {
          try {
            sendJson(res, 200, await service.remoteTest())
          } catch (error) {
            sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
          return
        }
        if (req.method === 'GET' && pathname === `${ROUTE_PREFIX}/config`) {
          sendJson(res, 200, await service.config())
          return
        }
        if (req.method === 'GET' && pathname === `${ROUTE_PREFIX}/models`) {
          sendJson(res, 200, await service.models())
          return
        }
        if ((req.method === 'PUT' || req.method === 'POST') && pathname === `${ROUTE_PREFIX}/config`) {
          const body = await readJsonBody(req)
          if (!body.ok) { sendJson(res, 400, { error: body.error }); return }
          const saved = await service.saveConfig(body.value)
          sendJson(res, 200, { ok: true, config: saved, path: configPathOf(resolvedConfig) })
          return
        }
        sendJson(res, 404, { error: 'unknown squad-dashboard route' })
      } catch (error) {
        if (!res.headersSent && !res.writableEnded) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) })
        }
      }
    },
  }), 'squad-dashboard: http routes')
}

export function apply(ctx, config) {
  const resolved = Config(config ?? {})
  const service = {
    snapshot: (source) => (source === 'remote' ? buildRemoteSnapshot(ctx, resolved) : buildSnapshot(ctx, resolved)),
    config: () => loadConfig(resolved),
    models: () => listModelCatalog(ctx),
    saveConfig: (input) => saveConfig(resolved, input),
    remoteConfig: async () => {
      const { path: file, config: remote } = await loadRemoteConfig(resolved)
      return { path: file, config: { ...remote, token: remote.token ? '***' : '' }, hasToken: Boolean(remote.token) }
    },
    saveRemoteConfig: (input) => saveRemoteConfig(resolved, input),
    remoteWorkspaces: async (input) => {
      const { config: stored } = await loadRemoteConfig(resolved)
      const draft = {
        ...stored,
        url: typeof input?.url === 'string' && input.url.trim() ? input.url.trim().replace(/\/+$/, '') : stored.url,
        token: typeof input?.token === 'string' && input.token.trim() ? input.token.trim() : stored.token,
      }
      const workspaces = await multicaGet(draft, '/api/workspaces')
      return {
        ok: true,
        workspaces: (Array.isArray(workspaces) ? workspaces : []).map((w) => ({
          id: w.id,
          name: w.name || w.slug || w.id,
          slug: w.slug || '',
        })),
      }
    },
    remoteTest: async () => {
      const { config: remote } = await loadRemoteConfig(resolved)
      const workspaces = await multicaGet(remote, '/api/workspaces')
      return { ok: true, workspaces: Array.isArray(workspaces) ? workspaces.map((w) => ({ id: w.id, name: w.name || w.slug || w.id })) : [] }
    },
  }

  ctx.provide('squadDashboard')
  ctx.squadDashboard = service
  ctx.inject(['webServer'], () => registerHttp(ctx, service, resolved))
  ctx.inject(['tools'], () => {
    const tools = ctx.get('tools')
    if (!tools || typeof tools.register !== 'function') return
    ctx.effect(() => tools.register({
      name: 'squad_config',
      description: [
        'Read or update the local squad configuration used by the ECC dashboard and squad leaders.',
        'The ECC panel edits the default model, the concurrency limit and one model route per member; use this tool to manage the member roster (add/remove members).',
        'Actions: get; update (defaults, members, squads, limits).',
        'A provided section replaces the current one, so call get first and send the full section when merging.',
        'defaults: {provider, model, reasoningEffort?}; members: kind -> member name[];',
        'squads: kind -> {member: {provider, model, reasoningEffort?}}; limits: {maxConcurrentPerRoute}.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'update'], description: 'Operation to run.' },
          defaults: { type: 'object', description: 'Default model route: {provider, model, reasoningEffort?} or null.' },
          members: { type: 'object', description: 'Member roster: kind -> member name array.' },
          squads: { type: 'object', description: 'Per-member routes: kind -> {member: {provider, model, reasoningEffort?}}.' },
          limits: { type: 'object', description: 'Limits: {maxConcurrentPerRoute}.' },
        },
        required: ['action'],
      },
      execute: async (args) => {
        const action = args?.action
        if (action === 'get') {
          const current = await service.config()
          return { path: current.path, config: current.config }
        }
        if (action !== 'update') throw new Error('action must be get or update')
        const current = (await service.config()).config
        const next = {
          defaults: args.defaults !== undefined ? args.defaults : current.defaults,
          squads: args.squads !== undefined ? args.squads : current.squads,
          members: args.members !== undefined ? args.members : current.members,
          limits: args.limits !== undefined ? args.limits : current.limits,
        }
        const saved = await service.saveConfig(next)
        return { path: configPathOf(resolved), config: saved }
      },
    }), 'squad-dashboard: config tool')
  })

  return ctx.effect(() => () => { ctx.squadDashboard = undefined }, 'squad-dashboard: dispose')
}

export const __test = {
  buildRemoteSnapshot,
  loadRemoteConfig,
  multicaGet,
  remoteTaskFromRun,
  remoteMemberIsLeader,
  dedupeRemoteTasks,
  issueCategory,
  isTerminalIssue,
  remoteTaskIsTerminal,
  loadRemoteIssues,
  normalizeConfig,
  loadConfig,
  saveConfig,
  dshHome,
  pluginDataDir,
  configPathOf,
  remoteConfigPath,
}
