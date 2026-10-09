// Loopback bridge so the Python agent can ask the language servers this
// process already owns. The socket binds 127.0.0.1 only. The token is minted
// per desktop launch and handed to local backend children through the
// environment. Nothing here starts a language server: a server that is not
// already `ready` answers `unavailable`.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import type { LspStatusQuery, LspSyncResult } from './contract'
import { languageIdForPath } from './lsp/catalog'
import { pathToFileUri, type LspManager } from './lsp/manager'

const MAX_BODY = 256 * 1024
const MAX_FILE_CHARS = 2_000_000
const DIAGNOSTIC_WAIT_MS = 1500
const POSITION_ACTIONS = new Set(['definition', 'references', 'hover'])
const METHODS: Record<string, string> = {
  definition: 'textDocument/definition',
  references: 'textDocument/references',
  hover: 'textDocument/hover',
  documentSymbol: 'textDocument/documentSymbol',
  diagnostics: 'diagnostics'
}
export interface CodeQuery {
  action?: string
  path?: string
  line?: number
  character?: number
  workspaceRoot?: string
}

export interface CodeQueryResult {
  status: 'ok' | 'unavailable'
  reason?: string
  result?: unknown
  diagnostics?: unknown[]
}

export interface IdeBridgeEndpoint {
  host: '127.0.0.1'
  port: number
  token: string
  close: () => Promise<void>
}

interface QueryIo {
  readFile: (filePath: string) => string
}

let active: IdeBridgeEndpoint | null = null
let pending: Promise<IdeBridgeEndpoint> | null = null

export function ideBridgeChildEnv(): Record<string, string> {
  if (!active) {
    return {}
  }

  return {
    HERMES_IDE_BRIDGE_HOST: active.host,
    HERMES_IDE_BRIDGE_PORT: String(active.port),
    HERMES_IDE_BRIDGE_TOKEN: active.token
  }
}

export function startIdeBridge(lsp: LspManager): Promise<IdeBridgeEndpoint> {
  if (active) {
    return Promise.resolve(active)
  }

  if (pending) {
    return pending
  }

  const token = randomBytes(32).toString('hex')
  const server = http.createServer((req, res) => {
    void handleHttp(req, res, lsp, token)
  })

  pending = new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        reject(new Error('bridge-bind-failed'))

        return
      }

      const endpoint: IdeBridgeEndpoint = {
        host: '127.0.0.1',
        port: address.port,
        token,
        close: () =>
          new Promise(done => {
            server.close(() => done())
          })
      }

      active = endpoint
      resolve(endpoint)
    })
  })

  return pending.finally(() => {
    pending = null
  })
}

export async function stopIdeBridge(): Promise<void> {
  if (pending) {
    await pending.catch(() => undefined)
  }

  const current = active

  active = null

  if (current) {
    await current.close()
  }
}

export function bridgeRequestAllowed(remoteAddress: string | undefined, authorization: string | undefined, token: string): boolean {
  if (!isLoopback(remoteAddress) || !token) {
    return false
  }

  const presented = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  const given = Buffer.from(presented)
  const expected = Buffer.from(token)

  if (given.length !== expected.length || given.length === 0) {
    return false
  }

  return timingSafeEqual(given, expected)
}

export async function queryCodeIntelligence(lsp: LspManager, raw: CodeQuery, io: QueryIo = defaultIo): Promise<CodeQueryResult> {
  const parsed = parseQuery(raw)

  if (parsed.ok === false) {
    return unavailable(parsed.reason)
  }

  const language = languageIdForPath(parsed.path)

  if (!language) {
    return unavailable('unsupported-language')
  }

  const workspaceRoot = selectWorkspace(lsp, language, parsed.path, parsed.workspaceRoot)

  if (!workspaceRoot) {
    const reason = lsp.status({ language }).languages[0]?.reason || 'not-ready'

    return unavailable(reason)
  }

  const uri = pathToFileUri(parsed.path)
  const opened = ensureOpen(lsp, language, workspaceRoot, uri, parsed.path, io)

  if (opened.ok === false) {
    return unavailable(opened.reason)
  }

  if (parsed.action === 'diagnostics') {
    return { status: 'ok', diagnostics: await lsp.waitForDiagnostics(language, workspaceRoot, uri, DIAGNOSTIC_WAIT_MS) }
  }

  const message = await lsp.request({
    language,
    workspaceRoot,
    method: METHODS[parsed.action] || '',
    params: requestParams(parsed.action, uri, parsed.line, parsed.character)
  })

  if (!message.ok) {
    return unavailable(message.reason || 'request-failed')
  }

  return { status: 'ok', result: message.result }
}

function selectWorkspace(lsp: LspManager, language: string, filePath: string, requested?: string): string | null {
  if (requested) {
    const row = lsp.status({ language, workspaceRoot: requested } satisfies LspStatusQuery).languages[0]

    if (row?.status === 'ready') {
      return path.resolve(requested)
    }
  }

  return lsp.readyWorkspaceFor(language, filePath)
}

function ensureOpen(
  lsp: LspManager,
  language: string,
  workspaceRoot: string,
  uri: string,
  filePath: string,
  io: QueryIo
): { ok: true } | { ok: false; reason: string } {
  if (lsp.tracksDocument(language, workspaceRoot, uri)) {
    return { ok: true }
  }

  let text: string

  try {
    text = io.readFile(filePath)
  } catch {
    return { ok: false, reason: 'file-unreadable' }
  }

  if (text.length > MAX_FILE_CHARS) {
    return { ok: false, reason: 'file-too-large' }
  }

  const opened: LspSyncResult = lsp.didOpen({
    language,
    workspaceRoot,
    uri,
    languageId: language,
    version: 1,
    text
  })

  return opened.ok ? { ok: true } : { ok: false, reason: opened.reason || 'not-ready' }
}

function parseQuery(raw: CodeQuery): { ok: true; action: string; path: string; line: number; character: number; workspaceRoot?: string } | { ok: false; reason: string } {
  const action = typeof raw.action === 'string' ? raw.action : ''

  if (!METHODS[action]) {
    return { ok: false, reason: 'bad-action' }
  }

  const filePath = typeof raw.path === 'string' ? raw.path.trim() : ''

  if (!filePath) {
    return { ok: false, reason: 'path-required' }
  }

  const needsPosition = POSITION_ACTIONS.has(action)
  const line = raw.line
  const character = raw.character ?? 1

  if (needsPosition && (!Number.isInteger(line) || (line as number) < 1 || !Number.isInteger(character) || character < 1)) {
    return { ok: false, reason: 'bad-position' }
  }

  return {
    ok: true,
    action,
    path: path.resolve(filePath),
    line: Number.isInteger(line) ? (line as number) : 1,
    character,
    ...(typeof raw.workspaceRoot === 'string' && raw.workspaceRoot.trim() ? { workspaceRoot: raw.workspaceRoot.trim() } : {})
  }
}

function requestParams(action: string, uri: string, line: number, character: number): unknown {
  if (action === 'documentSymbol') {
    return { textDocument: { uri } }
  }

  const position = { line: line - 1, character: character - 1 }
  const textDocument = { uri }

  if (action === 'references') {
    return { textDocument, position, context: { includeDeclaration: true } }
  }

  return { textDocument, position }
}

function unavailable(reason: string): CodeQueryResult {
  return { status: 'unavailable', reason }
}

async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse, lsp: LspManager, token: string): Promise<void> {
  if (!bridgeRequestAllowed(req.socket.remoteAddress, req.headers.authorization, token)) {
    sendJson(res, 401, unavailable('unauthorized'))

    return
  }

  if (req.method !== 'POST' || req.url !== '/ide/query') {
    sendJson(res, 404, unavailable('not-found'))

    return
  }

  const body = await readBody(req)

  if (body.ok === false) {
    sendJson(res, 400, unavailable(body.reason))

    return
  }

  sendJson(res, 200, await queryCodeIntelligence(lsp, body.query))
}

function readBody(req: http.IncomingMessage): Promise<{ ok: true; query: CodeQuery } | { ok: false; reason: string }> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []
    let size = 0

    req.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size <= MAX_BODY) {
        chunks.push(chunk)
      }
    })
    req.on('end', () => {
      if (size > MAX_BODY) {
        resolve({ ok: false, reason: 'body-too-large' })

        return
      }

      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as CodeQuery

        resolve(parsed && typeof parsed === 'object' ? { ok: true, query: parsed } : { ok: false, reason: 'bad-request' })
      } catch {
        resolve({ ok: false, reason: 'bad-request' })
      }
    })
    req.on('error', () => resolve({ ok: false, reason: 'bad-request' }))
  })
}

function sendJson(res: http.ServerResponse, statusCode: number, body: CodeQueryResult): void {
  const payload = JSON.stringify(body)

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  })
  res.end(payload)
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

const defaultIo: QueryIo = {
  readFile: filePath => fs.readFileSync(filePath, 'utf8')
}
