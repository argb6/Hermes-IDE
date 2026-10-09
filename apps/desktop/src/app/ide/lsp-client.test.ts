import { beforeEach, describe, expect, it, vi } from 'vitest'

import { lspRequest, lspStart, lspStatus } from './lsp-client'

describe('lsp client', () => {
  beforeEach(() => {
    window.hermesDesktop = { lsp: undefined } as unknown as Window['hermesDesktop']
  })

  it('stays unavailable when the bridge is missing', async () => {
    await expect(lspStart({ languageId: 'python', rootPath: '/work' })).resolves.toEqual({ state: 'unavailable' })
    await expect(lspStatus({ languageId: 'typescript', rootPath: '/work' })).resolves.toEqual({ state: 'unavailable' })
    await expect(lspRequest({ languageId: 'python', method: 'textDocument/hover', params: {}, rootPath: '/work' })).resolves.toBeNull()
  })

  it('returns the bridge payload and swallows a rejected invoke', async () => {
    const start = vi.fn().mockResolvedValue({ state: 'ready' })
    const request = vi.fn().mockRejectedValue(new Error('No handler registered'))

    window.hermesDesktop.lsp = {
      didChange: vi.fn(),
      didClose: vi.fn(),
      didOpen: vi.fn(),
      onDiagnostics: () => () => undefined,
      onStatus: () => () => undefined,
      request,
      start,
      status: vi.fn(),
      stop: vi.fn()
    }

    await expect(lspStart({ languageId: 'python', rootPath: '/work' })).resolves.toEqual({ state: 'ready' })
    await expect(
      lspRequest({ languageId: 'python', method: 'textDocument/hover', params: {}, rootPath: '/work' })
    ).resolves.toBeNull()
  })
})
