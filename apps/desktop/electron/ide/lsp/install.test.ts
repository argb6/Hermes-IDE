import fs from 'node:fs'

import { describe, expect, it } from 'vitest'

import { prepareLanguageServer } from './install'

// The servers SHIP INSIDE the app (package.json dependencies, staged into
// dist/node_modules at pack time): prepareLanguageServer resolves the bundled
// packages and never downloads anything — first use works offline.
describe('bundled language servers', () => {
  it('prepares pyright from the bundled package', async () => {
    const result = await prepareLanguageServer('pyright')

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(fs.existsSync(result.prepared.script)).toBe(true)
      expect(result.prepared.args).toEqual(['--stdio'])
    }
  })

  it('prepares typescript-language-server with a bundled tsserver', async () => {
    const result = await prepareLanguageServer('typescript-language-server')

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(fs.existsSync(result.prepared.script)).toBe(true)
      expect(result.prepared.tsserverPath).toBeTruthy()
      expect(fs.existsSync(result.prepared.tsserverPath!)).toBe(true)
    }
  })
})
