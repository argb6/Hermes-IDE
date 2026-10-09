import type { LspBridge, LspRequest, LspState, LspTarget, LspTextDocument } from './ipc-types'

const OFFLINE: { state: LspState } = { state: 'unavailable' }

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

export function lspStart(target: LspTarget) {
  return call(api => api.start(target), OFFLINE)
}

export function lspStop(target: LspTarget) {
  return call(api => api.stop(target), { ok: false })
}

export function lspDidOpen(doc: LspTextDocument) {
  return call(api => api.didOpen(doc), { ok: false })
}

export function lspDidChange(doc: LspTextDocument) {
  return call(api => api.didChange(doc), { ok: false })
}

export function lspDidClose(doc: Pick<LspTextDocument, 'languageId' | 'rootPath' | 'uri'>) {
  return call(api => api.didClose(doc), { ok: false })
}

export function lspRequest(request: LspRequest) {
  return call(api => api.request(request), null)
}

export function lspStatus(target: LspTarget) {
  return call(api => api.status(target), OFFLINE)
}

export function onLspDiagnostics(cb: Parameters<LspBridge['onDiagnostics']>[0]) {
  return bridge()?.onDiagnostics(cb) ?? (() => undefined)
}

export function onLspStatus(cb: Parameters<LspBridge['onStatus']>[0]) {
  return bridge()?.onStatus(cb) ?? (() => undefined)
}
