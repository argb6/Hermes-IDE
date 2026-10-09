// Declarative slices of a VS Code extension manifest. A non-empty `main` or
// `browser` entry means the package runs code. This phase does not.

import fs from 'node:fs'
import path from 'node:path'

import type { ExtensionContributes, InstalledExtension } from '../contract'
import { unzipEntries, zipEntryEscapes } from '../archive'
import { isInsideDir } from '../paths'

export interface ManifestScan {
  manifest: Record<string, unknown>
  fields: string[]
}

export function codeExtensionFields(manifest: Record<string, unknown>): string[] {
  const fields: string[] = []

  if (isExecutableEntry(manifest.main)) {
    fields.push('main')
  }

  if (isExecutableEntry(manifest.browser)) {
    fields.push('browser')
  }

  return fields
}

export type VsixInspect =
  | { ok: true; manifest: Record<string, unknown>; entries: Record<string, Uint8Array> }
  | { ok: false; reason: 'invalid-vsix' | 'code-extension' | 'path-escape'; fields?: string[] }

/** Read a .vsix in memory. Code extensions and path-escaping entries are refused before any write. */
export function inspectVsix(bytes: Uint8Array): VsixInspect {
  let entries: Record<string, Uint8Array>

  try {
    entries = unzipEntries(bytes)
  } catch {
    return { ok: false, reason: 'invalid-vsix' }
  }

  for (const name of Object.keys(entries)) {
    if (zipEntryEscapes(name)) {
      return { ok: false, reason: 'path-escape' }
    }
  }

  const manifestBytes = entries['extension/package.json']

  if (!manifestBytes) {
    return { ok: false, reason: 'invalid-vsix' }
  }

  let manifest: Record<string, unknown>

  try {
    manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'invalid-vsix' }
  }

  const fields = codeExtensionFields(manifest)

  if (fields.length > 0) {
    return { ok: false, reason: 'code-extension', fields }
  }

  return { ok: true, manifest, entries }
}

export function unpackExtension(bytes: Uint8Array, destDir: string, id: string, platform: NodeJS.Platform): 
  | { ok: true; extension: InstalledExtension }
  | { ok: false; reason: string; fields?: string[] } {
  const inspected = inspectVsix(bytes)

  if (inspected.ok === false) {
    return { ok: false, reason: inspected.reason, ...(inspected.fields ? { fields: inspected.fields } : {}) }
  }

  fs.rmSync(destDir, { recursive: true, force: true })
  fs.mkdirSync(destDir, { recursive: true })

  for (const [name, data] of Object.entries(inspected.entries)) {
    const relative = extensionRelative(name)

    if (relative === null) {
      continue
    }

    const target = path.join(destDir, relative)

    if (!isInsideDir(target, destDir, platform)) {
      fs.rmSync(destDir, { recursive: true, force: true })

      return { ok: false, reason: 'path-escape' }
    }

    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, data)
  }

  const extension = readInstalledExtension(destDir, id)

  if (!extension) {
    fs.rmSync(destDir, { recursive: true, force: true })

    return { ok: false, reason: 'invalid-vsix' }
  }

  return { ok: true, extension }
}

export function readInstalledExtension(destDir: string, id: string): InstalledExtension | null {
  let manifest: Record<string, unknown>

  try {
    manifest = JSON.parse(fs.readFileSync(path.join(destDir, 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }

  if (codeExtensionFields(manifest).length > 0) {
    return null
  }

  const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0'

  return {
    id,
    version,
    ...(typeof manifest.displayName === 'string' ? { displayName: manifest.displayName } : {}),
    ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
    path: destDir,
    contributes: readContributes(manifest.contributes, destDir)
  }
}

function readContributes(value: unknown, root: string): ExtensionContributes {
  const contributes = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  return {
    themes: mapEntries(contributes.themes, item => themeEntry(item, root)),
    grammars: mapEntries(contributes.grammars, item => grammarEntry(item, root)),
    snippets: mapEntries(contributes.snippets, item => snippetEntry(item, root)),
    languages: mapEntries(contributes.languages, item => languageEntry(item, root))
  }
}

function themeEntry(item: Record<string, unknown>, root: string): ExtensionContributes['themes'][number] | null {
  const file = containedPath(root, item.path)

  if (!file || typeof item.label !== 'string') {
    return null
  }

  return {
    label: item.label,
    path: file,
    ...(typeof item.id === 'string' ? { id: item.id } : {}),
    ...(typeof item.uiTheme === 'string' ? { uiTheme: item.uiTheme } : {})
  }
}

function grammarEntry(item: Record<string, unknown>, root: string): ExtensionContributes['grammars'][number] | null {
  const file = containedPath(root, item.path)

  if (!file) {
    return null
  }

  return {
    path: file,
    ...(typeof item.scopeName === 'string' ? { scopeName: item.scopeName } : {}),
    ...(typeof item.language === 'string' ? { language: item.language } : {}),
    ...(item.embeddedLanguages && typeof item.embeddedLanguages === 'object'
      ? { embeddedLanguages: item.embeddedLanguages as Record<string, string> }
      : {})
  }
}

function snippetEntry(item: Record<string, unknown>, root: string): ExtensionContributes['snippets'][number] | null {
  const file = containedPath(root, item.path)

  if (!file) {
    return null
  }

  return {
    path: file,
    ...(typeof item.language === 'string' ? { language: item.language } : {})
  }
}

function languageEntry(item: Record<string, unknown>, root: string): ExtensionContributes['languages'][number] | null {
  if (typeof item.id !== 'string') {
    return null
  }

  const configuration = containedPath(root, item.configuration)

  return {
    id: item.id,
    ...(stringArray(item.aliases) ? { aliases: stringArray(item.aliases) } : {}),
    ...(stringArray(item.extensions) ? { extensions: stringArray(item.extensions) } : {}),
    ...(stringArray(item.filenames) ? { filenames: stringArray(item.filenames) } : {}),
    ...(configuration ? { configuration } : {})
  }
}

function containedPath(root: string, value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || zipEntryEscapes(value)) {
    return null
  }

  const target = path.resolve(root, value)

  if (!isInsideDir(target, root, process.platform)) {
    return null
  }

  return target
}

function mapEntries<T>(value: unknown, map: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) {
    return []
  }

  const out: T[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const mapped = map(item as Record<string, unknown>)

    if (mapped) {
      out.push(mapped)
    }
  }

  return out
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value.filter((item): item is string => typeof item === 'string')

  return items.length > 0 ? items : undefined
}

function extensionRelative(name: string): string | null {
  const normalized = name.replace(/\\/g, '/')

  if (!normalized.startsWith('extension/') || normalized.endsWith('/')) {
    return null
  }

  const relative = normalized.slice('extension/'.length)

  return relative && !zipEntryEscapes(relative) ? relative : null
}

function isExecutableEntry(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}
