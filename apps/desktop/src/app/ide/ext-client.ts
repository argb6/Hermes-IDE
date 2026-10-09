import type { ExtBridge, InstalledExtension } from './ipc-types'

function bridge(): ExtBridge | undefined {
  return window.hermesDesktop?.ext
}

export async function extSearch(query: string) {
  try {
    return (await bridge()?.search(query)) ?? { extensions: [] }
  } catch {
    return { extensions: [], unavailable: true as const }
  }
}

export async function extList(): Promise<{ extensions: InstalledExtension[]; unavailable?: boolean }> {
  try {
    return (await bridge()?.list()) ?? { extensions: [] }
  } catch {
    return { extensions: [], unavailable: true }
  }
}

export async function extInstall(id: string) {
  try {
    return (await bridge()?.install(id)) ?? { state: 'unavailable' as const }
  } catch {
    return { state: 'unavailable' as const }
  }
}

export async function extUninstall(id: string) {
  try {
    return (await bridge()?.uninstall(id)) ?? { ok: false }
  } catch {
    return { ok: false }
  }
}
