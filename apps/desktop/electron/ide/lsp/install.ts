import fs from 'node:fs'
import path from 'node:path'

import { installedMarkerMatches, installNpmPackages, type NpmInstallDeps } from '../npm-install'
import { LSP_SERVERS, type LspServerId, type LspServerSpec } from './catalog'

export interface PreparedLanguageServer {
  script: string
  args: string[]
  tsserverPath?: string
}

export async function prepareLanguageServer(
  id: LspServerId,
  destDir: string,
  deps: NpmInstallDeps = {}
): Promise<{ ok: true; prepared: PreparedLanguageServer } | { ok: false; reason: string }> {
  const spec = LSP_SERVERS[id]
  const cached = installedMarkerMatches(destDir, spec.packages)

  if (!cached) {
    const installed = await installNpmPackages(spec.packages, destDir, deps)

    if (installed.ok === false) {
      return installed
    }
  }

  const script = resolveBin(destDir, spec)

  if (!script) {
    return { ok: false, reason: 'server-entry-missing' }
  }

  const tsserverPath = path.join(destDir, 'node_modules', 'typescript', 'lib', 'tsserver.js')

  return {
    ok: true,
    prepared: {
      script,
      args: spec.args,
      ...(id === 'typescript-language-server' && fs.existsSync(tsserverPath) ? { tsserverPath } : {})
    }
  }
}

function resolveBin(destDir: string, spec: LspServerSpec): string | null {
  const pkgDir = path.join(destDir, 'node_modules', spec.binPackage)
  let manifest: { bin?: string | Record<string, string> }

  try {
    manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
      bin?: string | Record<string, string>
    }
  } catch {
    return null
  }

  const bin = manifest.bin
  const relative = typeof bin === 'string' ? bin : bin?.[spec.binName]

  if (!relative) {
    return null
  }

  const script = path.join(pkgDir, relative)

  return fs.existsSync(script) ? script : null
}
