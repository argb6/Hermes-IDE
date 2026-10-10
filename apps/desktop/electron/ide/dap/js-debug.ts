// The vscode-js-debug DAP bundle SHIPS INSIDE the installer (extraResources
// `js-debug/`, fetched at build time by scripts/fetch-js-debug.mjs and never
// committed to the repo). Nothing is downloaded at runtime: debugging works
// offline and first use cannot hit the network.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export const JS_DEBUG_VERSION = '1.140.0'

const require_ = createRequire(import.meta.url)

export function jsDebugServerScript(root: string): string {
  return path.join(root, 'js-debug', 'src', 'dapDebugServer.js')
}

/** Installer resources dir in a packaged build; the package root in dev. */
function bundledRoots(): string[] {
  const roots: string[] = []
  const resources = (process as { resourcesPath?: string }).resourcesPath

  if (typeof resources === 'string') {
    roots.push(resources)
  }

  try {
    // Required lazily: under plain Node (tests) `electron` resolves to a path
    // string, and `app` only exists in the main process.
    const electron = require_('electron') as { app?: { getAppPath?: () => string } }
    const appPath = electron.app?.getAppPath?.()

    if (appPath) {
      roots.push(appPath)
    }
  } catch {
    // Not running under Electron — injected paths cover tests.
  }

  return roots
}

export async function prepareJsDebug(
  destDir: string
): Promise<{ ok: true; script: string } | { ok: false; reason: string }> {
  for (const root of [...bundledRoots(), destDir]) {
    const script = jsDebugServerScript(root)

    if (fs.existsSync(script)) {
      return { ok: true, script }
    }
  }

  return { ok: false, reason: 'js-debug-not-bundled' }
}
