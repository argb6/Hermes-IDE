import type {
  LspBridge,
  LspDidChangeRequest,
  LspDidCloseRequest,
  LspDidOpenRequest,
  LspRequest,
  LspRequestResult,
  LspStartRequest,
  LspStartResult,
  LspStatusQuery,
  LspStatusResult,
  LspStopRequest,
  LspSyncResult
} from '../../../electron/ide/contract'

import { noteLspStatus } from './ide-state'

const WAIT_MS = 200
const WAIT_LIMIT = 150

function bridge(): LspBridge | undefined {
  return window.hermesDesktop?.lsp
}

async function call<T>(run: (api: LspBridge) => Promise<T>, fallback: T): Promise<T> {
  const api = bridge()

  if (!api) {
    return fallback
  }

  try {
    return await run(api)
  } catch {
    return fallback
  }
}

function delay(ms: number) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms)
  })
}

function shouldWait(status: string | undefined, reason: string | undefined) {
  return reason === 'not-ready' || reason === 'restarting' || status === 'downloading'
}

async function waitUntilReady(language: string, workspaceRoot: string) {
  for (let attempt = 0; attempt < WAIT_LIMIT; attempt += 1) {
    const snapshot = await lspStatus({ language, workspaceRoot })
    const row = snapshot.languages.find(item => item.language === language)

    noteLspStatus(language, row?.status ?? 'unavailable')

    if (row?.status === 'ready') {
      return true
    }

    if (!shouldWait(row?.status, row?.reason)) {
      return false
    }

    await delay(WAIT_MS)
  }

  return false
}

async function afterReady<T extends { ok: boolean; reason?: string; status?: string }>(
  language: string,
  workspaceRoot: string,
  run: (api: LspBridge) => Promise<T>,
  fallback: T
): Promise<T> {
  const first = await call(run, fallback)

  if (first.ok || !shouldWait(first.status, first.reason)) {
    return first
  }

  if (!(await waitUntilReady(language, workspaceRoot))) {
    return first
  }

  return call(run, fallback)
}

export async function lspStart(request: LspStartRequest): Promise<LspStartResult> {
  const result = await call(api => api.start(request), {
    language: request.language,
    ok: false,
    reason: 'offline',
    status: 'unavailable'
  })

  noteLspStatus(request.language, result.status)

  return result
}

export function lspStop(request: LspStopRequest = {}): Promise<{ ok: boolean }> {
  return call(api => api.stop(request), { ok: false })
}

export function lspDidOpen(request: LspDidOpenRequest): Promise<LspSyncResult> {
  return afterReady(request.language, request.workspaceRoot, api => api.didOpen(request), {
    ok: false,
    reason: 'offline',
    status: 'unavailable'
  })
}

export function lspDidChange(request: LspDidChangeRequest): Promise<LspSyncResult> {
  return afterReady(request.language, request.workspaceRoot, api => api.didChange(request), {
    ok: false,
    reason: 'offline',
    status: 'unavailable'
  })
}

export function lspDidClose(request: LspDidCloseRequest): Promise<LspSyncResult> {
  return afterReady(request.language, request.workspaceRoot, api => api.didClose(request), {
    ok: false,
    reason: 'offline',
    status: 'unavailable'
  })
}

export async function lspRequest(request: LspRequest): Promise<unknown> {
  const response: LspRequestResult = await afterReady(
    request.language,
    request.workspaceRoot,
    api => api.request(request),
    { ok: false, reason: 'offline', status: 'unavailable' }
  )

  return response.ok ? (response.result ?? null) : null
}

export function lspStatus(query: LspStatusQuery = {}): Promise<LspStatusResult> {
  return call(api => api.status(query), { languages: [] })
}

export function onLspDiagnostics(cb: Parameters<LspBridge['onDiagnostics']>[0]) {
  return bridge()?.onDiagnostics(cb) ?? (() => undefined)
}
