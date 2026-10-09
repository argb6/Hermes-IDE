import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ContentLengthParser, encodeContentLength } from '../frame'
import type { StdioPeer } from '../stdio-rpc'
import { LspManager } from './manager'

class FakePeer implements StdioPeer {
  readonly parser = new ContentLengthParser()
  readonly writes: unknown[] = []
  killed = false
  private dataListeners: Array<(chunk: Buffer) => void> = []
  private exitListeners: Array<(code: number | null) => void> = []

  write(data: string): void {
    for (const message of this.parser.push(Buffer.from(data))) {
      this.writes.push(message)
      const rpc = message as { id?: number; method?: string }

      if (rpc.method === 'initialize' && rpc.id !== undefined) {
        this.emit({ jsonrpc: '2.0', id: rpc.id, result: { capabilities: {} } })
      }
    }
  }

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener)
  }

  onExit(listener: (code: number | null) => void): void {
    this.exitListeners.push(listener)
  }

  kill(): void {
    this.killed = true
  }

  emit(message: unknown): void {
    const chunk = Buffer.from(encodeContentLength(message))

    for (const listener of this.dataListeners) {
      listener(chunk)
    }
  }

  exit(code: number | null): void {
    for (const listener of this.exitListeners) {
      listener(code)
    }
  }
}

const HOME = path.join(path.sep, 'home', 'ada')
const INSTALL = path.join(path.sep, 'opt', 'Hermes-IDE')

function manager(options: {
  prepare?: LspManager['start'] extends never ? never : ConstructorPrepare
  spawn?: (request: { command: string; args: string[]; env: NodeJS.ProcessEnv }) => StdioPeer
  schedule?: (fn: () => void, ms: number) => { cancel: () => void }
  onDiagnostics?: (event: unknown) => void
} = {}) {
  const peers: FakePeer[] = []
  const lsp = new LspManager({
    platform: 'linux',
    env: { XDG_DATA_HOME: path.join(HOME, 'share') },
    home: HOME,
    installRoots: [INSTALL],
    nodeExecPath: path.join(INSTALL, 'hermes'),
    prepare:
      options.prepare ??
      (async () => ({
        ok: true as const,
        prepared: { script: path.join(HOME, 'share', 'Hermes', 'lsp', 'pyright.js'), args: ['--stdio'] }
      })),
    spawn: request => {
      options.spawn?.(request)
      const peer = new FakePeer()

      peers.push(peer)

      return peer
    },
    schedule: options.schedule,
    onDiagnostics: options.onDiagnostics as (event: never) => void
  })

  return { lsp, peers }
}

type ConstructorPrepare = NonNullable<ConstructorParameters<typeof LspManager>[0]['prepare']>

describe('lsp manager', () => {
  it('stays unavailable when the download cannot run, and does not throw', async () => {
    const { lsp, peers } = manager({
      prepare: async () => ({ ok: false, reason: 'offline' })
    })
    const workspace = path.join(HOME, 'work')

    await expect(lsp.start({ language: 'python', workspaceRoot: workspace })).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
      reason: 'offline'
    })
    expect(lsp.status({ language: 'python', workspaceRoot: workspace }).languages[0]).toMatchObject({
      status: 'unavailable',
      reason: 'offline'
    })
    expect(peers).toHaveLength(0)
  })

  it('spawns pyright on Electron’s Node and reaches ready', async () => {
    let command = ''
    let env: NodeJS.ProcessEnv = {}
    const { lsp } = manager({
      spawn: request => {
        command = request.command
        env = request.env

        return new FakePeer()
      }
    })

    // The helper's spawn records the request and also returns its own peer.
    // Use the manager-created peer by not replacing the body: the outer spawn
    // above is composed inside `manager()`. Re-read the last spawn via env.
    const workspace = path.join(HOME, 'work')
    const started = await lsp.start({ language: 'python', workspaceRoot: workspace })

    expect(started).toMatchObject({ ok: true, status: 'ready' })
    expect(command).toBe(path.join(INSTALL, 'hermes'))
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(lsp.status().languages.find(row => row.language === 'python')?.status).toBe('ready')
  })

  it('shares one TypeScript server across javascript and forwards diagnostics', async () => {
    const diagnostics: unknown[] = []
    let spawns = 0
    const { lsp, peers } = manager({
      prepare: async () => ({
        ok: true,
        prepared: { script: '/lsp/typescript-language-server.js', args: ['--stdio'], tsserverPath: '/lsp/tsserver.js' }
      }),
      spawn: () => {
        spawns += 1

        return new FakePeer()
      },
      onDiagnostics: event => diagnostics.push(event)
    })
    const workspace = path.join(HOME, 'web')

    await lsp.start({ language: 'typescript', workspaceRoot: workspace })
    await lsp.start({ language: 'javascript', workspaceRoot: workspace })
    expect(spawns).toBe(1)

    const opened = lsp.didOpen({
      language: 'javascript',
      workspaceRoot: workspace,
      uri: 'file:///web/app.js',
      languageId: 'javascript',
      version: 1,
      text: 'const n = 1\n'
    })

    expect(opened.ok).toBe(true)
    peers[0].emit({
      method: 'textDocument/publishDiagnostics',
      params: { uri: 'file:///web/app.js', diagnostics: [{ message: 'unused' }] }
    })
    expect(diagnostics).toEqual([
      {
        language: 'javascript',
        workspaceRoot: workspace,
        uri: 'file:///web/app.js',
        diagnostics: [{ message: 'unused' }]
      }
    ])
    await expect(lsp.waitForDiagnostics('javascript', workspace, 'file:///web/app.js', 20)).resolves.toEqual([
      { message: 'unused' }
    ])
  })

  it('restarts a crashed server with the scheduled backoff', async () => {
    const delays: number[] = []
    let pending: (() => void) | null = null
    const { lsp, peers } = manager({
      schedule: (fn, ms) => {
        delays.push(ms)
        pending = fn

        return { cancel: () => undefined }
      }
    })
    const workspace = path.join(HOME, 'work')

    await lsp.start({ language: 'python', workspaceRoot: workspace })
    peers[0].exit(1)
    expect(lsp.status({ language: 'python' }).languages[0]).toMatchObject({ status: 'crashed', reason: 'restarting' })
    expect(delays).toEqual([500])
    pending?.()
    await new Promise(resolve => setImmediate(resolve))
    expect(peers).toHaveLength(2)
    expect(lsp.status({ language: 'python' }).languages[0].status).toBe('ready')
  })
})
