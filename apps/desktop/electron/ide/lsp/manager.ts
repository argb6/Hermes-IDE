// One language-server process per server id per workspace root. JavaScript and
// TypeScript share typescript-language-server. Download and launch failures
// resolve as status `unavailable` — the editor keeps working without them.
// A crash after the server was ready restarts with backoff until the limit.

import path from 'node:path'

import type {
  IdeRuntimeStatus,
  LspDiagnosticEvent,
  LspDidChangeRequest,
  LspDidCloseRequest,
  LspDidOpenRequest,
  LspLanguageStatus,
  LspRequest,
  LspRequestResult,
  LspStartRequest,
  LspStartResult,
  LspStatusQuery,
  LspStatusResult,
  LspStopRequest,
  LspSyncResult
} from '../contract'
import { isInsideDir, resolveRuntimeDir } from '../paths'
import { electronNodeEnv, spawnStdio, type SpawnRequest } from '../spawn'
import { answerServerRequest, StdioRpc, type StdioPeer } from '../stdio-rpc'
import { PYRIGHT_VERSION, serverIdForLanguage, TYPESCRIPT_LANGUAGE_SERVER_VERSION, type LspServerId } from './catalog'
import { prepareLanguageServer, type PreparedLanguageServer } from './install'

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000]
const MAX_RESTARTS = 5

export interface LspManagerDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  installRoots: string[]
  nodeExecPath: string
  pythonPath?: string | null | (() => string | null)
  spawn?: (request: SpawnRequest) => StdioPeer
  prepare?: typeof prepareLanguageServer
  schedule?: (fn: () => void, ms: number) => { cancel: () => void }
  onDiagnostics?: (event: LspDiagnosticEvent) => void
  log?: (message: string) => void
}

interface Session {
  key: string
  serverId: LspServerId
  workspaceRoot: string
  status: IdeRuntimeStatus
  reason?: string
  restarts: number
  stopped: boolean
  generation: number
  rpc?: StdioRpc
  timer?: { cancel: () => void }
  documents: Map<string, string>
  diagnostics: Map<string, unknown[]>
  diagnosticWaiters: Map<string, Array<(diagnostics: unknown[]) => void>>
  start?: Promise<LspStartResult>
}

export class LspManager {
  private readonly sessions = new Map<string, Session>()
  private readonly spawn: (request: SpawnRequest) => StdioPeer
  private readonly prepare: typeof prepareLanguageServer
  private readonly schedule: (fn: () => void, ms: number) => { cancel: () => void }
  private disposed = false

  constructor(private readonly deps: LspManagerDeps) {
    this.spawn = deps.spawn ?? spawnStdio
    this.prepare = deps.prepare ?? prepareLanguageServer
    this.schedule = deps.schedule ?? ((fn, ms) => {
      const timer = setTimeout(fn, ms)

      return { cancel: () => clearTimeout(timer) }
    })
  }

  async start(request: LspStartRequest): Promise<LspStartResult> {
    try {
      return await this.startInner(request)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'start-failed'

      this.deps.log?.(`[ide:lsp] start failed: ${reason}`)

      return { ok: false, status: 'unavailable', reason, language: request?.language || '' }
    }
  }

  async stop(request: LspStopRequest = {}): Promise<{ ok: boolean }> {
    for (const session of [...this.sessions.values()]) {
      const languageMatch = !request.language || serverIdForLanguage(request.language) === session.serverId
      const rootMatch = !request.workspaceRoot || path.resolve(request.workspaceRoot) === session.workspaceRoot

      if (languageMatch && rootMatch) {
        this.stopSession(session)
      }
    }

    return { ok: true }
  }

  didOpen(request: LspDidOpenRequest): LspSyncResult {
    const session = this.sessionFor(request.language, request.workspaceRoot)

    if (!session || session.status !== 'ready' || !session.rpc) {
      return this.notReady(session)
    }

    session.documents.set(request.uri, request.languageId)
    session.rpc.notify('textDocument/didOpen', {
      textDocument: { uri: request.uri, languageId: request.languageId, version: request.version, text: request.text }
    })

    return { ok: true }
  }

  didChange(request: LspDidChangeRequest): LspSyncResult {
    const session = this.sessionFor(request.language, request.workspaceRoot)

    if (!session || session.status !== 'ready' || !session.rpc) {
      return this.notReady(session)
    }

    session.rpc.notify('textDocument/didChange', {
      textDocument: { uri: request.uri, version: request.version },
      contentChanges: request.contentChanges
    })

    return { ok: true }
  }

  didClose(request: LspDidCloseRequest): LspSyncResult {
    const session = this.sessionFor(request.language, request.workspaceRoot)

    if (!session || session.status !== 'ready' || !session.rpc) {
      return this.notReady(session)
    }

    session.documents.delete(request.uri)
    session.rpc.notify('textDocument/didClose', { textDocument: { uri: request.uri } })

    return { ok: true }
  }

  async request(request: LspRequest): Promise<LspRequestResult> {
    if (!isForwardableMethod(request.method)) {
      return { ok: false, status: 'unavailable', reason: 'method-rejected' }
    }

    const session = this.sessionFor(request.language, request.workspaceRoot)

    if (!session || session.status !== 'ready' || !session.rpc) {
      return { ok: false, status: session?.status ?? 'unavailable', reason: session?.reason ?? 'not-ready' }
    }

    try {
      const message = await session.rpc.request(request.method, request.params ?? {})

      if (message.error) {
        return { ok: false, status: 'ready', reason: message.error.message || 'request-failed' }
      }

      return { ok: true, result: message.result }
    } catch (error) {
      return { ok: false, status: session.status, reason: error instanceof Error ? error.message : 'request-failed' }
    }
  }

  status(query: LspStatusQuery = {}): LspStatusResult {
    const languages = query.language ? [query.language] : ['python', 'typescript', 'javascript']

    return {
      languages: languages.map(language => this.languageStatus(language, query.workspaceRoot))
    }
  }

  dispose(): void {
    this.disposed = true

    for (const session of this.sessions.values()) {
      this.stopSession(session)
    }
  }

  private async startInner(request: LspStartRequest): Promise<LspStartResult> {
    const serverId = serverIdForLanguage(request.language)

    if (!serverId) {
      return { ok: false, status: 'unavailable', reason: 'unsupported-language', language: request.language }
    }

    const trimmedRoot = (request.workspaceRoot || '').trim()

    if (!trimmedRoot) {
      return { ok: false, status: 'unavailable', reason: 'workspace-required', language: request.language }
    }

    const workspaceRoot = path.resolve(trimmedRoot)

    const key = `${serverId}\0${workspaceRoot}`
    const existing = this.sessions.get(key)

    if (existing?.status === 'ready') {
      return { ok: true, status: 'ready', language: request.language, workspaceRoot }
    }

    if (existing?.start) {
      return existing.start
    }

    const session = existing ?? this.createSession(key, serverId, workspaceRoot)

    session.stopped = false
    session.restarts = 0
    session.start = this.launch(session, request.language).finally(() => {
      session.start = undefined
    })

    return session.start
  }

  private createSession(key: string, serverId: LspServerId, workspaceRoot: string): Session {
    const session: Session = {
      key,
      serverId,
      workspaceRoot,
      status: 'unavailable',
      restarts: 0,
      stopped: false,
      generation: 0,
      documents: new Map(),
      diagnostics: new Map(),
      diagnosticWaiters: new Map()
    }

    this.sessions.set(key, session)

    return session
  }

  private async launch(session: Session, language: string): Promise<LspStartResult> {
    if (this.disposed || session.stopped) {
      return { ok: false, status: 'unavailable', reason: 'stopped', language, workspaceRoot: session.workspaceRoot }
    }

    const located = resolveRuntimeDir({
      platform: this.deps.platform,
      env: this.deps.env,
      home: this.deps.home,
      kind: 'lsp',
      name: session.serverId,
      version: versionOf(session.serverId),
      installRoots: this.deps.installRoots
    })

    if (located.ok === false) {
      session.status = 'unavailable'
      session.reason = located.reason

      return { ok: false, status: 'unavailable', reason: located.reason, language, workspaceRoot: session.workspaceRoot }
    }

    session.status = 'downloading'
    session.reason = undefined
    const prepared = await this.prepare(session.serverId, located.dir)

    if (prepared.ok === false) {
      session.status = 'unavailable'
      session.reason = prepared.reason
      this.deps.log?.(`[ide:lsp] ${session.serverId} unavailable: ${prepared.reason}`)

      return { ok: false, status: 'unavailable', reason: prepared.reason, language, workspaceRoot: session.workspaceRoot }
    }

    return this.boot(session, language, prepared.prepared)
  }

  private async boot(session: Session, language: string, prepared: PreparedLanguageServer): Promise<LspStartResult> {
    const generation = session.generation + 1

    session.generation = generation
    const peer = this.spawn({
      command: this.deps.nodeExecPath,
      args: [prepared.script, ...prepared.args],
      cwd: session.workspaceRoot,
      env: electronNodeEnv(this.deps.env)
    })
    const rpc = new StdioRpc(peer, answerServerRequest)

    session.rpc = rpc
    rpc.onNotification((method, params) => this.onNotification(session, method, params))
    peer.onExit(code => this.onExit(session, generation, code))

    try {
      const message = await rpc.request(
        'initialize',
        initializeParams(session, currentPython(this.deps.pythonPath), prepared.tsserverPath),
        20_000
      )

      if (message.error || session.generation !== generation) {
        session.status = 'unavailable'
        session.reason = message.error?.message || 'initialize-failed'
        rpc.dispose()

        return {
          ok: false,
          status: 'unavailable',
          reason: session.reason,
          language,
          workspaceRoot: session.workspaceRoot
        }
      }

      rpc.notify('initialized', {})
      session.status = 'ready'
      session.reason = undefined

      return { ok: true, status: 'ready', language, workspaceRoot: session.workspaceRoot }
    } catch (error) {
      session.status = 'unavailable'
      session.reason = error instanceof Error ? error.message : 'initialize-failed'
      rpc.dispose()

      return { ok: false, status: 'unavailable', reason: session.reason, language, workspaceRoot: session.workspaceRoot }
    }
  }

  private onNotification(session: Session, method: string, params: unknown): void {
    if (method !== 'textDocument/publishDiagnostics' || !params || typeof params !== 'object') {
      return
    }

    const body = params as { uri?: string; diagnostics?: unknown[] }
    const uri = body.uri || ''

    const language = session.documents.get(uri) || (session.serverId === 'pyright' ? 'python' : 'typescript')

    const diagnostics = Array.isArray(body.diagnostics) ? body.diagnostics : []

    session.diagnostics.set(uri, diagnostics)
    this.flushDiagnosticWaiters(session, uri, diagnostics)
    this.deps.onDiagnostics?.({
      language,
      workspaceRoot: session.workspaceRoot,
      uri,
      diagnostics
    })
  }

  private onExit(session: Session, generation: number, code: number | null): void {
    if (session.generation !== generation || session.stopped || this.disposed) {
      return
    }

    if (session.status !== 'ready') {
      session.status = 'unavailable'
      session.reason = `exited ${code ?? 'unknown'} before ready`

      return
    }

    session.restarts += 1
    session.status = 'crashed'
    session.rpc = undefined

    if (session.restarts > MAX_RESTARTS) {
      session.reason = 'restart-limit'
      this.deps.log?.(`[ide:lsp] ${session.serverId} crashed and will not restart`)

      return
    }

    const delay = BACKOFF_MS[Math.min(session.restarts - 1, BACKOFF_MS.length - 1)]

    const language = session.serverId === 'pyright' ? 'python' : 'typescript'

    session.reason = 'restarting'
    session.timer = this.schedule(() => {
      if (session.stopped || this.disposed) {
        return
      }

      session.start = this.launch(session, language).finally(() => {
        session.start = undefined
      })
      void session.start
    }, delay)
  }

  private stopSession(session: Session): void {
    session.stopped = true
    session.timer?.cancel()
    session.generation += 1
    session.rpc?.dispose()
    session.rpc = undefined
    this.failDiagnosticWaiters(session)
    session.status = 'unavailable'
    session.reason = 'stopped'
    this.sessions.delete(session.key)
  }

  private sessionFor(language: string, workspaceRoot: string): Session | undefined {
    const serverId = serverIdForLanguage(language)

    if (!serverId) {
      return undefined
    }

    return this.sessions.get(`${serverId}\0${path.resolve(workspaceRoot)}`)
  }

  private languageStatus(language: string, workspaceRoot?: string): LspLanguageStatus {
    const serverId = serverIdForLanguage(language)

    if (!serverId) {
      return { language, status: 'unavailable', reason: 'unsupported-language' }
    }

    const matches = [...this.sessions.values()].filter(session => {
      if (session.serverId !== serverId) {
        return false
      }

      return !workspaceRoot || session.workspaceRoot === path.resolve(workspaceRoot)
    })

    const session = pickStatus(matches)

    if (!session) {
      return { language, status: 'unavailable', reason: 'not-started' }
    }

    return {
      language,
      status: session.status,
      ...(session.reason ? { reason: session.reason } : {}),
      workspaceRoot: session.workspaceRoot
    }
  }

  tracksDocument(language: string, workspaceRoot: string, uri: string): boolean {
    return this.sessionFor(language, workspaceRoot)?.documents.has(uri) === true
  }

  /** Ready server whose workspace already contains `filePath`, nearest root first. */
  readyWorkspaceFor(language: string, filePath: string): string | null {
    const serverId = serverIdForLanguage(language)

    if (!serverId) {
      return null
    }

    const file = path.resolve(filePath)
    const matches = [...this.sessions.values()].filter(
      session =>
        session.serverId === serverId &&
        session.status === 'ready' &&
        isInsideDir(file, session.workspaceRoot, this.deps.platform)
    )

    matches.sort((left, right) => right.workspaceRoot.length - left.workspaceRoot.length)

    return matches[0]?.workspaceRoot ?? null
  }

  waitForDiagnostics(language: string, workspaceRoot: string, uri: string, timeoutMs: number): Promise<unknown[]> {
    const session = this.sessionFor(language, workspaceRoot)
    const cached = session?.diagnostics.get(uri)

    if (cached) {
      return Promise.resolve(cached)
    }

    if (!session) {
      return Promise.resolve([])
    }

    return new Promise(resolve => {
      let settled = false
      const finish = (diagnostics: unknown[]) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timer)
        resolve(diagnostics)
      }
      const timer = setTimeout(() => finish(session.diagnostics.get(uri) ?? []), Math.max(0, timeoutMs))
      const waiters = session.diagnosticWaiters.get(uri) ?? []

      waiters.push(finish)
      session.diagnosticWaiters.set(uri, waiters)
    })
  }

  private flushDiagnosticWaiters(session: Session, uri: string, diagnostics: unknown[]): void {
    const waiters = session.diagnosticWaiters.get(uri) ?? []

    session.diagnosticWaiters.delete(uri)

    for (const waiter of waiters) {
      waiter(diagnostics)
    }
  }

  private failDiagnosticWaiters(session: Session): void {
    for (const [uri, waiters] of [...session.diagnosticWaiters.entries()]) {
      session.diagnosticWaiters.delete(uri)

      for (const waiter of waiters) {
        waiter(session.diagnostics.get(uri) ?? [])
      }
    }
  }

  private notReady(session: Session | undefined): LspSyncResult {
    return { ok: false, status: session?.status ?? 'unavailable', reason: session?.reason ?? 'not-ready' }
  }
}

function currentPython(pythonPath: LspManagerDeps['pythonPath']): string | null {
  if (typeof pythonPath === 'function') {
    return pythonPath()
  }

  return pythonPath ?? null
}

function versionOf(serverId: LspServerId): string {
  return serverId === 'pyright' ? PYRIGHT_VERSION : TYPESCRIPT_LANGUAGE_SERVER_VERSION
}

function pickStatus(sessions: Session[]): Session | undefined {
  const rank: IdeRuntimeStatus[] = ['ready', 'downloading', 'crashed', 'unavailable']

  for (const status of rank) {
    const found = sessions.find(session => session.status === status)

    if (found) {
      return found
    }
  }

  return undefined
}

function isForwardableMethod(method: string): boolean {
  if (method === 'exit' || method === 'shutdown') {
    return false
  }

  return /^[a-zA-Z$][\w./$-]{0,120}$/.test(method)
}

function initializeParams(session: Session, pythonPath: string | null | undefined, tsserverPath?: string): unknown {
  const uri = pathToFileUri(session.workspaceRoot)
  const initializationOptions: Record<string, unknown> = {}

  if (session.serverId === 'pyright' && pythonPath) {
    initializationOptions.python = { pythonPath }
  }

  if (tsserverPath) {
    initializationOptions.tsserver = { path: tsserverPath }
  }

  return {
    processId: process.pid,
    rootUri: uri,
    workspaceFolders: [{ uri, name: path.basename(session.workspaceRoot) }],
    capabilities: {
      textDocument: {
        synchronization: { dynamicRegistration: false },
        completion: { completionItem: { snippetSupport: true } },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { linkSupport: true },
        references: {},
        rename: { prepareSupport: true },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        publishDiagnostics: { relatedInformation: true }
      }
    },
    initializationOptions
  }
}

export function pathToFileUri(filePath: string): string {
  const resolved = path.resolve(filePath)
  const prefix = process.platform === 'win32' ? `file:///${resolved.replace(/\\/g, '/')}` : `file://${resolved}`

  return encodeURI(prefix).replace(/#/g, '%23')
}
