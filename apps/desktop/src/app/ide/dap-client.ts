import type { DapAdapter, DapBridge, DapSendRequest, DapSendResult, DapStartRequest, DapStartResult, DapStopRequest } from '../../../electron/ide/contract'

const OFFLINE_START: DapStartResult = { ok: false, reason: 'offline', status: 'unavailable' }

function bridge(): DapBridge | undefined {
  return window.hermesDesktop?.dap
}

export function dapStart(request: DapStartRequest): Promise<DapStartResult> {
  const api = bridge()

  if (!api) {
    return Promise.resolve(OFFLINE_START)
  }

  return api.start(request).catch(() => OFFLINE_START)
}

export function dapSend(request: DapSendRequest): Promise<DapSendResult> {
  const api = bridge()

  if (!api) {
    return Promise.resolve({ ok: false, reason: 'offline', status: 'unavailable' })
  }

  return api.send(request).catch(() => ({ ok: false, reason: 'offline', status: 'unavailable' }))
}

export function dapStop(request: DapStopRequest = {}) {
  return bridge()?.stop(request).catch(() => ({ ok: false })) ?? Promise.resolve({ ok: false })
}

export function onDapEvent(cb: Parameters<DapBridge['onEvent']>[0]) {
  return bridge()?.onEvent(cb) ?? (() => undefined)
}

/** DAP `launch` arguments. `pythonPath` is the interpreter `dap:start` spawned debugpy with. */
export function dapLaunchArguments(options: {
  adapter: DapAdapter
  cwd: string
  noDebug?: boolean
  program: string
  pythonPath?: string
}): Record<string, unknown> {
  return {
    cwd: options.cwd,
    program: options.program,
    request: 'launch',
    stopOnEntry: false,
    ...(options.noDebug ? { noDebug: true } : {}),
    ...(options.adapter === 'python' && options.pythonPath
      ? { console: 'internalConsole', justMyCode: true, python: options.pythonPath }
      : { console: 'internalConsole' })
  }
}
