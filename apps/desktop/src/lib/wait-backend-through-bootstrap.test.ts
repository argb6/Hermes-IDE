import { describe, expect, it, vi } from 'vitest'

import type { DesktopBootstrapEvent, DesktopBootstrapState } from '@/global'

import { waitBackendThroughBootstrap } from './wait-backend-through-bootstrap'
import { isTimeoutError } from './with-timeout'

function emptyState(overrides: Partial<DesktopBootstrapState> = {}): DesktopBootstrapState {
  return {
    active: false,
    bundled: false,
    completedAt: null,
    error: null,
    log: [],
    manifest: null,
    setupChoice: null,
    stages: {},
    startedAt: null,
    unsupportedPlatform: null,
    ...overrides
  }
}

describe('waitBackendThroughBootstrap', () => {
  it('applies the boot timeout when no bootstrap UI is present', async () => {
    vi.useFakeTimers()

    try {
      const listeners = new Set<(ev: DesktopBootstrapEvent) => void>()
      const desktop = {
        getBootstrapState: async () => emptyState(),
        onBootstrapEvent: (cb: (ev: DesktopBootstrapEvent) => void) => {
          listeners.add(cb)

          return () => listeners.delete(cb)
        }
      }

      const pending = waitBackendThroughBootstrap(new Promise<never>(() => undefined), desktop)
      const rejection = expect(pending).rejects.toSatisfy(isTimeoutError)

      await vi.advanceTimersByTimeAsync(180_000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not time out while bootstrap stages are running, then succeeds', async () => {
    vi.useFakeTimers()

    try {
      let emit: ((ev: DesktopBootstrapEvent) => void) | null = null
      let resolveConn: ((value: { ok: true }) => void) | null = null
      const connection = new Promise<{ ok: true }>(resolve => {
        resolveConn = resolve
      })

      const desktop = {
        getBootstrapState: async () => emptyState(),
        onBootstrapEvent: (cb: (ev: DesktopBootstrapEvent) => void) => {
          emit = cb

          return () => {
            emit = null
          }
        }
      }

      const pending = waitBackendThroughBootstrap(connection, desktop)

      emit?.({ type: 'manifest', stages: [], protocolVersion: 1 })
      await vi.advanceTimersByTimeAsync(300_000)
      emit?.({ type: 'complete', marker: {} })
      resolveConn?.({ ok: true })

      await expect(pending).resolves.toEqual({ ok: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects immediately on bootstrap failed without waiting for the boot timeout', async () => {
    vi.useFakeTimers()

    try {
      let emit: ((ev: DesktopBootstrapEvent) => void) | null = null
      const desktop = {
        getBootstrapState: async () => emptyState({ active: true }),
        onBootstrapEvent: (cb: (ev: DesktopBootstrapEvent) => void) => {
          emit = cb

          return () => {
            emit = null
          }
        }
      }

      const pending = waitBackendThroughBootstrap(new Promise<never>(() => undefined), desktop)
      emit?.({ type: 'failed', stage: 'venv', error: 'uv sync failed' })

      await expect(pending).rejects.toThrow('uv sync failed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('pauses the timer while the first-run setup choice is open', async () => {
    vi.useFakeTimers()

    try {
      let emit: ((ev: DesktopBootstrapEvent) => void) | null = null
      let resolveConn: ((value: { ok: true }) => void) | null = null
      const connection = new Promise<{ ok: true }>(resolve => {
        resolveConn = resolve
      })

      const desktop = {
        getBootstrapState: async () =>
          emptyState({
            setupChoice: {
              activeRoot: 'D:\\hermes\\hermes-agent',
              bundled: false,
              local: 'none',
              platform: 'win32'
            }
          }),
        onBootstrapEvent: (cb: (ev: DesktopBootstrapEvent) => void) => {
          emit = cb

          return () => {
            emit = null
          }
        }
      }

      const pending = waitBackendThroughBootstrap(connection, desktop)
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(300_000)

      emit?.({ type: 'setup-choice', active: false })
      resolveConn?.({ ok: true })

      await expect(pending).resolves.toEqual({ ok: true })
    } finally {
      vi.useRealTimers()
    }
  })
})
