// The interpreter debugpy must run on: the same one the desktop uses to launch
// the Hermes agent. Mirrors the rungs in electron/main.ts `resolveHermesBackend`
// that actually name a Python — bundled payload store python, then
// HERMES_DESKTOP_PYTHON, then a checkout or install virtualenv. A missing
// interpreter is null. This does not search PATH; a random system Python is
// not the agent runtime.

import path from 'node:path'

export interface AgentPythonRequest {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  fileExists: (candidate: string) => boolean
  /** `bundledPayload().storePython` when this artifact ships an agent runtime. */
  payloadPython?: string | null
  /** Extra PYTHONPATH the bundled payload uses (`payloadPythonPath`). */
  payloadPythonPath?: string | null
  /**
   * Checkout and install roots in the desktop's order, after the payload rung:
   * HERMES_DESKTOP_HERMES_ROOT, the dev checkout, then the active install.
   */
  roots: string[]
}

export interface AgentPython {
  executable: string
  source: 'payload' | 'override' | 'venv'
  pythonPath?: string
  root?: string
}

export function resolveAgentPython(request: AgentPythonRequest): AgentPython | null {
  const payload = consolePython(request.payloadPython, request)

  if (payload) {
    return {
      executable: payload,
      source: 'payload',
      ...(request.payloadPythonPath ? { pythonPath: request.payloadPythonPath } : {})
    }
  }

  const override = (request.env.HERMES_DESKTOP_PYTHON || '').trim()
  const overridePython = consolePython(override, request)

  if (overridePython) {
    return { executable: overridePython, source: 'override' }
  }

  for (const root of request.roots) {
    if (!root) {
      continue
    }

    const found = venvPython(root, request)

    if (found) {
      return { executable: found, source: 'venv', pythonPath: root, root }
    }
  }

  return null
}

function consolePython(candidate: string | null | undefined, request: AgentPythonRequest): string | null {
  if (!candidate || !request.fileExists(candidate)) {
    return null
  }

  if (request.platform === 'win32' && /pythonw\.exe$/i.test(candidate)) {
    const consoleExe = candidate.replace(/pythonw\.exe$/i, 'python.exe')

    if (request.fileExists(consoleExe)) {
      return consoleExe
    }
  }

  return candidate
}

function venvPython(root: string, request: AgentPythonRequest): string | null {
  const paths = request.platform === 'win32' ? path.win32 : path.posix
  const relatives =
    request.platform === 'win32'
      ? [paths.join('.venv', 'Scripts', 'python.exe'), paths.join('venv', 'Scripts', 'python.exe')]
      : [paths.join('.venv', 'bin', 'python'), paths.join('venv', 'bin', 'python')]

  for (const relative of relatives) {
    const candidate = paths.join(root, relative)

    if (request.fileExists(candidate)) {
      return candidate
    }
  }

  return null
}
