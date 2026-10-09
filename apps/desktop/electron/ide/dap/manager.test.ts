import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ContentLengthParser, encodeContentLength } from '../frame'
import { isInsideDir } from '../paths'
import type { StdioPeer } from '../stdio-rpc'
import { DEBUGPY_VERSION, prepareDebugpy } from './debugpy'
import { DapManager } from './manager'

class FakePeer implements StdioPeer {
  readonly parser = new ContentLengthParser()
  private dataListeners: Array<(chunk: Buffer) => void> = []
  private exitListeners: Array<(code: number | null) => void> = []

  write(data: string): void {
    for (const message of this.parser.push(Buffer.from(data))) {
      const dap = message as { type?: string; command?: string; seq?: number }

      if (dap.type === 'request' && dap.command) {
        this.emit({
          type: 'response',
          request_seq: dap.seq,
          success: true,
          command: dap.command,
          body: { from: dap.command }
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

  kill(): void {
    return undefined
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

describe('prepareDebugpy', () => {
  it('does not pip when the agent interpreter already imports debugpy', async () => {
    const calls: string[][] = []
    const result = await prepareDebugpy({
      python: { executable: '/venv/bin/python', source: 'venv', pythonPath: '/checkout' },
      destDir: '/data/dap/debugpy',
      baseEnv: {},
      run: async (_command, args) => {
        calls.push(args)

        return { code: 0, stdout: '', stderr: '' }
      }
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([['-c', 'import debugpy']])

    if (result.ok === true) {
      expect(result.launch.args).toEqual(['-m', 'debugpy.adapter'])
      expect(result.launch.command).toBe('/venv/bin/python')
    }
  })

  it('installs debugpy with pip --target under the caller directory when import fails', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-debugpy-'))
    const calls: string[][] = []
    const result = await prepareDebugpy({
      python: { executable: '/venv/bin/python', source: 'payload' },
      destDir: dest,
      baseEnv: {},
      run: async (_command, args) => {
        calls.push(args)

        if (args[0] === '-m') {
          fs.mkdirSync(path.join(dest, 'debugpy'), { recursive: true })
          fs.writeFileSync(path.join(dest, 'debugpy', '__init__.py'), '')
        }

        const importing = args[0] === '-c'
        const installed = fs.existsSync(path.join(dest, 'debugpy', '__init__.py'))

        return { code: importing && !installed ? 1 : 0, stdout: '', stderr: '' }
      }
    })

    expect(result.ok).toBe(true)
    expect(calls[1]).toEqual([
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '--no-input',
      '--target',
      dest,
      `debugpy==${DEBUGPY_VERSION}`
    ])

    if (result.ok === true) {
      expect(result.launch.env.PYTHONPATH?.split(path.delimiter)).toContain(dest)
    }
  })

  it('is unavailable without an agent interpreter', async () => {
    const result = await prepareDebugpy({
      python: null,
      destDir: '/data/dap/debugpy',
      baseEnv: {},
      run: async () => ({ code: 0, stdout: '', stderr: '' })
    })

    expect(result).toEqual({ ok: false, reason: 'no-python' })
  })
})

describe('dap manager', () => {
  const home = path.join(path.sep, 'home', 'ada')
  const install = path.join(path.sep, 'opt', 'Hermes-IDE')
  const data = path.join(home, 'share')

  it('reports unavailable when the adapter cannot be downloaded', async () => {
    const dap = new DapManager({
      platform: 'linux',
      env: { XDG_DATA_HOME: data },
      home,
      installRoots: [install],
      nodeExecPath: path.join(install, 'hermes'),
      resolvePython: () => null,
      preparePython: async ({ destDir }) => {
        expect(isInsideDir(destDir, install, 'linux')).toBe(false)
        expect(destDir.startsWith(path.join(data, 'Hermes', 'dap', 'debugpy'))).toBe(true)

        return { ok: false, reason: 'offline' }
      }
    })

    await expect(dap.start({ adapter: 'python', workspaceRoot: path.join(home, 'work') })).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
      reason: 'offline'
    })
    expect(dap.status().adapters.find(row => row.adapter === 'python')).toMatchObject({
      status: 'unavailable',
      reason: 'offline'
    })
  })

  it('runs vscode-js-debug with Electron as Node', async () => {
    let seen: { command: string; args: string[]; env: NodeJS.ProcessEnv } | null = null
    const peer = new FakePeer()
    const execPath = path.join(install, 'hermes')
    const dap = new DapManager({
      platform: 'linux',
      env: { XDG_DATA_HOME: data },
      home,
      installRoots: [install],
      nodeExecPath: execPath,
      resolvePython: () => null,
      prepareNode: async destDir => {
        expect(isInsideDir(destDir, install, 'linux')).toBe(false)

        return { ok: true, script: path.join(destDir, 'js-debug', 'src', 'dapDebugServer.js') }
      },
      spawn: request => {
        seen = request

        return peer
      }
    })
    const started = await dap.start({ adapter: 'node', workspaceRoot: path.join(home, 'work') })

    expect(started.ok).toBe(true)
    expect(started.nodeExecPath).toBe(execPath)
    expect(seen?.command).toBe(execPath)
    expect(seen?.args[0]).toMatch(/js-debug\/src\/dapDebugServer\.js$/)
    expect(seen?.env.ELECTRON_RUN_AS_NODE).toBe('1')

    const response = await dap.send({ sessionId: started.sessionId || '', command: 'initialize', arguments: {} })

    expect(response.ok).toBe(true)
    expect(response.response).toMatchObject({ success: true, command: 'initialize' })
    peer.exit(1)
    expect(dap.status().sessions[0]).toMatchObject({ status: 'crashed' })
  })
})
