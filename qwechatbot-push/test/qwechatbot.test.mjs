import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { QwechatbotCore, buildToolDefinitions, buildPayload } from '../index.js'

const stubCtx = () => ({ get: () => undefined })

const coreWith = (channels = [
  { id: 'build', purpose: 'build notifications', key: 'build-key-1' },
  { id: 'alerts', purpose: 'on-call alerts', key: '' },
]) => new QwechatbotCore(stubCtx(), { channels })

async function withFileCore(channels, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qwp-'))
  const file = path.join(dir, 'channels.json')
  try {
    const core = new QwechatbotCore(stubCtx(), { channels }, { channelsFile: file })
    await fn(core, file)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('buildToolDefinitions exposes one MCP-compatible tool', () => {
  const tools = buildToolDefinitions(coreWith())
  assert.equal(tools.length, 1)
  const tool = tools[0]
  assert.equal(tool.name, 'qwechatbot_push')
  assert.equal(tool.parameters.type, 'object')
  assert.deepEqual(tool.parameters.required, ['action'])
  assert.equal(typeof tool.execute, 'function')
  assert.deepEqual(tool.parameters.properties.action.enum, ['list_channels', 'save_channel', 'remove_channel', 'push'])
  assert.ok(tool.parameters.properties.msgtype.enum.includes('text'))
  assert.ok(tool.parameters.properties.msgtype.enum.includes('markdown'))
})

test('list_channels returns id, purpose, and the plaintext key', async () => {
  const r = await buildToolDefinitions(coreWith())[0].execute({ action: 'list_channels' })
  assert.equal(r.channels.length, 2)
  assert.equal(r.channels[0].id, 'build')
  assert.equal(r.channels[0].purpose, 'build notifications')
  assert.equal(r.channels[0].key, 'build-key-1')
  assert.equal(r.channels[1].key, '')
})

test('save_channel and remove_channel round-trip to the store file', async () => {
  await withFileCore([], async (core) => {
    const tool = buildToolDefinitions(core)[0]
    await tool.execute({ action: 'save_channel', id: 'daily', purpose: 'daily report', key: 'k-1' })
    let r = await tool.execute({ action: 'list_channels' })
    assert.deepEqual(r.channels.map((c) => [c.id, c.key]), [['daily', 'k-1']])
    await tool.execute({ action: 'remove_channel', id: 'daily' })
    r = await tool.execute({ action: 'list_channels' })
    assert.equal(r.channels.length, 0)
  })
})

test('key is stored in plaintext in the store file and survives reload', async () => {
  await withFileCore([], async (core, file) => {
    await core.saveChannel({ id: 'build', purpose: 'build notifications', key: 'abc-123-key' })
    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(raw.channels[0].key, 'abc-123-key')
    const reloaded = new QwechatbotCore(stubCtx(), {}, { channelsFile: file })
    assert.equal(reloaded.get('build').key, 'abc-123-key')
  })
})

test('buildPayload validates text and markdown byte limits', () => {
  const text = buildPayload({ msgtype: 'text', content: 'hi', mentioned_list: ['zhangsan'] })
  assert.deepEqual(text, { msgtype: 'text', text: { content: 'hi', mentioned_list: ['zhangsan'] } })
  const md = buildPayload({ msgtype: 'markdown', content: '# Title' })
  assert.deepEqual(md, { msgtype: 'markdown', markdown: { content: '# Title' } })
  assert.throws(() => buildPayload({ msgtype: 'text', content: 'x'.repeat(2049) }), (e) => e.code === 'content-too-long')
  assert.throws(() => buildPayload({ msgtype: 'markdown', content: 'x'.repeat(4097) }), (e) => e.code === 'content-too-long')
  assert.throws(() => buildPayload({ msgtype: 'text', content: '' }), (e) => e.code === 'bad-request')
})

test('push without a key fails cleanly', async () => {
  const tool = buildToolDefinitions(coreWith())[0]
  await assert.rejects(
    () => tool.execute({ action: 'push', channel: 'alerts', msgtype: 'text', content: 'hi' }),
    (e) => e.code === 'no-key' && /alerts/.test(e.message),
  )
})

test('save_channel rejects a missing purpose', async () => {
  const tool = buildToolDefinitions(coreWith())[0]
  await assert.rejects(
    () => tool.execute({ action: 'save_channel', id: 'x' }),
    (e) => e.code === 'bad-request' && /purpose/.test(e.message),
  )
})

test('push POSTs the payload to the webhook URL built from the key', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, status: 200, text: async () => JSON.stringify({ errcode: 0, errmsg: 'ok' }) }
  }
  try {
    const core = coreWith()
    const r = await core.push('build', { msgtype: 'text', text: { content: 'hi' } })
    assert.equal(r.errcode, 0)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=build-key-1')
    assert.equal(calls[0].opts.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].opts.body), { msgtype: 'text', text: { content: 'hi' } })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('push surfaces WeChat Work errcode errors', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ errcode: 93000, errmsg: 'invalid webhook url' }) })
  try {
    await assert.rejects(
      () => coreWith().push('build', { msgtype: 'text', text: { content: 'hi' } }),
      (e) => e.code === 'wecom-error' && /93000/.test(e.message),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
