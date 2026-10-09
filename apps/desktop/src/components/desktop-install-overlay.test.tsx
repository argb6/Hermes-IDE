// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopBootstrapEvent, DesktopBootstrapState } from '@/global'

import { DesktopInstallOverlay } from './desktop-install-overlay'

function bootstrapState(overrides: Partial<DesktopBootstrapState> = {}): DesktopBootstrapState {
  return {
    active: false,
    manifest: null,
    stages: {},
    error: null,
    log: [],
    startedAt: null,
    completedAt: null,
    setupChoice: null,
    unsupportedPlatform: null,
    bundled: false,
    ...overrides
  }
}

function installDesktopMock(state: DesktopBootstrapState) {
  const bootstrapListeners = new Set<(event: DesktopBootstrapEvent) => void>()

  const desktop = {
    getBootstrapState: vi.fn().mockResolvedValue(state),
    onBootstrapEvent: vi.fn((listener: (event: DesktopBootstrapEvent) => void) => {
      bootstrapListeners.add(listener)

      return () => bootstrapListeners.delete(listener)
    }),
    continueBootstrapLocal: vi.fn().mockResolvedValue({ ok: true }),
    resetBootstrap: vi.fn().mockResolvedValue({ ok: true }),
    probeConnectionConfig: vi.fn(),
    testConnectionConfig: vi.fn(),
    applyConnectionConfig: vi.fn(),
    oauthLoginConnectionConfig: vi.fn(),
    openExternal: vi.fn(),
    emitBootstrapEvent: (event: DesktopBootstrapEvent) => {
      for (const listener of bootstrapListeners) {
        listener(event)
      }
    }
  }

  Object.defineProperty(window, 'hermesDesktop', {
    configurable: true,
    value: desktop
  })

  return desktop
}

// Resolve the instant a node commits, via MutationObserver rather than
// waitFor's polling timer. findBy* only settles on a timer tick, by which
// point React has already drained its passive effects — that hides any bug
// living in the window between paint and effect.
function whenPresent(text: string): Promise<HTMLElement> {
  return new Promise(resolve => {
    const existing = screen.queryByText(text)

    if (existing) {
      resolve(existing)

      return
    }

    const observer = new MutationObserver(() => {
      const node = screen.queryByText(text)

      if (node) {
        observer.disconnect()
        resolve(node)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('DesktopInstallOverlay first-run setup', () => {
  it('shows the local-install choice without installer progress', async () => {
    installDesktopMock(
      bootstrapState({
        setupChoice: {
          platform: 'win32',
          activeRoot: 'C:\\Users\\me\\AppData\\Local\\hermes\\hermes-agent',
          local: 'none',
          bundled: false
        }
      })
    )

    render(<DesktopInstallOverlay />)

    expect(await screen.findByText('Set up Hermes Desktop')).toBeTruthy()
    expect(screen.queryByText('Connect to existing Hermes')).toBeNull()
    expect(screen.getByText('Install Hermes locally')).toBeTruthy()
    expect(screen.getByText(/Will install to/i)).toBeTruthy()
    expect(screen.queryByText(/steps complete/i)).toBeNull()
    expect(screen.queryByText(/Fetching installer manifest/i)).toBeNull()
  })

  it('auto-starts local bootstrap when the setup choice appears', async () => {
    const desktop = installDesktopMock(
      bootstrapState({
        setupChoice: {
          platform: 'win32',
          activeRoot: 'C:\\Users\\me\\AppData\\Local\\hermes\\hermes-agent',
          local: 'none',
          bundled: false
        }
      })
    )

    render(<DesktopInstallOverlay />)

    await waitFor(() => expect(desktop.continueBootstrapLocal).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Set up Hermes Desktop')).toBeTruthy()

    act(() => {
      desktop.emitBootstrapEvent({ type: 'manifest', protocolVersion: 1, stages: [] })
    })

    await waitFor(() => expect(screen.queryByText('Set up Hermes Desktop')).toBeNull())
    expect(screen.getByText(/Fetching installer manifest/i)).toBeTruthy()
  })

  it('surfaces a recoverable error when the local-bootstrap bridge is unavailable', async () => {
    const desktop = installDesktopMock(
      bootstrapState({
        setupChoice: {
          platform: 'win32',
          activeRoot: 'C:\\Users\\me\\AppData\\Local\\hermes\\hermes-agent',
          local: 'none',
          bundled: false
        }
      })
    )

    desktop.continueBootstrapLocal = undefined as never
    render(<DesktopInstallOverlay />)

    expect(
      await screen.findByText('Local installation could not start. Restart Hermes Desktop and try again.')
    ).toBeTruthy()
    const install = (await screen.findByText('Install Hermes locally')).closest('button') as HTMLButtonElement
    expect(install.disabled).toBe(false)
  })

  it('keeps the local-start error when the first snapshot commits under the click', async () => {
    const desktop = installDesktopMock(
      bootstrapState({
        setupChoice: {
          platform: 'win32',
          activeRoot: 'C:\\Users\\me\\AppData\\Local\\hermes\\hermes-agent',
          local: 'none',
          bundled: false
        }
      })
    )

    desktop.continueBootstrapLocal = undefined as never
    render(<DesktopInstallOverlay />)

    // Auto-start (or a manual click) can race the first snapshot commit; the
    // error must still stick for the active root.
    const install = (await whenPresent('Install Hermes locally')).closest('button') as HTMLButtonElement
    fireEvent.click(install)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByText('Local installation could not start. Restart Hermes Desktop and try again.')).toBeTruthy()
  })

  it('clears a stale local-start error when a repair presents a different root', async () => {
    const desktop = installDesktopMock(
      bootstrapState({
        setupChoice: {
          platform: 'win32',
          activeRoot: 'C:\\Users\\me\\AppData\\Local\\hermes\\hermes-agent',
          local: 'none',
          bundled: false
        }
      })
    )

    desktop.continueBootstrapLocal = undefined as never
    render(<DesktopInstallOverlay />)

    fireEvent.click((await screen.findByText('Install Hermes locally')).closest('button') as HTMLButtonElement)
    expect(
      await screen.findByText('Local installation could not start. Restart Hermes Desktop and try again.')
    ).toBeTruthy()

    act(() => {
      desktop.emitBootstrapEvent({
        type: 'setup-choice',
        active: false,
        platform: 'win32',
        activeRoot: 'C:\\Users\\me\\AppData\\Local\\hermes\\hermes-agent-repaired'
      })
    })

    expect(screen.queryByText('Local installation could not start. Restart Hermes Desktop and try again.')).toBeNull()
  })

  it('shows the unsupported packaged install screen without a remote connect escape hatch', async () => {
    installDesktopMock(
      bootstrapState({
        unsupportedPlatform: {
          platform: 'darwin',
          activeRoot: '/Users/me/.hermes/hermes-agent',
          installCommand: 'curl -fsSL https://example.invalid/install.sh | sh',
          docsUrl: 'https://example.invalid/docs'
        }
      })
    )

    render(<DesktopInstallOverlay />)

    expect(await screen.findByText('Hermes needs a one-time install')).toBeTruthy()
    expect(screen.queryByText('Connect existing')).toBeNull()
    expect(screen.getByText('I’ve run it -- retry')).toBeTruthy()
  })

  it('dismisses a cancelled/failed install via the footer Close button, without reloading or resetting bootstrap', async () => {
    const desktop = installDesktopMock(bootstrapState({ error: 'cancelled by user' }))

    render(<DesktopInstallOverlay />)

    expect(await screen.findByText('Installation failed')).toBeTruthy()

    fireEvent.click(screen.getByText('Close'))

    await waitFor(() => expect(screen.queryByText('Installation failed')).toBeNull())
    expect(desktop.resetBootstrap).not.toHaveBeenCalled()
  })

  it('dismisses a failed install on Escape', async () => {
    installDesktopMock(bootstrapState({ error: 'cancelled by user' }))

    render(<DesktopInstallOverlay />)

    expect(await screen.findByText('Installation failed')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByText('Installation failed')).toBeNull())
  })
})

it.each([
  ['installed', false, 'Use Hermes on this computer', /already installed here/i, false],
  ['bundled', true, 'Use Hermes on this computer', /included with this app/i, false],
  [undefined, false, 'Install Hermes locally', /Will install to/i, true]
] as const)(
  'local presentation for %s (including old backends)',
  async (
    local: 'installed' | 'bundled' | undefined,
    bundled: boolean,
    title: string,
    description: RegExp,
    footer: boolean
  ): Promise<void> => {
    const state: DesktopBootstrapState = bootstrapState({
      setupChoice: { platform: 'win32', activeRoot: 'C:\\Hermes', local: local ?? 'none', bundled }
    })

    if (local === undefined && state.setupChoice) {
      Reflect.deleteProperty(state.setupChoice, 'local')
    }

    installDesktopMock(state)
    render(<DesktopInstallOverlay />)
    expect(await screen.findByText(title)).toBeTruthy()
    expect(screen.getByText(description)).toBeTruthy()
    expect(screen.queryByText(/Will install to/i) !== null).toBe(footer)

    if (!footer) {
      expect(screen.queryByText('Install Hermes locally')).toBeNull()
    }
  }
)
