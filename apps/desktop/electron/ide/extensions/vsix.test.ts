import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { codeExtensionFields, inspectVsix, unpackExtension } from './vsix'

function vsix(manifest: Record<string, unknown>, files: Record<string, string> = {}): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'extension/package.json': strToU8(JSON.stringify(manifest))
  }

  for (const [name, text] of Object.entries(files)) {
    entries[`extension/${name}`] = strToU8(text)
  }

  return zipSync(entries)
}

const theme = {
  name: 'quiet',
  publisher: 'ada',
  version: '1.2.0',
  displayName: 'Quiet',
  contributes: {
    themes: [{ label: 'Quiet Dark', uiTheme: 'vs-dark', path: './themes/dark.json' }],
    grammars: [{ language: 'markdown', scopeName: 'text.html.markdown', path: './syntaxes/markdown.json' }],
    snippets: [{ language: 'markdown', path: './snippets/markdown.json' }],
    languages: [{ id: 'markdown', extensions: ['.md'], configuration: './language-configuration.json' }]
  }
}

describe('vsix code-extension rejection', () => {
  it('rejects a non-empty main entry and does not unpack it', () => {
    const bytes = vsix({ ...theme, main: './dist/extension.js' })
    const inspected = inspectVsix(bytes)

    expect(inspected.ok).toBe(false)

    if (inspected.ok === false) {
      expect(inspected.reason).toBe('code-extension')
      expect(inspected.fields).toEqual(['main'])
    }

    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-vsix-'))
    const unpacked = unpackExtension(bytes, dest, 'ada.quiet', 'linux')

    expect(unpacked).toMatchObject({ ok: false, reason: 'code-extension', fields: ['main'] })
    expect(fs.existsSync(path.join(dest, 'package.json'))).toBe(false)
  })

  it('rejects a browser entry the same way', () => {
    const fields = codeExtensionFields({ browser: ' ./browser.js ' })

    expect(fields).toEqual(['browser'])
    expect(inspectVsix(vsix({ ...theme, browser: './browser.js' }))).toMatchObject({
      ok: false,
      reason: 'code-extension',
      fields: ['browser']
    })
  })

  it('installs a declarative theme and exposes absolute contribution paths', () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-vsix-'))
    const unpacked = unpackExtension(
      vsix(theme, {
        'themes/dark.json': '{"name":"Quiet Dark"}',
        'syntaxes/markdown.json': '{}',
        'snippets/markdown.json': '{}',
        'language-configuration.json': '{}'
      }),
      dest,
      'ada.quiet',
      'linux'
    )

    expect(unpacked.ok).toBe(true)

    if (unpacked.ok === false) {
      return
    }

    expect(unpacked.extension.contributes.themes[0]).toMatchObject({
      label: 'Quiet Dark',
      uiTheme: 'vs-dark',
      path: path.join(dest, 'themes', 'dark.json')
    })
    expect(unpacked.extension.contributes.grammars[0].path).toBe(path.join(dest, 'syntaxes', 'markdown.json'))
    expect(unpacked.extension.contributes.snippets[0].path).toBe(path.join(dest, 'snippets', 'markdown.json'))
    expect(unpacked.extension.contributes.languages[0].configuration).toBe(path.join(dest, 'language-configuration.json'))
    expect(fs.readFileSync(path.join(dest, 'themes', 'dark.json'), 'utf8')).toContain('Quiet Dark')
  })

  it('refuses a zip entry that climbs out of the extension directory', () => {
    const bytes = zipSync({
      'extension/package.json': strToU8(JSON.stringify(theme)),
      'extension/../../evil.txt': strToU8('nope')
    })
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-vsix-'))

    expect(unpackExtension(bytes, dest, 'ada.quiet', 'linux')).toMatchObject({ ok: false, reason: 'path-escape' })
    expect(fs.existsSync(path.join(dest, 'package.json'))).toBe(false)
    expect(fs.existsSync(path.join(dest, '..', 'evil.txt'))).toBe(false)
  })

  it('treats an empty main string as declarative', () => {
    expect(codeExtensionFields({ main: '  ', browser: '' })).toEqual([])
  })
})
