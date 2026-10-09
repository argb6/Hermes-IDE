// Debug adapters: debugpy on the agent interpreter, vscode-js-debug on
// Electron's Node (`ELECTRON_RUN_AS_NODE=1`). A failed download or missing
// interpreter resolves as `unavailable`. Sessions are not restarted after a
// crash — a silent restart would resume a debuggee the user thinks is dead.

import { randomBytes } from 'node:crypto'
import path from 'node:path'

import type { AgentPython } from '../agent-python'
import type {
  DapAdapter,
  DapAdapterStatus,
  DapEventMessage,
  DapLaunchConfig,
  DapSendRequest,
  DapSendResult,
  DapSessionStatus,
  DapStartRequest,
  DapStartResult,
  DapStatusResult,
  DapStopRequest,
  IdeRuntimeStatus
} from '../contract'
import { resolveRuntimeDir } from '../paths'
import { electronNodeEnv, spawnStdio, stringEnv, type SpawnRequest } from '../spawn'
import type { StdioPeer } from '../stdio-rpc'
import { DapConnection } from './connection'
import { DEBUGPY_VERSION, prepareDebugpy, type DebugpyLaunch } from './debugpy'
import { JS_DEBUG_VERSION, prepareJsDebug } from './js-debug'

export interface DapManagerDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  installRoots: string[]
  nodeExecPath: string
  resolvePython: () => AgentPython | null
  spawn?: (request: SpawnRequest) => StdioPeer
  preparePython?: typeof prepareDebugpy
  prepareNode?: typeof prepareJsDebug
  onEvent?: (event: DapEventMessage) => void
  log?: (message: string) => void
}

interface Session {
  id: string
  adapter: DapAdapter
  workspaceRoot: string
  status: IdeRuntimeStatus
  reason?: string
  connection?: DapConnection
}

export class DapManager {
  private readonly sessions = new Map<string, Session>()
  private readonly adapters = new Map<DapAdapter, { status: IdeRuntimeStatus; reason?: string }>()
  private readonly spawn: (request: SpawnRequest) => StdioPeer
  private disposed = false

  constructor(private readonly deps: DapManagerDeps) {
    this.spawn = deps.spawn ?? spawnStdio
    this.adapters.set('python', { status: 'unavailable', reason: 'not-started' })
    this.adapters.set('node', { status: 'unavailable', reason: 'not-started' })
  }

  async start(request: DapStartRequest): Promise<DapStartResult> {
    try {
      return await this.startInner(request)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'start-failed'

      this.deps.log?.(`[ide:dap] start failed: ${reason}`)

      return { ok: false, status: 'unavailable', reason }
    }
  }

  async send(request: DapSendRequest): Promise<DapSendResult> {
    const session = this.sessions.get(request.sessionId)

    if (!session || session.status !== 'ready' || !session.connection) {
      return { ok: false, status: session?.status ?? 'unavailable', reason: session?.reason ?? 'not-ready' }
    }

    if (!/^[A-Za-z][\w/]{0,80}$/.test(request.command || '')) {
      return { ok: false, status: 'unavailable', reason: 'command-rejected' }
    }

    try {
      const response = await session.connection.request(request.command, request.arguments)

      return { ok: true, response }
    } catch (error) {
      return { ok: false, status: session.status, reason: error instanceof Error ? error.message : 'request-failed' }
    }
  }

  async stop(request: DapStopRequest = {}): Promise<{ ok: boolean }> {
    for (const session of [...this.sessions.values()]) {
      const idMatch = !request.sessionId || session.id === request.sessionId
      const rootMatch = !request.workspaceRoot || session.workspaceRoot === path.resolve(request.workspaceRoot)

      if (idMatch && rootMatch) {
        await this.disconnect(session)
      }
    }

    return { ok: true }
  }

  status(): DapStatusResult {
    const adapters: DapAdapterStatus[] = (['python', 'node'] as DapAdapter[]).map(adapter => {
      const row = this.adapters.get(adapter)

      return { adapter, status: row?.status ?? 'unavailable', ...(row?.reason ? { reason: row.reason } : {}) }
    })
    const sessions: DapSessionStatus[] = [...this.sessions.values()].map(session => ({
      sessionId: session.id,
      adapter: session.adapter,
      workspaceRoot: session.workspaceRoot,
      status: session.status,
      ...(session.reason ? { reason: session.reason } : {})
    }))

    return { adapters, sessions }
  }

  dispose(): void {
    this.disposed = true

    for (const session of this.sessions.values()) {
      session.connection?.dispose()
      session.status = 'unavailable'
      session.reason = 'stopped'
    }

    this.sessions.clear()
  }

  private async startInner(request: DapStartRequest): Promise<DapStartResult> {
    if (request.adapter !== 'python' && request.adapter !== 'node') {
      return { ok: false, status: 'unavailable', reason: 'unsupported-adapter' }
    }

    const workspaceRoot = (request.workspaceRoot || '').trim()

    if (!workspaceRoot) {
      return { ok: false, status: 'unavailable', reason: 'workspace-required' }
    }

    this.adapters.set(request.adapter, { status: 'downloading' })
    const prepared = request.adapter === 'python' ? await this.preparePython(path.resolve(workspaceRoot)) : await this.prepareNode()

    if (prepared.ok === false) {
      this.adapters.set(request.adapter, { status: 'unavailable', reason: prepared.reason })

      return { ok: false, status: 'unavailable', reason: prepared.reason }
    }

    if (this.disposed) {
      return { ok: false, status: 'unavailable', reason: 'stopped' }
    }

    const session = this.spawnSession(request, path.resolve(workspaceRoot), prepared)
    const pythonPath = 'pythonPath' in prepared && typeof prepared.pythonPath === 'string' ? prepared.pythonPath : undefined

    return {
      ok: true,
      status: 'ready',
      sessionId: session.id,
      adapter: request.adapter,
      ...(pythonPath ? { pythonPath } : {}),
      ...(request.adapter === 'node' ? { nodeExecPath: this.deps.nodeExecPath } : {})
    }
  }

  private async preparePython(
    _workspaceRoot: string
  ): Promise<{ ok: true; spawn: SpawnRequest; pythonPath: string } | { ok: false; reason: string }> {
    const located = resolveRuntimeDir({
      platform: this.deps.platform,
      env: this.deps.env,
      home: this.deps.home,
      kind: 'dap',
      name: 'debugpy',
      version: DEBUGPY_VERSION,
      installRoots: this.deps.installRoots
    })

    if (located.ok === false) {
      return located
    }

    const prepare = this.deps.preparePython ?? prepareDebugpy
    const result = await prepare({
      python: this.deps.resolvePython(),
      destDir: located.dir,
      baseEnv: this.deps.env
    })

    if (result.ok === false) {
      return result
    }

    return { ok: true, spawn: launchToSpawn(result.launch, this.deps.env), pythonPath: result.launch.pythonPath }
  }

  private async prepareNode(): Promise<{ ok: true; spawn: SpawnRequest } | { ok: false; reason: string }> {
    const located = resolveRuntimeDir({
      platform: this.deps.platform,
      env: this.deps.env,
      home: this.deps.home,
      kind: 'dap',
      name: 'vscode-js-debug',
      version: JS_DEBUG_VERSION,
      installRoots: this.deps.installRoots
    })

    if (located.ok === false) {
      return located
    }

    const prepare = this.deps.prepareNode ?? prepareJsDebug
    const result = await prepare(located.dir)

    if (result.ok === false) {
      return result
    }

    return {
      ok: true,
      spawn: {
        command: this.deps.nodeExecPath,
        args: [result.script],
        env: electronNodeEnv(this.deps.env)
      }
    }
  }

  private spawnSession(
    request: DapStartRequest,
    workspaceRoot: string,
    prepared: { spawn: SpawnRequest; pythonPath?: string }
  ): Session {
    const id = `dap-${request.adapter}-${randomBytes(6).toString('hex')}`
    const launchEnv = stringEnv(request.launch?.env)
    const peer = this.spawn({
      ...prepared.spawn,
      cwd: request.launch?.cwd || workspaceRoot,
      env: request.adapter === 'node' ? electronNodeEnv(prepared.spawn.env, launchEnv) : { ...prepared.spawn.env, ...launchEnv }
    })
    const session: Session = { id, adapter: request.adapter, workspaceRoot, status: 'ready' }

    session.connection = new DapConnection(peer, event => {
      this.deps.onEvent?.({ sessionId: id, event })
    })
    peer.onExit(code => {
      if (session.status === 'ready') {
        session.status = 'crashed'
        session.reason = `exit ${code ?? 'unknown'}`
        this.adapters.set(request.adapter, { status: 'crashed', reason: session.reason })
      }
    })
    this.sessions.set(id, session)
    this.adapters.set(request.adapter, { status: 'ready' })

    return session
  }

  private async disconnect(session: Session): Promise<void> {
    if (session.connection && session.status === 'ready') {
      try {
        await session.connection.request('disconnect', { terminateDebuggee: true }, 2_000)
      } catch {
        // The adapter is already gone; killing the process is the stop.
      }
    }

    session.connection?.dispose()
    session.status = 'unavailable'
    session.reason = 'stopped'
    this.sessions.delete(session.id)
  }
}

function launchToSpawn(launch: DebugpyLaunch, baseEnv: NodeJS.ProcessEnv): SpawnRequest {
  return {
    command: launch.command,
    args: launch.args,
    env: { ...baseEnv, ...launch.env }
  }
}

export type { DapLaunchConfig }
