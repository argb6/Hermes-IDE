import { execFile, type ExecFileException } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import type { AgentPython } from '../agent-python'

export const DEBUGPY_VERSION = '1.8.22'

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; timeout?: number }
) => Promise<CommandResult>

export function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; timeout?: number }
): Promise<CommandResult> {
  return new Promise(resolve => {
    execFile(
      command,
      args,
      {
        env: options.env,
        timeout: options.timeout ?? 20_000,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({
          code: exitCode(error),
          stdout: stdout ?? '',
          stderr: stderr ?? ''
        })
      }
    )
  })
}

export interface DebugpyLaunch {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  pythonPath: string
}

export async function prepareDebugpy(options: {
  python: AgentPython | null
  destDir: string
  baseEnv: NodeJS.ProcessEnv
  run?: CommandRunner
}): Promise<{ ok: true; launch: DebugpyLaunch } | { ok: false; reason: string }> {
  if (!options.python) {
    return { ok: false, reason: 'no-python' }
  }

  const run = options.run ?? runCommand
  const python = options.python
  const agentEnv = withPythonPath(options.baseEnv, python.pythonPath ? [python.pythonPath] : [])

  if (await importsDebugpy(run, python.executable, agentEnv)) {
    return { ok: true, launch: adapterLaunch(python.executable, agentEnv, python.executable) }
  }

  const target = options.destDir

  if (targetHasDebugpy(target) || (await pipInstall(run, python.executable, agentEnv, target))) {
    const env = withPythonPath(agentEnv, [target])

    if (await importsDebugpy(run, python.executable, env)) {
      return { ok: true, launch: adapterLaunch(python.executable, env, python.executable) }
    }
  }

  return { ok: false, reason: 'debugpy-unavailable' }
}

async function importsDebugpy(run: CommandRunner, python: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    const result = await run(python, ['-c', 'import debugpy'], { env, timeout: 20_000 })

    return result.code === 0
  } catch {
    return false
  }
}

async function pipInstall(run: CommandRunner, python: string, env: NodeJS.ProcessEnv, target: string): Promise<boolean> {
  fs.mkdirSync(target, { recursive: true })

  try {
    const result = await run(
      python,
      ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--target', target, `debugpy==${DEBUGPY_VERSION}`],
      { env, timeout: 180_000 }
    )

    return result.code === 0 && targetHasDebugpy(target)
  } catch {
    return false
  }
}

function targetHasDebugpy(target: string): boolean {
  return fs.existsSync(path.join(target, 'debugpy', '__init__.py'))
}

function adapterLaunch(python: string, env: NodeJS.ProcessEnv, pythonPath: string): DebugpyLaunch {
  return {
    command: python,
    args: ['-m', 'debugpy.adapter'],
    env,
    pythonPath
  }
}

function withPythonPath(base: NodeJS.ProcessEnv, prefixes: string[]): NodeJS.ProcessEnv {
  const parts = prefixes.filter(Boolean)

  if (base.PYTHONPATH) {
    parts.push(base.PYTHONPATH)
  }

  if (parts.length === 0) {
    return { ...base }
  }

  return { ...base, PYTHONPATH: parts.join(path.delimiter) }
}

function exitCode(error: ExecFileException | null): number {
  if (!error) {
    return 0
  }

  return typeof error.code === 'number' ? error.code : 1
}
