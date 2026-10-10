// Stage the bundled language servers into dist/node_modules so the installer
// carries them (extraResources ships nothing here — they ride the app's
// node_modules whitelist). The workspace hoist leaves apps/desktop/node_modules
// empty, so they are copied from the repo root exactly like stage-ripgrep.mjs
// does, for the same createRequire(import.meta.url) lookup in
// electron/ide/lsp/install.ts. No runtime download — first use works offline.

import fs from 'node:fs'
import path from 'node:path'

// Keep in sync with LSP_SERVERS in electron/ide/lsp/catalog.ts.
const BUNDLED_SERVER_PACKAGES = ['pyright', 'typescript', 'typescript-language-server']

export function stageLspServers({ source, out }) {
  for (const name of BUNDLED_SERVER_PACKAGES) {
    const from = path.join(source, 'node_modules', name)
    const to = path.join(out, name)

    if (!fs.existsSync(from)) {
      throw new Error(`[stage-lsp-servers] ${name} not installed at ${from} — run npm install first`)
    }

    fs.rmSync(to, { recursive: true, force: true })
    fs.cpSync(from, to, { recursive: true })
    console.log(`[stage-lsp-servers] staged ${name} -> ${to}`)
  }
}
