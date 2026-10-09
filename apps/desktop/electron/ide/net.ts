// Bounded downloads for on-demand runtimes. Any failure — offline, HTTP, or
// oversize — is an error the caller turns into status `unavailable`. Nothing
// here is allowed to surface as an uncaught exception to the renderer.

export const HERMES_IDE_USER_AGENT = 'Hermes-IDE'

const OFFLINE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

export function isOfflineError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''

  if (OFFLINE_CODES.has(code)) {
    return true
  }

  const message = error instanceof Error ? error.message : String(error)

  return /offline|network|getaddrinfo|fetch failed|enotfound|econnrefused|timed out|timeout/i.test(message)
}

export function errorReason(error: unknown): string {
  if (isOfflineError(error)) {
    return 'offline'
  }

  const message = error instanceof Error ? error.message : String(error)

  return message.slice(0, 300) || 'download-failed'
}

export async function fetchBytes(
  url: string,
  maxBytes: number,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': HERMES_IDE_USER_AGENT, Accept: '*/*' }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }

  const advertised = Number(response.headers.get('content-length') || '0')

  if (advertised > maxBytes) {
    throw new Error('response exceeded the size limit')
  }

  const bytes = new Uint8Array(await response.arrayBuffer())

  if (bytes.byteLength > maxBytes) {
    throw new Error('response exceeded the size limit')
  }

  return bytes
}

export async function fetchJson<T>(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const bytes = await fetchBytes(url, 8 * 1024 * 1024, timeoutMs, fetchImpl)

  return JSON.parse(Buffer.from(bytes).toString('utf8')) as T
}
