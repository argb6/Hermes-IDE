// Language servers SHIP INSIDE the app (package.json dependencies) — nothing is
// downloaded at runtime. First use must work offline and must never run an npm
// install on the user's machine (a supply-chain and first-run-latency hazard).
// The pinned versions in ./catalog document what the installer packs.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { LSP_SERVERS, type LspServerId, type LspServerSpec } from './catalog'

const require_ = createRequire(import.meta.url)

export interface PreparedLanguageServer {
  script: string
  args: string[]
  tsserverPath?: string
}

/** Directory of a bundled package exactly as the installer packed it. */
function bundledPackageDir(name: string): string | null {
  try {
    return path.dirname(require_.resolve(`${name}/package.json`))
  } catch {
    return null
  }
}

export async function prepareLanguageServer(
  id: LspServerId,
  _installRoot?: string
): Promise<{ ok: true; prepared: PreparedLanguageServer } | { ok: false; reason: string }> {
  const spec = LSP_SERVERS[id]
  const pkgDir = bundledPackageDir(spec.binPackage)
  const script = pkgDir ? resolveBin(pkgDir, spec) : null

  if (!script) {
    return { ok: false, reason: 'server-not-bundled' }
  }

  let tsserverPath: string | undefined

  if (id === 'typescript-language-server') {
    try {
      tsserverPath = require_.resolve('typescript/lib/tsserver.js')
    } catch {
      tsserverPath = undefined
    }
  }

  return {
    ok: true,
    prepared: {
      script,
      args: spec.args,
      ...(tsserverPath ? { tsserverPath } : {})
    }
  }
}

function resolveBin(pkgDir: string, spec: LspServerSpec): string | null {
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

  return relative ? path.join(pkgDir, relative) : null
}
