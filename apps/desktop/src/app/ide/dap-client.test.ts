import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dapLaunchArguments, dapSend, dapStart } from './dap-client'

describe('dap client', () => {
  beforeEach(() => {
    window.hermesDesktop = {} as unknown as Window['hermesDesktop']
  })

  it('stays unavailable and does not throw when the bridge is missing', async () => {
    await expect(dapStart({ adapter: 'python', workspaceRoot: '/work' })).resolves.toEqual({
      ok: false,
      reason: 'offline',
      status: 'unavailable'
    })
    await expect(dapSend({ command: 'threads', sessionId: 's' })).resolves.toMatchObject({
      ok: false,
      status: 'unavailable'
    })
  })

  it('puts the start pythonPath into the Python launch request', () => {
    expect(
      dapLaunchArguments({
        adapter: 'python',
        cwd: '/work',
        program: '/work/app.py',
        pythonPath: '/agent/python'
      })
    ).toMatchObject({
      cwd: '/work',
      program: '/work/app.py',
      python: '/agent/python',
      request: 'launch'
    })
  })

  it('does not send a Python interpreter for the node adapter', () => {
    const launch = dapLaunchArguments({
      adapter: 'node',
      cwd: '/work',
      program: '/work/app.ts',
      pythonPath: '/agent/python'
    })

    expect(launch).not.toHaveProperty('python')
  })

  it('swallows a rejected send', async () => {
    window.hermesDesktop = {
      dap: {
        onEvent: () => () => undefined,
        send: vi.fn().mockRejectedValue(new Error('closed')),
        start: vi.fn(),
        status: vi.fn(),
        stop: vi.fn()
      }
    } as unknown as Window['hermesDesktop']

    await expect(dapSend({ command: 'continue', sessionId: 's' })).resolves.toMatchObject({
      ok: false,
      reason: 'offline'
    })
  })
})
