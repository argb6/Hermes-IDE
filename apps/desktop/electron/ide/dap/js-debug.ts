import fs from 'node:fs'
import path from 'node:path'

import { extractTar, gunzip } from '../archive'
import { errorReason, fetchBytes } from '../net'

export const JS_DEBUG_VERSION = '1.140.0'

export function jsDebugArchiveUrl(version: string = JS_DEBUG_VERSION): string {
  return `https://github.com/microsoft/vscode-js-debug/releases/download/v${version}/js-debug-dap-v${version}.tar.gz`
}

export function jsDebugServerScript(destDir: string): string {
  return path.join(destDir, 'js-debug', 'src', 'dapDebugServer.js')
}

export async function prepareJsDebug(
  destDir: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; script: string } | { ok: false; reason: string }> {
  const script = jsDebugServerScript(destDir)

  if (!fs.existsSync(script)) {
    try {
      const bytes = await fetchBytes(jsDebugArchiveUrl(), 80 * 1024 * 1024, 60_000, fetchImpl)

      fs.mkdirSync(destDir, { recursive: true })
      extractTar(gunzip(bytes), { dest: destDir, strip: 0 })
    } catch (error) {
      return { ok: false, reason: errorReason(error) }
    }
  }

  if (!fs.existsSync(script)) {
    return { ok: false, reason: 'js-debug-entry-missing' }
  }

  return { ok: true, script }
}
