/**
 * Await initial getConnection() without falsely timing out while first-launch
 * install UI is up (setup choice or install.ps1 stages). The 180s boot budget
 * still applies when no install UI is blocking — and again after bootstrap
 * completes, for the remaining spawn/ready wait.
 *
 * withTimeout alone wraps the whole IPC (including a multi-minute venv sync)
 * and rejects without cancelling main; the UI then shows "Timed out…" while
 * install.ps1 keeps running.
 */

import type { DesktopBootstrapEvent, DesktopBootstrapState } from '@/global'

import { BACKEND_BOOT_WAIT_TIMEOUT_MS, TimeoutError, withTimeout } from './with-timeout'

export interface BootstrapAwareDesktop {
  getBootstrapState?: () => Promise<DesktopBootstrapState>
  onBootstrapEvent?: (callback: (payload: DesktopBootstrapEvent) => void) => () => void
}

function installUiBlocking(
  state: Pick<DesktopBootstrapState, 'active' | 'setupChoice'> | null | undefined
): boolean {
  return Boolean(state?.active || state?.setupChoice)
}

export async function waitBackendThroughBootstrap<T>(
  connection: Promise<T>,
  desktop: BootstrapAwareDesktop | null | undefined,
  options?: {
    timeoutMs?: number
    timeoutMessage?: string
  }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? BACKEND_BOOT_WAIT_TIMEOUT_MS
  const timeoutMessage = options?.timeoutMessage ?? 'Timed out connecting to Hermes backend'

  if (!desktop?.onBootstrapEvent && typeof desktop?.getBootstrapState !== 'function') {
    return withTimeout(connection, timeoutMs, timeoutMessage)
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let blocking = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const settle = (finish: () => void) => {
      if (settled) {
        return
      }

      settled = true

      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      off?.()
      finish()
    }

    const armTimer = () => {
      if (settled || blocking) {
        return
      }

      if (timer) {
        clearTimeout(timer)
      }

      timer = setTimeout(() => {
        settle(() => reject(new TimeoutError(timeoutMessage)))
      }, timeoutMs)
    }

    const setBlocking = (next: boolean) => {
      if (blocking === next) {
        return
      }

      blocking = next

      if (blocking) {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }

        return
      }

      armTimer()
    }

    const off = desktop.onBootstrapEvent?.(ev => {
      if (ev.type === 'manifest') {
        setBlocking(true)

        return
      }

      if (ev.type === 'setup-choice') {
        setBlocking(Boolean(ev.active))

        return
      }

      if (ev.type === 'complete' || ev.type === 'dismissed' || ev.type === 'unsupported-platform') {
        setBlocking(false)

        return
      }

      if (ev.type === 'failed') {
        settle(() => reject(new Error(ev.error || 'Hermes install failed')))
      }
    })

    void desktop
      .getBootstrapState?.()
      .then(state => {
        if (settled) {
          return
        }

        if (installUiBlocking(state)) {
          setBlocking(true)
        }
      })
      .catch(() => undefined)

    armTimer()

    Promise.resolve(connection).then(
      value => settle(() => resolve(value)),
      err => settle(() => reject(err))
    )
  })
}
