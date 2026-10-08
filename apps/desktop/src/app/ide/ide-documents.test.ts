import { beforeEach, describe, expect, it } from 'vitest'

import {
  $ideDocuments,
  closeIdeDocument,
  getIdeDocument,
  markIdeDocumentClean,
  markIdeDocumentDirty,
  openIdeDocument,
  repoRelativePath
} from './ide-documents'

describe('ide-documents', () => {
  beforeEach(() => {
    $ideDocuments.set({})
  })

  it('opens a document once and tracks dirty/clean', () => {
    const first = openIdeDocument('C:\\repo\\a.ts')
    const again = openIdeDocument('C:/repo/a.ts')

    expect(again).toEqual(first)
    expect(getIdeDocument('C:\\repo\\a.ts')?.dirty).toBe(false)

    markIdeDocumentDirty('C:\\repo\\a.ts')
    expect(getIdeDocument('C:/repo/a.ts')?.dirty).toBe(true)
    expect(getIdeDocument('C:/repo/a.ts')?.version).toBe(1)

    markIdeDocumentClean('C:\\repo\\a.ts')
    expect(getIdeDocument('C:/repo/a.ts')?.dirty).toBe(false)

    closeIdeDocument('C:\\repo\\a.ts')
    expect(getIdeDocument('C:/repo/a.ts')).toBeNull()
  })

  it('maps absolute paths to repo-relative', () => {
    expect(repoRelativePath('C:\\repo', 'C:\\repo\\src\\a.ts')).toBe('src/a.ts')
    expect(repoRelativePath('/home/u/repo', '/home/u/repo/b.ts')).toBe('b.ts')
    expect(repoRelativePath('C:\\repo', 'D:\\other\\x.ts')).toBe('D:/other/x.ts')
  })
})
