import { spawn, type ChildProcess } from 'node:child_process'

import { hiddenWindowsChildOptions } from '../windows-child-options'
import type { StdioPeer } from './stdio-rpc'

export interface SpawnRequest {
  command: string
  args: string[]
  cwd?: string
  env: NodeJS.ProcessEnv
}

export function spawnStdio(request: SpawnRequest): StdioPeer {
  const child: ChildProcess = spawn(
    request.command,
    request.args,
    hiddenWindowsChildOptions({
      cwd: request.cwd,
      env: request.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
  )
  const exitListeners: Array<(code: number | null) => void> = []
  let exited = false
  let exitCode: number | null = null

  const emitExit = (code: number | null) => {
    if (exited) {
      return
    }

    exited = true
    exitCode = code

    for (const listener of exitListeners) {
      listener(code)
    }
  }

  child.on('error', () => emitExit(null))
  child.on('exit', code => emitExit(code))

  return {
    write(data: string) {
      child.stdin?.write(data)
    },
    onData(listener) {
      child.stdout?.on('data', listener)
    },
    onExit(listener) {
      exitListeners.push(listener)

      if (exited) {
        listener(exitCode)
      }
    },
    kill() {
      if (child.killed || child.exitCode !== null) {
        return
      }

      child.kill()
    }
  }
}

/** Electron's bundled Node. The child must not inherit a GUI launch. */
export function electronNodeEnv(base: NodeJS.ProcessEnv, extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...base,
    ...stringEnv(extra),
    ELECTRON_RUN_AS_NODE: '1'
  }
}

export function stringEnv(extra?: Record<string, string>): Record<string, string> {
  if (!extra) {
    return {}
  }

  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string' && key) {
      out[key] = value
    }
  }

  return out
}
