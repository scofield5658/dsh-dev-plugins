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
