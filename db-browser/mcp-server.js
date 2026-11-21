#!/usr/bin/env node
// Passwords come from the environment: passwords[id] names the variable, otherwise DBB_PASSWORD_<ID>.
import { createInterface } from 'node:readline'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { DbCore, buildToolDefinitions } from './index.js'

function defaultConfigFile() {
  const home = process.env.DSH_HOME
    ? (isAbsolute(process.env.DSH_HOME) ? process.env.DSH_HOME : resolve(homedir(), process.env.DSH_HOME))
    : resolve(homedir(), '.dsh')
  return resolve(home, 'plugins', 'db-browser', 'connections.json')
}

const CONFIG_FILE = process.env.DBB_CONNECTIONS_FILE ?? defaultConfigFile()

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    console.error(`[db-browser-mcp] no connections file at ${CONFIG_FILE}; set DBB_CONNECTIONS_FILE`)
    return { connections: [] }
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch (error) {
    console.error(`[db-browser-mcp] invalid JSON in ${CONFIG_FILE}: ${error.message}`)
    process.exit(1)
  }
}

const fileConfig = loadConfig()
const passwordEnvMap = fileConfig.passwords ?? {}

const envCredentials = {
  async readRecord(key) {
    const id = String(key).split('/').slice(1).join('/')
    const envName = passwordEnvMap[id] ?? `DBB_PASSWORD_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    const value = process.env[envName]
    return value ? { payload: { password: value } } : undefined
  },
}

const ctx = { get: (name) => (name === 'credentials' ? envCredentials : undefined) }
const core = new DbCore(ctx, fileConfig)
const tools = buildToolDefinitions(core)
const byName = new Map(tools.map((t) => [t.name, t]))

// MCP starts a connection on first use. The panel's manual-start rule does not apply here.
async function ensureStarted(args) {
  const id = args?.connection
  if (typeof id === 'string' && id && !['list_connections', 'connect', 'disconnect'].includes(args?.action)) {
    if (core.statusOf(id) !== 'open') await core.startConnection(id)
  }
}

function result(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

const handlers = {
  initialize: (params) => ({
    protocolVersion: params?.protocolVersion ?? '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'db-browser', version: '1.0.0' },
  }),
  ping: () => ({}),
  'tools/list': () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    })),
  }),
  'tools/call': async (params) => {
    const tool = byName.get(params?.name)
    if (!tool) throw rpcError(-32602, `unknown tool ${params?.name}`)
    const args = params.arguments ?? {}
    try {
      await ensureStarted(args)
      return result(await tool.execute(args))
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error?.message ?? error}` }], isError: true }
    }
  },
}

function rpcError(code, message) {
  const e = new Error(message)
  e.rpcCode = code
  return e
}

const rl = createInterface({ input: process.stdin, terminal: false })
rl.on('line', async (line) => {
  const text = line.trim()
  if (!text) return
  let msg
  try {
    msg = JSON.parse(text)
  } catch {
    return
  }
  // Notifications carry no id and get no response.
  if (msg.id === undefined || msg.id === null) return
  const reply = { jsonrpc: '2.0', id: msg.id }
  try {
    const handler = handlers[msg.method]
    if (!handler) throw rpcError(-32601, `method not found: ${msg.method}`)
    reply.result = await handler(msg.params)
  } catch (error) {
    reply.error = { code: error.rpcCode ?? -32603, message: String(error?.message ?? error) }
  }
  process.stdout.write(JSON.stringify(reply) + '\n')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    const sessions = core.sessions
    core.sessions = new Map()
    for (const s of sessions.values()) s.handle.close().catch(() => {})
    process.exit(0)
  })
}
