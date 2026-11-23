import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)

/** Load the built artifact and return the module registration it submits. */
function loadArtifact() {
  const src = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => { captured = m } } },
    console,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, value: { connections: [], allowWrites: false, maxRows: 500 } }),
    }),
  }
  vm.runInNewContext(src, sandbox)
  assert.ok(captured, 'client.js must register a module')
  return captured
}

/** The module-table entries this bundle may request, backed by the real packages. */
function moduleTable() {
  return (name) => {
    if (name === 'react') return React
    if (name === 'react-dom') return require('react-dom')
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    throw new Error(`unexpected require ${name}`)
  }
}

function renderPanel() {
  const mod = loadArtifact()
  const plugin = mod.factory(moduleTable())
  let Panel = null
  plugin.apply({
    effect: (fn) => (typeof fn === 'function' ? fn() : undefined),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (registration, component) => {
        if (registration.name === 'main') Panel = component
        return () => {}
      },
    },
  })
  assert.ok(Panel, 'main panel registered')
  // The library measures with layout effects; a static server render has none, so its
  // "useLayoutEffect does nothing on the server" warning is expected here.
  const realError = console.error
  console.error = () => {}
  try {
    return renderToStaticMarkup(React.createElement(Panel, { t: (key) => key }))
  } finally {
    console.error = realError
  }
}

test('the sidebar renders a real panel group with our classes inside the panels', () => {
  const rendered = renderPanel()
  // The component ships its CSS inline; compare the body so style text cannot match.
  const html = rendered.slice(rendered.indexOf('</style>'))
  assert.match(html, /data-group/, 'react-resizable-panels Group renders')
  assert.equal((html.match(/data-panel(?=[\s=>])/g) || []).length, 2, 'the sidebar has exactly two panels')
  assert.match(html, /data-separator/, 'the group has a resize separator')
  assert.match(html, /role="separator"/, 'the separator is exposed to assistive technology')
  // Our own containers must live inside the panels, not replace them.
  assert.match(html, /class="dbb-aside"/)
  assert.match(html, /class="dbb-main"/)
  const aside = html.indexOf('class="dbb-aside"')
  const main = html.indexOf('class="dbb-main"')
  const separator = html.indexOf('data-separator')
  assert.ok(aside < separator && separator < main, 'order is tree, separator, main')
})
