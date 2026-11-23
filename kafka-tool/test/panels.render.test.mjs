import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const artifact = new URL('../client.js', import.meta.url)
const source = new URL('../src/client.js', import.meta.url)

/** Platform singletons the host module table serves to plugin bundles. */
const MODULE_TABLE = new Set(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'])

function loadArtifact() {
  const src = readFileSync(artifact, 'utf8')
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: m => { captured = m } } },
    console,
    TextDecoder,
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  }
  vm.runInNewContext(src, sandbox)
  assert.ok(captured, 'client.js must register a module')
  return { captured, src }
}

function renderPanel() {
  const { captured } = loadArtifact()
  const plugin = captured.factory(name => {
    if (name === 'react') return React
    if (name === 'react-dom') return require('react-dom')
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    throw new Error(`unexpected require ${name}`)
  })
  let Panel = null
  plugin.apply({
    effect: fn => (typeof fn === 'function' ? fn() : undefined),
    locale: { register: () => () => {}, bind: () => key => key },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (registration, component) => {
        if (registration.name === 'main') Panel = component
        return () => {}
      },
    },
  })
  assert.ok(Panel, 'main panel registered')
  // The library measures with layout effects; a static render has none, so its
  // "useLayoutEffect does nothing on the server" warning is expected here.
  const realError = console.error
  console.error = () => {}
  try {
    return renderToStaticMarkup(React.createElement(Panel, { t: key => key }))
  } finally {
    console.error = realError
  }
}

test('the panel mounts on the host React and renders the explorer shell', () => {
  const html = renderPanel()
  assert.match(html, /class="kx-root"/)
  assert.match(html, /class="kx-viewtabs"/, 'view tabs render')
})

test('every data list uses the one resizable table implementation', () => {
  const src = readFileSync(source, 'utf8')
  // stream, topics, consumer groups, and both offset detail tables
  assert.equal((src.match(/h\(VirtualTable, \{/g) || []).length, 5,
    'all five data lists render through VirtualTable')
  // The table declares its columns and injects a handle per header cell.
  assert.match(src, /h\(ColumnGroup, \{ count: columnCount, widths \}\)/)
  assert.match(src, /withColumnResizers\(head, startResize, t\)/)
  assert.match(src, /className: 'kx-col-resizer'/)
  assert.match(src, /hasWidth \? \{ tableLayout: 'fixed' \} : undefined/)
  // The stream list kept its six columns after the conversion.
  for (const cls of ['kx-col-time', 'kx-col-topic', 'kx-col-part', 'kx-col-offset', 'kx-col-key', 'kx-col-size']) {
    assert.match(src, new RegExp(`className: 'kx-cell ${cls}'`), `${cls} header exists`)
  }
  assert.match(src, /const renderMessageRow = useCallback\(msg => \{[\s\S]*?h\('tr', \{/, 'message rows are table rows')
})

test('topic and consumer-group details sit in a resizable vertical pane group', () => {
  const src = readFileSync(source, 'utf8')
  assert.equal((src.match(/className: 'kx-split', orientation: 'vertical'/g) || []).length, 2,
    'both the topics and the groups view use one vertical group')
  assert.match(src, /id: 'topics-detail'/)
  assert.match(src, /id: 'groups-detail'/)
  assert.match(src, /className: 'kx-splitter'/)
  assert.match(src, /className: 'kx-detail kx-detail-pane'/)
})

test('the built bundle only requires module-table singletons', () => {
  const { src } = loadArtifact()
  assert.match(src, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(src, /id: "@local\/kafka-tool"/)
  for (const match of src.matchAll(/\brequire\("([^"]+)"\)/g)) {
    assert.ok(MODULE_TABLE.has(match[1]), `client.js requires ${match[1]}, which the host module table does not provide`)
  }
})
