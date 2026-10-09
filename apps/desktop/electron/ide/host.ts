// In-process seam. Electron IPC and the loopback agent bridge (bridge.ts)
// are callers of these objects; the processes live here. The Python tool
// talks to the bridge, which only uses this host, so it cannot spawn a
// second pyright or debugpy.

import type { DapManager } from './dap/manager'
import type { ExtensionStore } from './extensions/store'
import type { LspManager } from './lsp/manager'

export interface IdeIntelligenceHost {
  lsp: LspManager
  dap: DapManager
  extensions: ExtensionStore
}

let host: IdeIntelligenceHost | null = null

export function setIdeIntelligenceHost(next: IdeIntelligenceHost | null): void {
  host = next
}

export function getIdeIntelligenceHost(): IdeIntelligenceHost | null {
  return host
}
