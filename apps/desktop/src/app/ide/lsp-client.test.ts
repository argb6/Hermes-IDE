import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LspBridge } from '../../../electron/ide/contract'

import { lspRequest, lspStart } from './lsp-client'

function install(partial: Partial<LspBridge>) {
  window.hermesDesktop = {
    lsp: {
      didChange: vi.fn(),
      didClose: vi.fn(),
      didOpen: vi.fn(),
      onDiagnostics: () => () => undefined,
      request: vi.fn(),
      start: vi.fn(),
      status: vi.fn(),
      stop: vi.fn(),
      ...partial
    }
  } as unknown as Window['hermesDesktop']
}

describe('lsp client', () => {
  beforeEach(() => {
    window.hermesDesktop = {} as unknown as Window['hermesDesktop']
  })

  it('stays unavailable and does not throw when the bridge is missing', async () => {
    await expect(lspStart({ language: 'python', workspaceRoot: '/work' })).resolves.toEqual({
      language: 'python',
      ok: false,
      reason: 'offline',
      status: 'unavailable'
    })
    await expect(lspRequest({ language: 'python', method: 'textDocument/hover', workspaceRoot: '/work' })).resolves.toBeNull()
  })

  it('retries a not-ready request once status is ready', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'not-ready', status: 'downloading' })
      .mockResolvedValueOnce({ ok: true, result: { contents: 'typed' } })

    install({
      request,
      status: vi.fn().mockResolvedValue({ languages: [{ language: 'python', status: 'ready' }] })
    })

    await expect(lspRequest({ language: 'python', method: 'textDocument/hover', workspaceRoot: '/work' })).resolves.toEqual({
      contents: 'typed'
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not retry an offline start', async () => {
    const start = vi.fn().mockResolvedValue({
      language: 'python',
      ok: false,
      reason: 'offline',
      status: 'unavailable'
    })

    install({ start })

    await expect(lspStart({ language: 'python', workspaceRoot: '/work' })).resolves.toMatchObject({
      reason: 'offline',
      status: 'unavailable'
    })
    expect(start).toHaveBeenCalledTimes(1)
  })
})
