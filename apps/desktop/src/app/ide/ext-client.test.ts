import { beforeEach, describe, expect, it, vi } from 'vitest'

import { extInstall, extSearch } from './ext-client'

describe('ext client', () => {
  beforeEach(() => {
    window.hermesDesktop = {} as unknown as Window['hermesDesktop']
  })

  it('reports search as unavailable without throwing when the bridge is missing', async () => {
    await expect(extSearch('theme')).resolves.toMatchObject({
      extensions: [],
      ok: false,
      reason: 'offline',
      status: 'unavailable'
    })
  })

  it('passes through a rejected code extension', async () => {
    window.hermesDesktop = {
      ext: {
        install: vi.fn().mockResolvedValue({
          fields: ['main'],
          ok: false,
          reason: 'code-extension',
          status: 'rejected'
        }),
        list: vi.fn(),
        search: vi.fn(),
        uninstall: vi.fn()
      }
    } as unknown as Window['hermesDesktop']

    await expect(extInstall('publisher.extension')).resolves.toEqual({
      fields: ['main'],
      ok: false,
      reason: 'code-extension',
      status: 'rejected'
    })
  })
})
