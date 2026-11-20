import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))

/** Load client.js with the module-loader surface stubbed; returns the captured module. */
function loadClient() {
  const src = readFileSync(join(here, '..', 'client.js'), 'utf8')
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: m => { captured = m } } },
    console,
    TextDecoder,
  }
  vm.runInNewContext(src, sandbox)
  assert.ok(captured, 'client.js must register a module')
  return { captured, src }
}

function fakeReact() {
  return {
    createElement: (...args) => ({ __element: args }),
    useState: v => [v, () => {}],
    useEffect: () => {},
    useCallback: f => f,
    useRef: v => ({ current: v }),
  }
}

function fakeCtx() {
  const registrations = []
  let localeDicts = null
  const ctx = {
    effect: fn => (typeof fn === 'function' ? fn() : undefined),
    locale: {
      register: (ns, dicts) => { localeDicts = { ns, dicts }; return () => {} },
      bind: () => key => key,
    },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (reg, _component) => { registrations.push(reg); return () => {} },
    },
  }
  return { registrations, getLocaleDicts: () => localeDicts, ctx }
}

test('client module registers the sidebar icon and the main panel', () => {
  const { captured } = loadClient()
  assert.equal(captured.id, '@local/kafka-tool')
  const plugin = captured.factory(name => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  // Arrays from the vm realm fail prototype checks; re-home them first.
  assert.deepEqual([...plugin.inject], ['slots', 'locale'])
  const { registrations, getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  const icon = registrations.find(r => r.name === 'sidebar.panellist')
  assert.ok(icon, 'sidebar panel icon registered')
  assert.equal(icon.id, 'kafka-tool')
  assert.equal(typeof icon.label, 'function')
  assert.equal(icon.label(), 'panel')
  const main = registrations.find(r => r.name === 'main')
  assert.ok(main, 'main panel registered')
  assert.equal(main.key, 'kafka-tool')
  assert.equal(main.locale, 'kafkaTool')
  const dicts = getLocaleDicts()
  assert.equal(dicts.ns, 'kafkaTool')
})

test('locale files carry the same UI dictionary the panel registers', () => {
  const { captured, src } = loadClient()
  const plugin = captured.factory(name => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  const { getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  const { dicts } = getLocaleDicts()
  for (const lang of ['zh', 'en']) {
    const file = JSON.parse(readFileSync(join(here, '..', 'locale', `${lang}.json`), 'utf8'))
    const registered = Object.fromEntries(Object.entries(dicts[lang]).sort(([a], [b]) => a.localeCompare(b)))
    const stored = Object.fromEntries(Object.entries(file.ui).sort(([a], [b]) => a.localeCompare(b)))
    assert.deepEqual(stored, registered, `${lang} locale ui must match the registered dictionary`)
  }
  for (const match of src.matchAll(/\bt\('([^']+)'/g)) {
    assert.ok(match[1] in dicts.zh, `locale key used but missing from zh: ${match[1]}`)
    assert.ok(match[1] in dicts.en, `locale key used but missing from en: ${match[1]}`)
  }
})

test('zh and en locale dictionaries carry the same keys', () => {
  const { captured } = loadClient()
  const plugin = captured.factory(name => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  const { getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  const { dicts } = getLocaleDicts()
  assert.deepEqual(
    Object.keys(dicts.zh).sort(),
    Object.keys(dicts.en).sort(),
    'zh/en locale keys must match',
  )
})

test('every translated key used in the source exists in the dictionaries', () => {
  const { captured, src } = loadClient()
  const plugin = captured.factory(name => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  const { getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  const { dicts } = getLocaleDicts()
  const used = new Set()
  for (const match of src.matchAll(/\bt\('([^']+)'/g)) used.add(match[1])
  for (const key of used) {
    assert.ok(key in dicts.en, `locale key used but missing from en: ${key}`)
    assert.ok(key in dicts.zh, `locale key used but missing from zh: ${key}`)
  }
})

test('dictionaries never interpolate unknown parameters', () => {
  const { captured, src } = loadClient()
  const plugin = captured.factory(name => (name === 'react' ? fakeReact() : (() => { throw new Error(`unexpected require ${name}`) })()))
  const { getLocaleDicts, ctx } = fakeCtx()
  plugin.apply(ctx)
  const { dicts } = getLocaleDicts()
  // Keys whose call site passes parameters must declare them; find call sites
  // like t('key', { count: ... }) and ensure each param appears in both dicts.
  for (const match of src.matchAll(/\bt\('([^']+)', \{ (\w+):/g)) {
    const [, key, param] = match
    assert.ok(dicts.en[key]?.includes(`{${param}}`), `en dict ${key} must use {${param}}`)
    assert.ok(dicts.zh[key]?.includes(`{${param}}`), `zh dict ${key} must use {${param}}`)
  }
})

function fakeReactRuntime() {
  return {
    createElement: (...args) => ({ __element: args }),
    Fragment: Symbol.for('test.fragment'),
    useState: v => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {},
    useCallback: f => f,
    useMemo: f => f(),
    useRef: v => ({ current: v }),
  }
}

function* walkElements(node) {
  if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    for (const child of node) yield* walkElements(child)
    return
  }
  if (typeof node !== 'object' || !Array.isArray(node.__element)) return
  yield node
  const [, props, ...rest] = node.__element
  for (const child of rest) yield* walkElements(child)
  if (props !== null && typeof props === 'object') yield* walkElements(props.children)
}

test('the connect button builds its request from the form, not the click event', async () => {
  const src = readFileSync(join(here, '..', 'client.js'), 'utf8')
  let captured = null
  const fetchCalls = []
  const sandbox = {
    window: { __ModuleLoader__: { load: m => { captured = m } } },
    console,
    TextDecoder,
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (url, init) => {
      fetchCalls.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ id: 'c1', clusterId: 'x', brokers: ['b:9092'] }) }
    },
  }
  vm.runInNewContext(src, sandbox)
  assert.ok(captured, 'client.js must register a module')
  const plugin = captured.factory(name => (name === 'react' ? fakeReactRuntime() : (() => { throw new Error(`unexpected require ${name}`) })()))

  let panelComponent = null
  const ctx = {
    effect: fn => (typeof fn === 'function' ? fn() : undefined),
    locale: { register: () => () => {}, bind: () => key => key },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (reg, component) => { if (reg.name === 'main') panelComponent = component; return () => {} },
    },
  }
  plugin.apply(ctx)
  assert.equal(typeof panelComponent, 'function', 'main panel component captured')

  // createElement does not invoke function components; resolve the wrapper and
  // the app manually, then walk the tree statically (nested components stay
  // unrendered — their props, onClick included, are what we inspect).
  const wrapper = panelComponent({ t: key => key })
  const app = wrapper.__element[0](wrapper.__element[1])
  const tree = typeof app?.__element?.[0] === 'function' ? app.__element[0](app.__element[1]) : app
  const button = [...walkElements(tree)].find((el) => {
    const [, props] = el.__element
    return props !== null && typeof props === 'object' && props.primary === true && typeof props.onClick === 'function'
  })
  assert.ok(button, 'connect button rendered')
  const onClick = button.__element[1].onClick

  // A bare onClick reference receives the click event; the handler must still
  // build the request from the form state. Regression: onClick: connect used
  // to throw "Cannot read properties of undefined (reading 'split')" here.
  await onClick({ type: 'click' })

  const post = fetchCalls.find(call => call.init?.method === 'POST')
  assert.ok(post, 'clicking connect must POST to the connections route')
  assert.ok(post.url.endsWith('/api/kafka-tool/connections'))
  const body = JSON.parse(post.init.body)
  assert.ok(Array.isArray(body.brokers), 'brokers must come from the form as an array')
})
