import type {
  ExtensionInstallResult,
  ExtensionListResult,
  ExtensionSearchResult,
  ExtensionUninstallResult,
  ExtBridge
} from '../../../electron/ide/contract'

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
