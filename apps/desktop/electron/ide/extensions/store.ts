import fs from 'node:fs'
import path from 'node:path'

import type {
  ExtensionInstallResult,
  ExtensionListResult,
  ExtensionSearchResult,
  ExtensionUninstallResult
} from '../contract'
import { hermesIdeDataRoot, isInsideDir, resolveRuntimeDir } from '../paths'
import { downloadOpenVsix, searchOpenVsx, splitExtensionId, type OpenVsxQuery } from './openvsx'
import { readInstalledExtension, unpackExtension } from './vsix'

export interface ExtensionStoreDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  installRoots: string[]
  fetchImpl?: typeof fetch
}

export class ExtensionStore {
  constructor(private readonly deps: ExtensionStoreDeps) {}

  async search(query: OpenVsxQuery): Promise<ExtensionSearchResult> {
    const result = await searchOpenVsx(query, this.deps.fetchImpl)

    if (result.ok === false) {
      return { ok: false, status: 'unavailable', reason: result.reason }
    }

    return { ok: true, extensions: result.extensions, total: result.total }
  }

  async install(id: string, version?: string): Promise<ExtensionInstallResult> {
    const parsed = splitExtensionId(id)

    if (!parsed) {
      return { ok: false, status: 'unavailable', reason: 'invalid-id' }
    }

    const located = resolveRuntimeDir({
      ...this.deps,
      kind: 'extensions',
      name: `${parsed.namespace}.${parsed.name}`
    })

    if (located.ok === false) {
      return { ok: false, status: 'unavailable', reason: located.reason }
    }

    const downloaded = await downloadOpenVsix(id, version, this.deps.fetchImpl)

    if (downloaded.ok === false) {
      return { ok: false, status: 'unavailable', reason: downloaded.reason }
    }

    const unpacked = unpackExtension(downloaded.bytes, located.dir, `${parsed.namespace}.${parsed.name}`, this.deps.platform)

    if (unpacked.ok === false) {
      const status = unpacked.reason === 'code-extension' ? 'rejected' : 'unavailable'

      return {
        ok: false,
        status,
        reason: unpacked.reason,
        ...(unpacked.fields ? { fields: unpacked.fields } : {})
      }
    }

    return { ok: true, extension: unpacked.extension }
  }

  uninstall(id: string): ExtensionUninstallResult {
    const dir = this.directoryFor(id)

    if (!dir) {
      return { ok: false, reason: 'invalid-id' }
    }

    if (!fs.existsSync(dir)) {
      return { ok: true }
    }

    fs.rmSync(dir, { recursive: true, force: true })

    return { ok: true }
  }

  list(): ExtensionListResult {
    const root = this.extensionsRoot()

    if (!root || !fs.existsSync(root)) {
      return { ok: true, extensions: [] }
    }

    const extensions = []

    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name)
      const extension = readInstalledExtension(dir, name)

      if (extension) {
        extensions.push(extension)
      }
    }

    return { ok: true, extensions }
  }

  private directoryFor(id: string): string | null {
    const parsed = splitExtensionId(id)

    if (!parsed) {
      return null
    }

    const located = resolveRuntimeDir({
      ...this.deps,
      kind: 'extensions',
      name: `${parsed.namespace}.${parsed.name}`
    })

    return located.ok ? located.dir : null
  }

  private extensionsRoot(): string | null {
    const root = hermesIdeDataRoot(this.deps)
    const dir = path.join(root, 'extensions')

    if (this.deps.installRoots.some(install => install && isInsideDir(dir, install, this.deps.platform))) {
      return null
    }

    return dir
  }
}
