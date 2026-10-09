import type { DapBridge, DapLaunch, DapMessage, DapResponse, DapStartResult } from './ipc-types'

const OFFLINE: DapStartResult = { state: 'unavailable' }

function bridge(): DapBridge | undefined {
  return window.hermesDesktop?.dap
}

export function dapStart(launch: DapLaunch) {
  const api = bridge()

  if (!api) {
    return Promise.resolve(OFFLINE)
  }

  return api.start(launch).catch(() => OFFLINE)
}

export function dapSend(message: DapMessage): Promise<DapResponse> {
  const api = bridge()

  if (!api) {
    return Promise.resolve({ message: 'unavailable', success: false })
  }

  return api.send(message).catch(() => ({ message: 'unavailable', success: false }))
}

export function dapStop(sessionId: string) {
  return bridge()?.stop(sessionId).catch(() => ({ ok: false })) ?? Promise.resolve({ ok: false })
}

export function onDapEvent(cb: Parameters<DapBridge['onEvent']>[0]) {
  return bridge()?.onEvent(cb) ?? (() => undefined)
}
