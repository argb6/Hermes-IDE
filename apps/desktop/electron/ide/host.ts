// In-process seam for a later Hermes tool. Electron IPC is a caller of these
// objects; the processes live here. A Python tool should talk to this host
// (or a future loopback in front of it) instead of spawning a second pyright
// or debugpy.

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
