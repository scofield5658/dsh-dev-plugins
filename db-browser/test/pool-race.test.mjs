import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DbCore } from '../index.js'

const stubCtx = () => ({ get: () => undefined })
const coreWith = () => new DbCore(stubCtx(), {
  connections: [{ id: 'm', type: 'mysql', user: 'u', hosts: [{ host: 'h' }] }],
})
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('concurrent startConnection calls share one pool build', async () => {
  const core = coreWith()
  let builds = 0
  core.openHandle = async () => {
    builds += 1
    await sleep(20)
    return { close: async () => {} }
  }
  const [a, b] = await Promise.all([core.startConnection('m'), core.startConnection('m')])
  assert.equal(builds, 1, 'two racing starts must not build two pools')
  assert.deepEqual(a, b)
  assert.equal(core.statusOf('m'), 'open')
})

test('stopConnection waits for an in-flight start, then closes the pool', async () => {
  const core = coreWith()
  let closed = 0
  core.openHandle = async () => {
    await sleep(20)
    return { close: async () => { closed += 1 } }
  }
  const start = core.startConnection('m')
  const stop = core.stopConnection('m')
  await Promise.all([start, stop])
  assert.equal(closed, 1, 'the pool built by the racing start must be closed')
  assert.equal(core.statusOf('m'), 'stopped')
})

test('runOn never resurrects a pool whose connection was stopped mid-flight', async () => {
  const core = coreWith()
  let reopened = 0
  core.sessions.set('m', {
    status: 'open',
    type: 'mysql',
    handle: { reopen: async () => { reopened += 1 }, close: async () => {} },
  })
  const attempt = core.runOn(core.get('m'), async () => {
    const error = new Error('read ECONNRESET')
    error.code = 'ECONNRESET'
    throw error
  })
  // Stop lands before runOn's catch evaluates the connection-loss retry.
  await core.stopConnection('m')
  await assert.rejects(attempt, /ECONNRESET/)
  assert.equal(reopened, 0, 'a stopped connection must not get a fresh pool')
})

test('runOn reconnects transparently when the session is still alive', async () => {
  const core = coreWith()
  let reopened = 0
  let calls = 0
  core.sessions.set('m', {
    status: 'open',
    type: 'mysql',
    handle: { reopen: async () => { reopened += 1 }, close: async () => {} },
  })
  const result = await core.runOn(core.get('m'), async () => {
    calls += 1
    if (calls === 1) {
      const error = new Error('read ECONNRESET')
      error.code = 'ECONNRESET'
      throw error
    }
    return 'ok'
  })
  assert.equal(result, 'ok')
  assert.equal(reopened, 1)
})
