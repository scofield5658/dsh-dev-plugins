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

test('locale files match the client dictionaries', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  for (const file of ['en.json', 'zh.json']) {
    const dict = JSON.parse(readFileSync(new URL(`../locale/${file}`, import.meta.url), 'utf8'))
    for (const [key, value] of Object.entries(dict)) {
      const quoted = client.includes(`'${key}'`) || client.includes(`"${key}"`)
      const bare = new RegExp(`(^|\\n)\\s*${key}\\s*:`).test(client)
      assert.equal(quoted || bare, true, `${file} key ${key}`)
      assert.equal(client.includes(value), true, `${file} value ${value}`)
    }
  }
})
