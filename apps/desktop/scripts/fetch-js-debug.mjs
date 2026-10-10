// Build-time fetch of the vscode-js-debug DAP bundle into resources/js-debug/.
// The bundle ships in the installer (extraResources) so debugging works offline
// and NOTHING is downloaded at runtime. Never committed to the repo — this
// script is the only producer, and it is idempotent.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '1.140.0'
const URL = `https://github.com/microsoft/vscode-js-debug/releases/download/v${VERSION}/js-debug-dap-v${VERSION}.tar.gz`

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const resources = path.join(appRoot, 'resources')
const target = path.join(resources, 'js-debug')
const marker = path.join(target, 'src', 'dapDebugServer.js')

if (fs.existsSync(marker) && !process.argv.includes('--force')) {
  console.log(`js-debug v${VERSION} already bundled at ${target}`)
  process.exit(0)
}

console.log(`fetching js-debug v${VERSION} ...`)
const archive = path.join(resources, `js-debug-dap-v${VERSION}.tar.gz`)
fs.mkdirSync(resources, { recursive: true })
// curl, not fetch: it honours the system proxy and retries on flaky links —
// plain undici timed out on the very URL curl reaches fine.
execFileSync('curl', ['-fL', '--retry', '3', '--connect-timeout', '30', '-o', archive, URL], { stdio: 'inherit' })
fs.rmSync(target, { recursive: true, force: true })
// The tarball's top-level dir is `js-debug/`; extract straight into
// resources/. A basename-only arg (cwd = resources): GNU tar treats the colon
// in `E:\...` as a remote host.
execFileSync('tar', ['-xzf', path.basename(archive)], { cwd: resources, stdio: 'inherit' })
fs.rmSync(archive, { force: true })

if (!fs.existsSync(marker)) {
  console.error(`extracted but ${marker} is missing — unexpected archive layout`)
  process.exit(1)
}

console.log(`bundled js-debug v${VERSION} -> ${target}`)
