import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveAgentPython } from './agent-python'

const ROOT = path.join(path.sep, 'checkout')

function exists(paths: string[]) {
  const files = new Set(paths)

  return (candidate: string) => files.has(candidate)
}

describe('resolveAgentPython', () => {
  it('uses the bundled payload interpreter ahead of a checkout virtualenv', () => {
    const payload = path.join(path.sep, 'payload', 'python')
    const venv = path.join(ROOT, '.venv', 'bin', 'python')

    expect(
      resolveAgentPython({
        platform: 'linux',
        env: {},
        fileExists: exists([payload, venv]),
        payloadPython: payload,
        payloadPythonPath: '/payload/site-packages',
        roots: [ROOT]
      })
    ).toEqual({ executable: payload, source: 'payload', pythonPath: '/payload/site-packages' })
  })

  it('honours HERMES_DESKTOP_PYTHON when there is no payload', () => {
    const preferred = path.join(path.sep, 'opt', 'python')

    expect(
      resolveAgentPython({
        platform: 'linux',
        env: { HERMES_DESKTOP_PYTHON: preferred },
        fileExists: exists([preferred]),
        roots: []
      })
    ).toEqual({ executable: preferred, source: 'override' })
  })

  it('prefers the checkout .venv over venv, and swaps pythonw for python.exe', () => {
    const dot = path.join(ROOT, '.venv', 'bin', 'python')
    const flat = path.join(ROOT, 'venv', 'bin', 'python')
    const winRoot = 'C:\\checkout'
    const windowed = path.win32.join(winRoot, '.venv', 'Scripts', 'pythonw.exe')
    const consolePython = path.win32.join(winRoot, '.venv', 'Scripts', 'python.exe')

    expect(
      resolveAgentPython({
        platform: 'linux',
        env: {},
        fileExists: exists([dot, flat]),
        roots: [ROOT]
      })?.executable
    ).toBe(dot)
    expect(
      resolveAgentPython({
        platform: 'win32',
        env: {},
        fileExists: exists([windowed, consolePython]),
        roots: [winRoot]
      })?.executable
    ).toBe(consolePython)
  })

  it('returns null instead of a PATH interpreter when nothing selected exists', () => {
    expect(
      resolveAgentPython({
        platform: 'linux',
        env: { HERMES_DESKTOP_PYTHON: path.join(path.sep, 'missing') },
        fileExists: () => false,
        payloadPython: path.join(path.sep, 'also-missing'),
        roots: [ROOT]
      })
    ).toBeNull()
  })
})
