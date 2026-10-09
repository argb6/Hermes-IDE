import http from 'node:http'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { bridgeRequestAllowed, queryCodeIntelligence, startIdeBridge, stopIdeBridge } from './bridge'
import { ContentLengthParser, encodeContentLength } from './frame'
import { LspManager } from './lsp/manager'
import type { StdioPeer } from './stdio-rpc'

class FakePeer implements StdioPeer {
  readonly parser = new ContentLengthParser()
  private dataListeners: Array<(chunk: Buffer) => void> = []
  private exitListeners: Array<(code: number | null) => void> = []

  write(data: string): void {
    for (const message of this.parser.push(Buffer.from(data))) {
      const rpc = message as { id?: number; method?: string; params?: { textDocument?: { uri?: string } } }

      if (rpc.method === 'initialize' && rpc.id !== undefined) {
        this.emit({ jsonrpc: '2.0', id: rpc.id, result: { capabilities: {} } })
      } else if (rpc.id !== undefined) {
        this.emit({ jsonrpc: '2.0', id: rpc.id, result: { contents: 'symbol' } })
      } else if (rpc.method === 'textDocument/didOpen') {
        this.emit({
          method: 'textDocument/publishDiagnostics',
          params: { uri: rpc.params?.textDocument?.uri, diagnostics: [{ message: 'unused' }] }
        })
      }
    }
  }

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener)
  }

  onExit(listener: (code: number | null) => void): void {
    this.exitListeners.push(listener)
  }

  kill(): void {}

  emit(message: unknown): void {
    const chunk = Buffer.from(encodeContentLength(message))

    for (const listener of this.dataListeners) {
      listener(chunk)
    }
  }
}

const HOME = path.join(path.sep, 'home', 'ada')
const INSTALL = path.join(path.sep, 'opt', 'Hermes-IDE')

function manager() {
  const spawns: string[] = []
  const lsp = new LspManager({
    platform: 'linux',
    env: { XDG_DATA_HOME: path.join(HOME, 'share') },
    home: HOME,
    installRoots: [INSTALL],
    nodeExecPath: path.join(INSTALL, 'hermes'),
    prepare: async () => ({
      ok: true as const,
      prepared: { script: path.join(HOME, 'pyright.js'), args: ['--stdio'] }
    }),
    spawn: () => {
      spawns.push('spawn')

      return new FakePeer()
    }
  })

  return { lsp, spawns }
}

async function post(port: number, token: string | null, body: unknown): Promise<{ status: number; json: { status?: string; reason?: string; result?: unknown; diagnostics?: unknown[] } }> {
  const payload = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/ide/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      },
      res => {
        const chunks: Buffer[] = []

        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
        })
      }
    )

    req.on('error', reject)
    req.end(payload)
  })
}

afterEach(async () => {
  await stopIdeBridge()
})

describe('ide agent bridge', () => {
  it('accepts only a loopback peer that presents the session token', () => {
    const token = 'abc'

    expect(bridgeRequestAllowed('127.0.0.1', 'Bearer abc', token)).toBe(true)
    expect(bridgeRequestAllowed('::1', 'Bearer abc', token)).toBe(true)
    expect(bridgeRequestAllowed('::ffff:127.0.0.1', 'Bearer abc', token)).toBe(true)
    expect(bridgeRequestAllowed('127.0.0.1', 'Bearer nope', token)).toBe(false)
    expect(bridgeRequestAllowed('10.0.0.8', 'Bearer abc', token)).toBe(false)
    expect(bridgeRequestAllowed(undefined, 'Bearer abc', token)).toBe(false)
  })

  it('binds loopback and does not spawn a language server when none is ready', async () => {
    const { lsp, spawns } = manager()
    const bridge = await startIdeBridge(lsp)
    const address = await new Promise<string>(resolve => {
      // The listener is already up; the endpoint records the bind address.
      resolve(bridge.host)
    })

    expect(address).toBe('127.0.0.1')
    const missing = await post(bridge.port, null, { action: 'hover', path: '/work/app.py', line: 1, character: 1 })
    const wrong = await post(bridge.port, 'nope', { action: 'hover', path: '/work/app.py', line: 1, character: 1 })
    const idle = await post(bridge.port, bridge.token, {
      action: 'hover',
      path: '/work/app.py',
      line: 1,
      character: 1,
      workspaceRoot: '/work'
    })

    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(idle.json).toMatchObject({ status: 'unavailable', reason: 'not-started' })
    expect(spawns).toEqual([])
  })

  it('reuses the ready server for hover and diagnostics', async () => {
    const { lsp, spawns } = manager()
    const workspace = path.join(HOME, 'work')

    await lsp.start({ language: 'python', workspaceRoot: workspace })
    const file = path.join(workspace, 'app.py')
    const bridge = await startIdeBridge(lsp)
    const hover = await queryCodeIntelligence(
      lsp,
      { action: 'hover', path: file, line: 3, character: 1, workspaceRoot: workspace },
      { readFile: () => 'value = 1\n' }
    )
    const diagnostics = await queryCodeIntelligence(
      lsp,
      { action: 'diagnostics', path: file, workspaceRoot: workspace },
      { readFile: () => 'value = 1\n' }
    )
    const again = await post(bridge.port, bridge.token, {
      action: 'definition',
      path: file,
      line: 1,
      character: 1,
      workspaceRoot: workspace
    })

    expect(hover).toMatchObject({ status: 'ok', result: { contents: 'symbol' } })
    expect(diagnostics).toMatchObject({ status: 'ok', diagnostics: [{ message: 'unused' }] })
    expect(again.json).toMatchObject({ status: 'ok', result: { contents: 'symbol' } })
    expect(spawns).toEqual(['spawn'])
  })
})
