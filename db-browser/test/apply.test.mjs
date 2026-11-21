import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, Config } from '../index.js'

// Cold boot: ctx.get can miss services and leave routes unregistered. Use ctx.inject.
function harness() {
  const services = new Map()
  const injectCalls = []
  const effectDisposers = []
  const ctx = {
    get: (name) => services.get(name),
    effect: (fn) => { const dispose = fn(); effectDisposers.push(dispose); return dispose },
    inject: (deps, callback) => {
      injectCalls.push({ deps, callback })
      return { async dispose() {} }
    },
  }
  const registered = { routes: [], tools: [], disposed: 0 }
  const webServer = {
    register(route) {
      registered.routes.push(route)
      return () => { registered.disposed += 1; registered.routes.splice(registered.routes.indexOf(route), 1) }
    },
  }
  const connection = { requestRejection: () => 401 }
  const tools = { register: (def) => { registered.tools.push(def.name); return () => {} } }
  return { ctx, services, injectCalls, effectDisposers, registered, webServer, connection, tools }
}

test('apply defers route and tool registration until services are published', () => {
  const h = harness()
  // Services absent, exactly as at a cold boot where this row starts first.
  apply(h.ctx, {})

  assert.equal(h.registered.routes.length, 0, 'no routes may be registered before webServer exists')
  assert.equal(h.registered.tools.length, 0, 'no tools may be registered before the tools service exists')
  assert.deepEqual(
    h.injectCalls.map((c) => c.deps),
    [['webServer', 'connection'], ['tools']],
    'registration must be deferred through ctx.inject',
  )

  // The runtime fires the inject callbacks once the services appear.
  h.services.set('webServer', h.webServer)
  h.services.set('connection', h.connection)
  h.services.set('tools', h.tools)
  for (const call of h.injectCalls) call.callback(h.ctx)

  assert.equal(h.registered.routes.length, 1)
  assert.equal(h.registered.routes[0].kind, 'prefix')
  assert.equal(h.registered.routes[0].path, '/db-browser')
  assert.deepEqual(h.registered.tools.sort(), ['db_browser', 'redis_browser'])

  // Disposal path: effects unregister the route so a service reload can re-add it.
  const before = h.registered.disposed
  for (const dispose of h.effectDisposers) dispose()
  assert.equal(h.registered.routes.length, 0)
  assert.equal(h.registered.disposed, before + 1)
})

test('Config keeps deployment defaults and rejects a bad limit', () => {
  const saved = Config({ allowWrites: true, poolMax: 8 })
  assert.equal(saved.maxRows, 500)
  assert.equal(saved.queryTimeoutMs, 30000)
  assert.equal(saved.allowWrites, true)
  assert.equal(saved.poolMax, 8)
  assert.throws(() => Config({ maxRows: 0 }), /maxRows/)
})

test('unloading closes sessions inside the plugin and does not throw', async () => {
  const h = harness()
  apply(h.ctx, {})
  h.services.set('webServer', h.webServer)
  h.services.set('connection', h.connection)
  h.services.set('tools', h.tools)
  for (const call of h.injectCalls) call.callback(h.ctx)
  const coreEffect = h.effectDisposers.find((fn) => fn.constructor.name === 'AsyncFunction' || String(fn).includes('core.closed'))
  assert.equal(typeof coreEffect, 'function')
  await coreEffect()
})

test('apply works when services are already present at apply time (hot reload)', () => {
  const h = harness()
  h.services.set('webServer', h.webServer)
  h.services.set('connection', h.connection)
  h.services.set('tools', h.tools)
  apply(h.ctx, {})
  // Still inject-driven; firing the callbacks registers everything.
  for (const call of h.injectCalls) call.callback(h.ctx)
  assert.equal(h.registered.routes.length, 1)
  assert.deepEqual(h.registered.tools.sort(), ['db_browser', 'redis_browser'])
})
