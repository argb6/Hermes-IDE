import { atom } from 'nanostores'

/** In-memory open document — VS Code TextModel-shaped, without the editor view. */
export interface IdeDocument {
  dirty: boolean
  path: string
  version: number
}

export const $ideDocuments = atom<Record<string, IdeDocument>>({})

function keyFor(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function getIdeDocument(path: string): IdeDocument | null {
  return $ideDocuments.get()[keyFor(path)] ?? null
}

export function openIdeDocument(path: string): IdeDocument {
  const key = keyFor(path)
  const current = $ideDocuments.get()
  const existing = current[key]

  if (existing) {
    return existing
  }

  const next: IdeDocument = { dirty: false, path: key, version: 0 }

  $ideDocuments.set({ ...current, [key]: next })

  return next
}

export function markIdeDocumentDirty(path: string) {
  const key = keyFor(path)
  const current = $ideDocuments.get()
  const doc = current[key]

  if (!doc || doc.dirty) {
    return
  }

  $ideDocuments.set({ ...current, [key]: { ...doc, dirty: true, version: doc.version + 1 } })
}

export function markIdeDocumentClean(path: string) {
  const key = keyFor(path)
  const current = $ideDocuments.get()
  const doc = current[key]

  if (!doc || !doc.dirty) {
    return
  }

  $ideDocuments.set({ ...current, [key]: { ...doc, dirty: false } })
}

export function closeIdeDocument(path: string) {
  const key = keyFor(path)
  const current = $ideDocuments.get()

  if (!(key in current)) {
    return
  }

  const { [key]: _removed, ...rest } = current

  $ideDocuments.set(rest)
}

/** Absolute path → repo-relative for `git add` (cwd = repo root). */
export function repoRelativePath(cwd: string, absolute: string): string {
  const root = cwd.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
  const file = absolute.replace(/\\/g, '/')
  const lower = file.toLowerCase()

  if (lower === root) {
    return ''
  }

  if (lower.startsWith(`${root}/`)) {
    return file.slice(root.length + 1)
  }

  return absolute.replace(/\\/g, '/')
}
