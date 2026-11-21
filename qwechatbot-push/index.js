import { existsSync, readFileSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import Schema from '@deepseek-ai/schemastery'

export const name = 'qwechatbot-push'

const ROUTE_PREFIX = '/qwechatbot-push'
const PLUGIN_ID = 'qwechatbot-push'
const DEFAULT_WEBHOOK_BASE = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key='
const DEFAULT_TIMEOUT_MS = 10000
const TEXT_LIMIT_BYTES = 2048
const MARKDOWN_LIMIT_BYTES = 4096
const ID_PATTERN = /^[\w.-]{1,64}$/

/** Root for user-owned data. DSH sets DSH_HOME on every platform. */
export function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim()) {
    const value = configured.trim()
    return path.isAbsolute(value) ? path.resolve(value) : path.resolve(homedir(), value)
  }
  return path.join(homedir(), '.dsh')
}

/** Per-plugin data directory: $DSH_HOME/plugins/<loader-id>. */
export function pluginDataDir() {
  return path.join(dshHome(), 'plugins', PLUGIN_ID)
}

export function channelsPath() {
  return path.join(pluginDataDir(), 'channels.json')
}

// Cordis validates this before apply. Defaults keep an older profile working when a field is omitted.
export const Config = Schema.object({
  webhookBase: Schema.string().default(DEFAULT_WEBHOOK_BASE),
  timeoutMs: Schema.number().min(1000).max(60000).default(DEFAULT_TIMEOUT_MS),
})

class QwechatbotError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const fail = (code, message) => {
  throw new QwechatbotError(code, message)
}

// A channel is { id, purpose, key }. The webhook key is low-risk and stored in plaintext locally.
function normalizeChannel(raw) {
  if (!raw || typeof raw !== 'object') fail('bad-request', 'channel must be an object')
  const id = typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id.trim() : null
  if (!id) fail('bad-request', 'channel.id must be 1-64 chars of [A-Za-z0-9_.-]')
  const purpose = typeof raw.purpose === 'string' ? raw.purpose.trim() : ''
  if (purpose === '') fail('bad-request', 'channel.purpose is required (what is this channel for?)')
  const key = typeof raw.key === 'string' ? raw.key.trim() : ''
  return { id, purpose, key }
}

// Build the WeChat Work webhook request body for text or markdown.
export function buildPayload(args) {
  const msgtype = args?.msgtype === 'markdown' ? 'markdown' : 'text'
  const content = args?.content
  if (typeof content !== 'string' || content === '') fail('bad-request', 'content must be a non-empty string')
  const maxBytes = msgtype === 'text' ? TEXT_LIMIT_BYTES : MARKDOWN_LIMIT_BYTES
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > maxBytes) fail('content-too-long', `${msgtype} content is ${bytes} bytes (UTF-8), over the ${maxBytes} byte limit`)
  if (msgtype === 'text') {
    const text = { content }
    if (Array.isArray(args?.mentioned_list) && args.mentioned_list.length) text.mentioned_list = args.mentioned_list.map(String).slice(0, 100)
    if (Array.isArray(args?.mentioned_mobile_list) && args.mentioned_mobile_list.length) text.mentioned_mobile_list = args.mentioned_mobile_list.map(String).slice(0, 100)
    return { msgtype: 'text', text }
  }
  return { msgtype: 'markdown', markdown: { content } }
}

async function postWebhook(url, payload, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') fail('timeout', `Push timed out after ${timeoutMs}ms`)
      fail('network-error', `Push request failed: ${error?.message ?? error}`)
    }
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = null }
    if (!res.ok) fail('http-error', `WeChat Work webhook returned HTTP ${res.status}: ${text.slice(0, 200)}`)
    if (!data || typeof data !== 'object' || typeof data.errcode !== 'number') fail('bad-response', `Unexpected webhook response: ${text.slice(0, 200)}`)
    if (data.errcode !== 0) fail('wecom-error', `WeChat Work error ${data.errcode}: ${data.errmsg ?? 'unknown'}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

export class QwechatbotCore {
  constructor(ctx, config = {}, options = {}) {
    this.ctx = ctx
    this.closed = false
    this.webhookBase = typeof config?.webhookBase === 'string' && config.webhookBase.trim() !== ''
      ? config.webhookBase.trim()
      : DEFAULT_WEBHOOK_BASE
    this.timeoutMs = Number.isInteger(config?.timeoutMs) && config.timeoutMs >= 1000 ? config.timeoutMs : DEFAULT_TIMEOUT_MS
    this.channels = new Map()
    this.channelsFile = typeof options?.channelsFile === 'string' && options.channelsFile !== '' ? options.channelsFile : null
    this.writeChain = Promise.resolve()
    let rows = Array.isArray(config?.channels) ? config.channels : []
    if (this.channelsFile && existsSync(this.channelsFile)) {
      let parsed
      try {
        parsed = JSON.parse(readFileSync(this.channelsFile, 'utf8'))
      } catch {
        fail('bad-config', 'channels file is not valid JSON')
      }
      const fromFile = Array.isArray(parsed) ? parsed : parsed?.channels
      if (!Array.isArray(fromFile)) fail('bad-config', 'channels file must contain a channels array')
      rows = fromFile
    }
    for (const raw of rows) {
      const c = normalizeChannel(raw)
      this.channels.set(c.id, c)
    }
  }

  enqueueWrite(fn) {
    const run = this.writeChain.then(fn, fn)
    this.writeChain = run.catch(() => {})
    return run
  }

  async persistChannels(list) {
    if (!this.channelsFile) fail('no-config-file', 'The channel store is unavailable in this profile')
    await fsp.mkdir(path.dirname(this.channelsFile), { recursive: true, mode: 0o700 })
    const tmp = `${this.channelsFile}.tmp`
    await fsp.writeFile(tmp, `${JSON.stringify({ channels: list }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fsp.rename(tmp, this.channelsFile)
  }

  list() {
    return [...this.channels.values()].map((c) => ({ id: c.id, purpose: c.purpose, key: c.key }))
  }

  get(id) {
    const c = this.channels.get(id)
    if (!c) fail('unknown-channel', `No channel named "${id}". Known: ${[...this.channels.keys()].join(', ') || '(none)'}`)
    return c
  }

  async saveChannel(raw) {
    const next = normalizeChannel(raw)
    await this.enqueueWrite(async () => {
      const list = [...this.channels.values()].filter((c) => c.id !== next.id).concat(next)
      await this.persistChannels(list)
      this.channels.set(next.id, next)
    })
    return { saved: next.id }
  }

  async removeChannel(id) {
    const current = this.get(id)
    await this.enqueueWrite(async () => {
      await this.persistChannels([...this.channels.values()].filter((c) => c.id !== id))
      this.channels.delete(id)
    })
    return { removed: current.id }
  }

  async push(id, payload) {
    const c = this.get(id)
    if (!c.key) fail('no-key', `Channel "${c.id}" has no push key. Save one with save_channel or the panel.`)
    const url = this.webhookBase + encodeURIComponent(c.key)
    return postWebhook(url, payload, this.timeoutMs)
  }
}

export function buildToolDefinitions(core) {
  return [pushToolDefinition(core)]
}

function pushToolDefinition(core) {
  return {
    name: 'qwechatbot_push',
    description: [
      'Manage local WeChat Work (企业微信) group-bot push channels and send messages through them.',
      'Each channel holds an id, a purpose, and a webhook key, all stored in plaintext in the local channel file.',
      'Actions: list_channels (no other params) — list channels with id, purpose, and key;',
      'save_channel (id, purpose, key) — create or replace a channel; remove_channel (id) — delete a channel;',
      'push (channel, msgtype, content, optional mentioned_list, optional mentioned_mobile_list) — send a text or markdown message',
      'to the channel group. Use list_channels first to pick a channel by its purpose.',
      'text content is limited to 2048 bytes UTF-8; markdown to 4096 bytes. mentioned_list/mentioned_mobile_list only apply to text.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list_channels', 'save_channel', 'remove_channel', 'push'], description: 'Operation to run.' },
        id: { type: 'string', description: 'Channel id for save_channel and remove_channel.' },
        purpose: { type: 'string', description: 'Human-readable purpose of the channel for save_channel (what it is for).' },
        key: { type: 'string', description: 'Webhook key for save_channel, the segment after ?key= in the bot webhook URL. Stored in plaintext locally.' },
        channel: { type: 'string', description: 'Channel id to push to.' },
        msgtype: { type: 'string', enum: ['text', 'markdown'], description: 'Message type for push. text mentions members via mentioned_list/mobile; markdown renders Markdown.' },
        content: { type: 'string', description: 'Message content. text ≤ 2048 bytes UTF-8; markdown ≤ 4096 bytes UTF-8.' },
        mentioned_list: { type: 'array', items: { type: 'string' }, description: 'Userids to @ for a text message.' },
        mentioned_mobile_list: { type: 'array', items: { type: 'string' }, description: 'Mobile numbers to @ for a text message.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: jsonRender },
    isConcurrencySafe: () => true,
    async execute(args) {
      const action = args?.action
      if (action === 'list_channels') {
        return { channels: core.list(), webhookBase: core.webhookBase, timeoutMs: core.timeoutMs }
      }
      if (action === 'save_channel') return saveChannelFromAgent(core, args)
      if (action === 'remove_channel') {
        const id = args?.id
        if (typeof id !== 'string' || id === '') fail('bad-request', 'id is required')
        return core.removeChannel(id)
      }
      if (action === 'push') {
        const id = args?.channel
        if (typeof id !== 'string' || id === '') fail('bad-request', 'channel is required')
        return core.push(id, buildPayload(args))
      }
      fail('bad-request', `Unknown action "${action}"`)
    },
  }
}

async function saveChannelFromAgent(core, args) {
  const next = normalizeChannel({ id: args?.id, purpose: args?.purpose, key: args?.key })
  await core.saveChannel(next)
  return { saved: next.id, key: next.key }
}

function jsonRender(_args, value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req, cap = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > cap) { reject(new QwechatbotError('payload-too-large', 'request body is too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function registerHttp(ctx, core) {
  const webServer = ctx.get('webServer')
  const connection = ctx.get('connection')
  const rejected = (req, res) => {
    if (!connection?.requestRejection) {
      // No connection service means we cannot authenticate. Fail closed.
      res.statusCode = 403
      res.end()
      return true
    }
    const status = connection.requestRejection(req)
    if (status === undefined) return false
    res.statusCode = status
    res.end()
    return true
  }
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      const reply = (status, body) => {
        try {
          sendJson(res, status, body)
        } catch {
          try { req.destroy() } catch { /* response already unusable */ }
        }
      }
      try {
        if (rejected(req, res)) return
        const pathname = new URL(String(req.url), 'http://localhost').pathname
        const op = pathname === ROUTE_PREFIX ? '' : pathname.slice(ROUTE_PREFIX.length + 1).replace(/^\/+|\/+$/g, '')
        if (op === 'channels' && req.method === 'GET') {
          reply(200, { ok: true, value: { channels: core.list(), webhookBase: core.webhookBase, timeoutMs: core.timeoutMs } })
          return
        }
        if (req.method !== 'POST') { reply(405, { ok: false, error: { code: 'method-not-allowed', message: 'POST required' } }); return }
        const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
        if (essence !== 'application/json') { reply(415, { ok: false, error: { code: 'unsupported-media-type', message: 'content-type must be application/json' } }); return }
        let payload
        try {
          payload = JSON.parse(await readBody(req))
        } catch (error) {
          reply(error?.code === 'payload-too-large' ? 413 : 400, { ok: false, error: { code: error?.code ?? 'bad-request', message: 'request body must be JSON' } })
          return
        }
        const value = await dispatchPanelOp(core, op, payload)
        reply(200, { ok: true, value })
      } catch (error) {
        const code = error instanceof QwechatbotError ? error.code : 'internal'
        reply(code === 'internal' ? 500 : 400, { ok: false, error: { code, message: String(error?.message ?? error) } })
      }
    },
  }), 'qwechatbot-push: http routes')
}

async function dispatchPanelOp(core, op, p) {
  switch (op) {
    case 'save-channel': {
      const next = normalizeChannel(p?.channel)
      await core.saveChannel(next)
      return { saved: next.id, key: next.key }
    }
    case 'remove-channel': {
      const id = p?.id
      if (typeof id !== 'string' || id === '') fail('bad-request', 'id is required')
      return core.removeChannel(id)
    }
    case 'test-push': {
      const id = p?.id
      if (typeof id !== 'string' || id === '') fail('bad-request', 'id is required')
      const payload = buildPayload({
        msgtype: p?.msgtype,
        content: p?.content,
        mentioned_list: p?.mentionedList,
        mentioned_mobile_list: p?.mentionedMobileList,
      })
      return core.push(id, payload)
    }
    default: fail('bad-request', `Unknown op ${op}`)
  }
}

function registerTools(ctx, core) {
  const tools = ctx.get('tools')
  for (const definition of buildToolDefinitions(core)) {
    ctx.effect(() => tools.register(definition), `qwechatbot-push: ${definition.name} tool`)
  }
}

export function apply(ctx, config) {
  const resolved = Config(config ?? {})
  const core = new QwechatbotCore(ctx, resolved, { channelsFile: channelsPath() })
  // Cold boot has no start order. ctx.get here can miss webServer/tools and leave routes unregistered.
  ctx.inject(['webServer', 'connection'], (injected) => registerHttp(injected, core))
  ctx.inject(['tools'], (injected) => registerTools(injected, core))
  ctx.effect(() => () => { core.closed = true }, 'qwechatbot-push: close')
}
