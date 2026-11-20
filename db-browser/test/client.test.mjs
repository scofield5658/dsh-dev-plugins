import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))

/** Load client.js with the module-loader surface stubbed; returns the captured module + registrations. */
function loadClient() {
  const src = readFileSync(join(here, '..', 'client.js'), 'utf8')
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => { captured = m } } },
    console,
  }
  vm.runInNewContext(src, sandbox)
  assert.ok(captured, 'client.js must register a module')
  return captured
}

function fakeReact() {
  return {
    createElement: (...args) => ({ __element: args }),
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    useCallback: (f) => f,
    useRef: (v) => ({ current: v }),
  }
}

function fakeCtx() {
  const registrations = []
  let localeDicts = null
  const ctx = {
    effect: (fn) => (typeof fn === 'function' ? fn() : undefined),
    locale: {
      register: (ns, dicts) => { localeDicts = { ns, dicts }; return () => {} },
      bind: () => (key) => key,
    },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (reg, _component) => { registrations.push(reg); return () => {} },
    },
  }
  return { registrations, getLocaleDicts: () => localeDicts, ctx }
}

test('client module registers the sidebar icon and the main panel', () => {
  const mod = loadClient()
  assert.equal(mod.id, '@local/db-browser')
  const plugin = mod.factory((name) => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  // inject comes from the vm realm; compare by value, not prototype.
  assert.equal(JSON.stringify(plugin.inject), JSON.stringify(['slots', 'locale']))
  const { registrations, getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  assert.ok(registrations.some((r) => r.name === 'sidebar.panellist' && r.id === 'database'), 'sidebar panel icon registered')
  assert.ok(registrations.some((r) => r.name === 'main' && r.key === 'database' && r.locale === 'db-browser'), 'main panel registered with locale')
  const dicts = getLocaleDicts()
  assert.equal(dicts.ns, 'db-browser')
  assert.deepEqual(Object.keys(dicts.dicts.zh).sort(), Object.keys(dicts.dicts.en).sort(), 'zh/en locale keys must match')
  // Label thunks must resolve
  const iconReg = registrations.find((r) => r.name === 'sidebar.panellist')
  assert.equal(iconReg.label(), 'panel')
})

test('locale files carry the same UI dictionary the panel registers', () => {
  const mod = loadClient()
  const plugin = mod.factory((name) => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  const { getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  const { dicts } = getLocaleDicts()
  for (const lang of ['zh', 'en']) {
    const file = JSON.parse(readFileSync(join(here, '..', 'locale', `${lang}.json`), 'utf8'))
    const registered = Object.fromEntries(Object.entries(dicts[lang]).sort(([a], [b]) => a.localeCompare(b)))
    const stored = Object.fromEntries(Object.entries(file.ui).sort(([a], [b]) => a.localeCompare(b)))
    assert.deepEqual(stored, registered, `${lang} locale ui must match the registered dictionary`)
  }
  const src = readFileSync(join(here, '..', 'client.js'), 'utf8')
  for (const match of src.matchAll(/\bt\('([^']+)'/g)) {
    assert.ok(match[1] in dicts.zh, `locale key used but missing from zh: ${match[1]}`)
    assert.ok(match[1] in dicts.en, `locale key used but missing from en: ${match[1]}`)
  }
})

test('host lists use a comma, matching Kafka broker addresses', () => {
  const mod = loadClient()
  assert.equal(typeof mod.hostList?.fromText, 'function')
  // Objects created inside the vm realm fail prototype checks; compare by value.
  const parsed = (text) => JSON.parse(JSON.stringify(mod.hostList.fromText(text)))
  assert.deepEqual(parsed('10.0.0.1:6379, 10.0.0.2:6380'), [
    { host: '10.0.0.1', port: 6379 },
    { host: '10.0.0.2', port: 6380 },
  ])
  assert.deepEqual(parsed('[::1]:6379, 10.0.0.3:6379'), [
    { host: '[::1]', port: 6379 },
    { host: '10.0.0.3', port: 6379 },
  ])
  // Previously documented one-per-line input, and semicolon-separated input, still parse.
  assert.deepEqual(parsed('10.0.0.1:6379\n10.0.0.2:6379'), [
    { host: '10.0.0.1', port: 6379 },
    { host: '10.0.0.2', port: 6379 },
  ])
  assert.deepEqual(parsed('10.0.0.1:26379; 10.0.0.2:26379'), [
    { host: '10.0.0.1', port: 26379 },
    { host: '10.0.0.2', port: 26379 },
  ])
  assert.equal(
    mod.hostList.toText([{ host: '10.0.0.1', port: 6379 }, { host: '10.0.0.2', port: 6380 }]),
    '10.0.0.1:6379, 10.0.0.2:6380',
  )
  const plugin = mod.factory((name) => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  const { getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  const { dicts } = getLocaleDicts()
  assert.match(dicts.zh['form.hostsHint'], /英文逗号/)
  assert.match(dicts.en['form.hostsHint'], /comma/i)
  assert.doesNotMatch(dicts.zh['form.hostsHint'], /每行一个/)
  assert.doesNotMatch(dicts.en['form.hostsHint'], /per line/)
})

function createStatefulReact() {
  const slots = []
  let cursor = 0
  let effects = []
  const react = {
    begin() { cursor = 0; effects = [] },
    async flush() {
      const pending = effects
      effects = []
      for (const effect of pending) effect()
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    createElement: (...args) => ({ __element: args }),
    useState(init) {
      const index = cursor++
      if (!Object.hasOwn(slots, index)) slots[index] = typeof init === 'function' ? init() : init
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useEffect(effect) { effects.push(effect) },
    useCallback: (fn) => fn,
    useRef(init) {
      const index = cursor++
      if (!Object.hasOwn(slots, index)) slots[index] = { current: init }
      return slots[index]
    },
  }
  return react
}

function* walkElements(node, seen = new Set()) {
  if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    for (const child of node) yield* walkElements(child, seen)
    return
  }
  if (typeof node !== 'object' || !Array.isArray(node.__element) || seen.has(node)) return
  seen.add(node)
  yield node
  const [, props, ...children] = node.__element
  for (const child of children) yield* walkElements(child, seen)
  if (props !== null && typeof props === 'object') {
    for (const value of Object.values(props)) yield* walkElements(value, seen)
  }
}

test('starting Redis does not query it as SQL, and a stopped Redis view does not scan', async () => {
  const calls = []
  let status = 'stopped'
  const redis = {
    id: 'goats-redis',
    label: 'goats-redis',
    type: 'redis',
    mode: 'standalone',
    hosts: [{ host: '10.0.0.1', port: 6379 }],
    get status() { return status },
  }
  const src = readFileSync(join(here, '..', 'client.js'), 'utf8')
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => { captured = m } }, confirm: () => false },
    console,
    fetch: async (url, init) => {
      calls.push(String(url))
      const path = String(url)
      const ok = (value) => ({ ok: true, status: 200, json: async () => ({ ok: true, value }) })
      if (path.endsWith('/connections')) return ok({ connections: [{ ...redis, status }], allowWrites: false, maxRows: 500 })
      if (path.endsWith('/connect')) { status = 'open'; return ok({ id: redis.id, status: 'open' }) }
      if (path.endsWith('/redis-keys')) return ok({ keys: ['a'], truncated: false })
      if (path.endsWith('/redis-dbsize')) return ok({ dbsize: 1 })
      if (path.endsWith('/list-databases')) {
        return { ok: true, status: 400, json: async () => ({ ok: false, error: { message: 'Connection goats-redis is redis, not a SQL database' } }) }
      }
      return ok({})
    },
  }
  vm.runInNewContext(src, sandbox)
  const react = createStatefulReact()
  const plugin = captured.factory((name) => (name === 'react' ? react : (() => { throw new Error(`unexpected require ${name}`) })()))
  let Panel = null
  plugin.apply({
    effect: (fn) => (typeof fn === 'function' ? fn() : undefined),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (reg, component) => { if (reg.name === 'main') Panel = component; return () => {} },
    },
  })
  const render = () => {
    react.begin()
    const tree = Panel({ t: (key) => key })
    const views = []
    for (const el of walkElements(tree)) {
      const [type, props] = el.__element
      if (typeof type === 'function' && type.name === 'RedisView') views.push(type(props))
    }
    return { tree, views }
  }
  render()
  await react.flush()
  render()
  await react.flush()
  const opened = render()
  const row = [...walkElements(opened.tree)].find((el) => {
    const [type, props] = el.__element
    return typeof type === 'function' && props?.label === 'goats-redis'
  })
  assert.ok(row, 'redis connection row rendered')
  row.__element[1].onClick()
  const viewing = render()
  await react.flush()
  assert.equal(calls.some((url) => url.endsWith('/redis-keys')), false, 'a stopped redis view must not scan')
  assert.equal(calls.some((url) => url.endsWith('/list-databases')), false)
  assert.match(JSON.stringify(viewing.views), /conn\.needStart/)
  const start = [...walkElements(viewing.tree)].find((el) => el.__element[1]?.title === 'conn.start')
  assert.ok(start, 'start button rendered')
  await start.__element[1].onClick()
  assert.equal(calls.some((url) => url.endsWith('/connect')), true)
  assert.equal(calls.some((url) => url.endsWith('/list-databases')), false, 'starting redis must not list SQL databases')
  calls.length = 0
  render()
  await react.flush()
  assert.equal(calls.some((url) => url.endsWith('/redis-keys')), false, 'opening a redis connection must not scan keys')
  assert.equal(calls.some((url) => url.endsWith('/redis-dbsize')), true, 'dbsize is a constant-time count, not a key scan')
})
