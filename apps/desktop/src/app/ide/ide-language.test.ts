import { describe, expect, it } from 'vitest'

import { debugAdapterFor, fileUri, lspLanguageId, monacoLanguageId } from './ide-language'

describe('ide language ids', () => {
  it('maps source files onto Monaco and the first LSP languages', () => {
    expect(monacoLanguageId('src/app.TSX')).toBe('typescript')
    expect(lspLanguageId('/work/pkg/mod.py')).toBe('python')
    expect(lspLanguageId('/work/app.js')).toBe('javascript')
    expect(lspLanguageId('/work/notes.md')).toBeNull()
    expect(debugAdapterFor('C:\\repo\\main.py')).toBe('python')
    expect(debugAdapterFor('/repo/main.ts')).toBe('node')
    expect(debugAdapterFor('/repo/readme.md')).toBeNull()
  })

  it('builds a file URI without a Monaco import', () => {
    expect(fileUri('/work/app.ts')).toBe('file:///work/app.ts')
    expect(fileUri('C:\\repo\\a ts.py')).toBe('file:///C:/repo/a%20ts.py')
  })
})
