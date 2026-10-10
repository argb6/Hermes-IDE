import { errorReason, fetchBytes, fetchJson } from '../net'
import type { ExtensionSearchHit } from '../contract'

const OPEN_VSX = 'https://open-vsx.org'

export interface OpenVsxQuery {
  query?: string
  size?: number
  offset?: number
}

interface SearchResponse {
  totalSize?: number
  extensions?: Array<Record<string, unknown>>
}

interface VersionResponse {
  namespace?: string
  name?: string
  version?: string
  files?: { download?: string }
}

export async function searchOpenVsx(
  query: OpenVsxQuery,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; extensions: ExtensionSearchHit[]; total: number } | { ok: false; reason: string }> {
  const size = clamp(query.size, 20, 1, 50)
  const offset = Math.max(0, query.offset ?? 0)
  const url = `${OPEN_VSX}/api/-/search?query=${encodeURIComponent(query.query || '')}&size=${size}&offset=${offset}`

  try {
    const body = await fetchJson<SearchResponse>(url, 20_000, fetchImpl)
    const extensions = (body.extensions ?? []).map(hitFrom).filter((hit): hit is ExtensionSearchHit => hit !== null)

    return { ok: true, extensions, total: body.totalSize ?? extensions.length }
  } catch (error) {
    return { ok: false, reason: errorReason(error) }
  }
}

export async function downloadOpenVsix(
  id: string,
  version: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; bytes: Uint8Array; version: string } | { ok: false; reason: string }> {
  const parsed = splitExtensionId(id)

  if (!parsed) {
    return { ok: false, reason: 'invalid-id' }
  }

  const versionPath = version ? `/${encodeURIComponent(version)}` : ''
  const url = `${OPEN_VSX}/api/${encodeURIComponent(parsed.namespace)}/${encodeURIComponent(parsed.name)}${versionPath}`

  try {
    const meta = await fetchJson<VersionResponse>(url, 20_000, fetchImpl)
    const download = meta.files?.download

    if (!download) {
      return { ok: false, reason: 'no-download' }
    }

    const bytes = await fetchBytes(download, 40 * 1024 * 1024, 60_000, fetchImpl)

    return { ok: true, bytes, version: meta.version || version || '0.0.0' }
  } catch (error) {
    return { ok: false, reason: errorReason(error) }
  }
}

export function splitExtensionId(id: string): { namespace: string; name: string } | null {
  const match = /^([A-Za-z0-9][A-Za-z0-9-]*)\.([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(id.trim())

  if (!match) {
    return null
  }

  return { namespace: match[1], name: match[2] }
}

function hitFrom(raw: Record<string, unknown>): ExtensionSearchHit | null {
  const namespace = typeof raw.namespace === 'string' ? raw.namespace : ''
  const name = typeof raw.name === 'string' ? raw.name : ''

  if (!namespace || !name) {
    return null
  }

  return {
    id: `${namespace}.${name}`,
    namespace,
    name,
    version: typeof raw.version === 'string' ? raw.version : '',
    ...(typeof raw.displayName === 'string' ? { displayName: raw.displayName } : {}),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(typeof raw.downloadCount === 'number' ? { downloadCount: raw.downloadCount } : {}),
    ...iconUrlField(raw.files)
  }
}

/** Open VSX lists the asset URLs under `files`; `icon` is the display icon. */
function iconUrlField(files: unknown): { iconUrl?: string } {
  const icon = isRecord(files) && typeof files.icon === 'string' ? files.icon : ''

  return icon ? { iconUrl: icon } : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  const numeric = value ?? fallback

  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.floor(numeric)))
}
