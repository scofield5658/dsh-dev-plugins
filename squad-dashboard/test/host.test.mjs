import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { squadKind, isSquad, mapMember, apply, __test } from '../index.js'

test('squadKind derives the kind from the configured prefix', () => {
  assert.equal(squadKind('squad-dev-leader'), 'dev')
  assert.equal(squadKind('squad-product-leader'), 'product')
  assert.equal(squadKind('squad-test-leader'), 'test')
  assert.equal(squadKind('squad-ops'), 'ops')
  assert.equal(squadKind('cordis'), null)
  assert.equal(squadKind(null), null)
})

test('squadKind honors explicit aliases and a custom prefix', () => {
  assert.equal(squadKind('squad-dev-leader', { squadKinds: { engineering: ['squad-dev-leader'] } }), 'engineering')
  assert.equal(squadKind('crew-ux-leader', { squadPresetPrefix: 'crew-' }), 'ux')
  assert.equal(squadKind('crew-ux-leader'), null)
  assert.equal(squadKind('squad-', {}), null)
})

test('isSquad accepts team mode, preset prefix, or any descendant', () => {
  assert.equal(isSquad({ teamEnabled: true, presetId: null, memberCount: 0, prefix: 'squad-' }), true)
  assert.equal(isSquad({ teamEnabled: false, presetId: 'squad-dev-leader', memberCount: 0, prefix: 'squad-' }), true)
  assert.equal(isSquad({ teamEnabled: false, presetId: 'plain', memberCount: 1, prefix: 'squad-' }), true)
  assert.equal(isSquad({ teamEnabled: false, presetId: 'plain', memberCount: 0, prefix: 'squad-' }), false)
  assert.equal(isSquad({ teamEnabled: false, presetId: 'squad-dev-leader', memberCount: 0, prefix: '' }), false)
  assert.equal(isSquad({ teamEnabled: false, presetId: 'crew-dev-leader', memberCount: 0, prefix: '', presetIds: ['crew-dev-leader'] }), true)
})

test('mapMember keeps the catalog label as the current task', () => {
  assert.deepEqual(mapMember({
    kind: 'child',
    id: 'child-1',
    name: 'squad-dash-ui',
    path: 'squad-dash-ui',
    activity: 'inactive',
    mode: 'continuable',
    label: '实现 squad-dashboard Client 面板',
  }), {
    name: 'squad-dash-ui',
    path: 'squad-dash-ui',
    sessionId: 'child-1',
    activity: 'inactive',
    kind: 'child',
    reason: null,
    work: '实现 squad-dashboard Client 面板',
  })
})

test('mapMember reports diagnostic rows without inventing a task', () => {
  assert.equal(mapMember({ kind: 'diagnostic', id: 'bad', reason: 'corrupt' }).reason, 'corrupt')
  assert.equal(mapMember({ kind: 'diagnostic', id: 'bad', reason: 'corrupt' }).work, null)
})

test('normalizeConfig keeps user-defined rosters and drops empty names', () => {
  const normalized = __test.normalizeConfig({
    defaults: { provider: 'p', model: 'm' },
    squads: { dev: { analyst: { provider: 'p', model: 'm' }, broken: { provider: '', model: '' } } },
    members: { dev: ['analyst', ' analyst ', '', 'backend'], product: [] },
    limits: { maxConcurrentPerRoute: 3.7 },
  })
  assert.deepEqual(normalized.members, { dev: ['analyst', 'backend'], product: [] })
  assert.deepEqual(normalized.squads.dev, { analyst: { provider: 'p', model: 'm' } })
  assert.deepEqual(normalized.limits, { maxConcurrentPerRoute: 3 })
})

test('saveConfig persists the member roster and loadConfig reads it back', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'squad-dashboard-'))
  const config = { squadConfigPath: path.join(dir, 'config.json') }
  try {
    await __test.saveConfig(config, {
      defaults: { provider: 'p', model: 'm' },
      squads: { dev: { analyst: { provider: 'p', model: 'm' } } },
      members: { dev: ['analyst', 'backend'], product: [] },
      limits: { maxConcurrentPerRoute: 2 },
    })
    const loaded = await __test.loadConfig(config)
    assert.deepEqual(loaded.config.members, { dev: ['analyst', 'backend'], product: [] })
    assert.deepEqual(loaded.config.squads.dev, { analyst: { provider: 'p', model: 'm' } })
    assert.deepEqual(loaded.config.defaults, { provider: 'p', model: 'm' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('config paths resolve under the per-plugin DSH_HOME directory', () => {
  const home = __test.dshHome()
  const dataDir = __test.pluginDataDir()
  assert.equal(dataDir, path.join(home, 'plugins', 'squad-dashboard'))
  assert.equal(__test.configPathOf({}), path.join(dataDir, 'squad-member-models.json'))
  assert.equal(__test.remoteConfigPath({}), path.join(dataDir, 'squad-remote.json'))
  assert.equal(__test.configPathOf({ squadConfigPath: 'nested/squad.json' }), path.join(home, 'nested/squad.json'))
  assert.equal(__test.remoteConfigPath({ remoteConfigPath: 'nested/remote.json' }), path.join(home, 'nested/remote.json'))
})

test('apply registers the squad_config tool', () => {
  const registered = []
  const ctx = {
    provide() {},
    effect(fn) { return fn() },
    get(name) {
      return name === 'tools'
        ? { register: (definition) => { registered.push(definition); return () => {} } }
        : undefined
    },
    inject(_deps, callback) { callback() },
  }
  apply(ctx, {})
  const definition = registered.find((one) => one.name === 'squad_config')
  assert.ok(definition, 'squad_config tool is registered')
  assert.deepEqual(definition.parameters.required, ['action'])
})

test('squad_config tool keeps the per-plugin config in sync', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'squad-config-'))
  const previous = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = dir
    const file = path.join(dir, 'plugins', 'squad-dashboard', 'squad-member-models.json')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({
      defaults: { provider: 'p0', model: 'm0' },
      members: { dev: ['analyst'] },
      squads: { dev: { analyst: { provider: 'p1', model: 'm1' } } },
      limits: { maxConcurrentPerRoute: 2 },
    }))

    let tool
    const ctx = {
      provide() {},
      effect(fn) { return fn() },
      get(name) {
        return name === 'tools'
          ? { register: (definition) => { tool = definition; return () => {} } }
          : undefined
      },
      inject(_deps, callback) { callback() },
    }
    apply(ctx, {})

    const got = await tool.execute({ action: 'get' })
    assert.equal(got.path, file)
    assert.deepEqual(got.config.members, { dev: ['analyst'] })

    await tool.execute({ action: 'update', defaults: { provider: 'p2', model: 'm2' } })
    const updated = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(updated.defaults, { provider: 'p2', model: 'm2' })
    assert.deepEqual(updated.members, { dev: ['analyst'] })

  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('remoteTaskFromRun uses the issue metadata and the project workflow state', () => {
  const task = __test.remoteTaskFromRun(
    {
      id: 'run-1',
      issue_id: 'issue-1',
      status: 'claimed',
      created_at: '2026-09-17T13:33:47Z',
      trigger_summary: 'trigger',
    },
    { id: 'agent-1', name: 'worker' },
    {
      id: 'issue-1',
      identifier: 'NBCF-28',
      title: 'ContextHub 首版',
      status: 'in_review',
      status_category: 'started',
      status_name: '评估中',
      creator_id: 'user-1',
      creator_type: 'member',
      created_at: '2026-09-01T02:00:00Z',
    },
    new Map([['user-1', '王杰(gfwangjie)']]),
    new Map([['agent-1', { id: 'agent-1', name: 'worker' }]]),
  )
  assert.equal(task.id, 'issue-1')
  assert.equal(task.identifier, 'NBCF-28')
  assert.equal(task.subject, 'ContextHub 首版')
  assert.equal(task.status, 'started')
  assert.equal(task.statusName, '评估中')
  assert.equal(task.initiator, '王杰(gfwangjie)')
  assert.equal(task.createdAt, '2026-09-01T02:00:00Z')
  assert.equal(task.ownerName, 'worker')
  assert.equal(task.agentId, 'agent-1')
})

test('remoteTaskFromRun falls back to run metadata without an issue', () => {
  const task = __test.remoteTaskFromRun(
    {
      id: 'e3fd735f696e4fbaafb6',
      status: 'running',
      created_at: '2026-09-01T02:49:57Z',
      trigger_summary: '请评审设计',
      attribution: { initiator: { name: '李明' } },
    },
    { id: 'agent-2', name: 'reviewer' },
    null,
    new Map(),
    new Map(),
  )
  assert.equal(task.identifier, 'e3fd735f')
  assert.equal(task.subject, '请评审设计')
  assert.equal(task.status, 'in_progress')
  assert.equal(task.statusName, null)
  assert.equal(task.initiator, '李明')
  assert.equal(task.createdAt, '2026-09-01T02:49:57Z')
})

test('dedupeRemoteTasks keeps the newest run per issue and sorts newest first', () => {
  const tasks = __test.dedupeRemoteTasks([
    { id: 'issue-a', identifier: 'A-1', createdAt: '2026-09-01T00:00:00Z' },
    { id: 'issue-b', identifier: 'B-2', createdAt: '2026-09-03T00:00:00Z' },
    { id: 'issue-a', identifier: 'A-1', createdAt: '2026-09-02T00:00:00Z' },
    { id: 'issue-c', identifier: 'C-3', createdAt: null },
  ])
  assert.deepEqual(tasks.map((task) => task.identifier), ['B-2', 'A-1', 'C-3'])
})

test('issueCategory folds built-in and workflow statuses into four categories', () => {
  assert.equal(__test.issueCategory({ status: 'in_review' }), 'started')
  assert.equal(__test.issueCategory({ status: 'backlog' }), 'unstarted')
  assert.equal(__test.issueCategory({ status: 'completed' }), 'done')
  assert.equal(__test.issueCategory({ status: 'cancelled' }), 'closed')
  assert.equal(__test.issueCategory({ status_category: 'done' }), 'done')
  assert.equal(__test.issueCategory({ status_category: 'closed', status: 'anything' }), 'closed')
  assert.equal(__test.issueCategory({ status: 'custom_state' }), null)
})

test('remoteTaskIsTerminal hides done and closed workflow states only', () => {
  assert.equal(__test.remoteTaskIsTerminal({ status: 'running' }, { status: 'done' }), true)
  assert.equal(__test.remoteTaskIsTerminal({ status: 'running' }, { status: 'cancelled' }), true)
  assert.equal(__test.remoteTaskIsTerminal({ status: 'running' }, { status_category: 'closed' }), true)
  assert.equal(__test.remoteTaskIsTerminal({ status: 'running' }, { status: 'in_review' }), false)
  assert.equal(__test.remoteTaskIsTerminal({ status: 'running' }, { status_category: 'started' }), false)
  assert.equal(__test.remoteTaskIsTerminal({ status: 'completed' }, null), true)
  assert.equal(__test.remoteTaskIsTerminal({ status: 'running' }, null), false)
  assert.equal(__test.remoteTaskIsTerminal({ status: 'completed', issue_id: 'missing' }, null), false)
})

test('locale files match the client dictionaries', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  for (const file of ['en.json', 'zh.json']) {
    const dict = JSON.parse(readFileSync(new URL(`../locale/${file}`, import.meta.url), 'utf8'))
    for (const [key, value] of Object.entries(dict)) {
      // `meta` is plugin display metadata for the Plugin Manager, not a client UI string.
      if (key === 'meta') continue
      const quoted = client.includes(`'${key}'`) || client.includes(`"${key}"`)
      const bare = new RegExp(`(^|\\n)\\s*${key}\\s*:`).test(client)
      assert.equal(quoted || bare, true, `${file} key ${key}`)
      assert.equal(client.includes(value), true, `${file} value ${value}`)
    }
  }
})
