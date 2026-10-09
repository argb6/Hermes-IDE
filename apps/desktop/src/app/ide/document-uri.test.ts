import { afterEach, describe, expect, it, vi } from 'vitest'

import { documentFileUri } from './document-uri'

afterEach(() => {
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('documentFileUri', () => {
  it('returns the desktop pathToFileUri string unchanged', () => {
    const pathToFileUri = vi.fn(() => 'file:///work/a%23b.ts')

    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { pathToFileUri }
    })

    expect(documentFileUri('/work/a#b.ts')).toBe('file:///work/a%23b.ts')
    expect(pathToFileUri).toHaveBeenCalledWith('/work/a#b.ts')
  })

  it('does not invent a URI when the bridge is missing', () => {
    expect(documentFileUri('/work/app.ts')).toBeNull()
  })
})
