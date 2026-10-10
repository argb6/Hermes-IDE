import type {
  ExtBridge,
  ExtensionContributes,
  ExtensionInstallResult,
  ExtensionListResult,
  ExtensionSearchResult,
  ExtensionUninstallResult
} from '../../../electron/ide/contract'

/** One row of the extensions panel — a search hit or an installed extension
 *  flattened to what the list and the detail view render. */
export interface ExtensionRow {
  contributes?: ExtensionContributes
  description: string
  downloadCount?: number
  iconUrl?: string
  id: string
  installed: boolean
  publisher: string
  title: string
  version: string
}

function bridge(): ExtBridge | undefined {
  return window.hermesDesktop?.ext
}

export async function extSearch(query: string): Promise<ExtensionSearchResult> {
  try {
    return (await bridge()?.search({ query })) ?? { extensions: [], ok: false, reason: 'offline', status: 'unavailable' }
  } catch {
    return { extensions: [], ok: false, reason: 'offline', status: 'unavailable' }
  }
}

export async function extList(): Promise<ExtensionListResult> {
  try {
    return (await bridge()?.list()) ?? { extensions: [], ok: false }
  } catch {
    return { extensions: [], ok: false }
  }
}

export async function extInstall(id: string): Promise<ExtensionInstallResult> {
  try {
    return (await bridge()?.install({ id })) ?? { ok: false, reason: 'offline', status: 'unavailable' }
  } catch {
    return { ok: false, reason: 'offline', status: 'unavailable' }
  }
}

export async function extUninstall(id: string): Promise<ExtensionUninstallResult> {
  try {
    return (await bridge()?.uninstall({ id })) ?? { ok: false }
  } catch {
    return { ok: false }
  }
}
