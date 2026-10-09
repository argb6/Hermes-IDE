import fs from 'node:fs'
import path from 'node:path'

import { afterAll, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn((channel: string, payload?: unknown) => ({ channel, payload })),
  on: vi.fn(),
  removeListener: vi.fn(),
  sendSync: vi.fn(() => ({}))
}))

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getPath: () => '/tmp',
    getAppPath: () => '/tmp/app',
    isPackaged: true
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      electron.handlers.set(channel, handler)
    }
  },
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
    send: vi.fn(),
    sendSync: electron.sendSync
  },
  webFrame: {},
  webUtils: {}
}))

const PUSH = new Set(['lsp:diagnostics', 'dap:event'])

function channelsInContract(): string[] {
  const doc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'IPC.md'), 'utf8')
  const found = doc.match(/\b(?:lsp|dap|ext):[A-Za-z]+/g) ?? []

  return [...new Set(found)].sort()
}

it('registers every invoke channel named in IPC.md', async () => {
  const { registerIdeIpc } = await import('./ipc')

  registerIdeIpc()
  const documented = channelsInContract()
  const invoke = documented.filter(channel => !PUSH.has(channel))

  expect(invoke.length).toBeGreaterThan(0)

  for (const channel of invoke) {
    expect(electron.handlers.has(channel), channel).toBe(true)
  }

  const registered = [...electron.handlers.keys()].filter(channel => /^(lsp|dap|ext):/.test(channel)).sort()

  expect(registered).toEqual(invoke)
})

it('exposes preload methods that invoke the same channels', async () => {
  await import('../preload')
  const registration = electron.exposeInMainWorld.mock.calls.find(([name]) => name === 'hermesDesktop')
  const bridge = registration?.[1] as {
    lsp: Record<string, (payload?: unknown) => unknown>
    dap: Record<string, (payload?: unknown) => unknown>
    ext: Record<string, (payload?: unknown) => unknown>
  }

  const pairs: Array<[() => unknown, string]> = [
    [() => bridge.lsp.start({}), 'lsp:start'],
    [() => bridge.lsp.stop({}), 'lsp:stop'],
    [() => bridge.lsp.didOpen({}), 'lsp:didOpen'],
    [() => bridge.lsp.didChange({}), 'lsp:didChange'],
    [() => bridge.lsp.didClose({}), 'lsp:didClose'],
    [() => bridge.lsp.request({}), 'lsp:request'],
    [() => bridge.lsp.status({}), 'lsp:status'],
    [() => bridge.dap.start({}), 'dap:start'],
    [() => bridge.dap.send({}), 'dap:send'],
    [() => bridge.dap.stop({}), 'dap:stop'],
    [() => bridge.dap.status(), 'dap:status'],
    [() => bridge.ext.search({}), 'ext:search'],
    [() => bridge.ext.install({}), 'ext:install'],
    [() => bridge.ext.uninstall({}), 'ext:uninstall'],
    [() => bridge.ext.list(), 'ext:list']
  ]

  for (const [call, channel] of pairs) {
    call()
    const calls = electron.invoke.mock.calls.filter(([name]) => name === channel)

    expect(calls.length, channel).toBeGreaterThan(0)
  }

  const unsubscribe = bridge.lsp.onDiagnostics(() => undefined) as () => void

  expect(electron.on).toHaveBeenCalledWith('lsp:diagnostics', expect.any(Function))
  unsubscribe()
  expect(electron.removeListener).toHaveBeenCalledWith('lsp:diagnostics', expect.any(Function))
  bridge.dap.onEvent(() => undefined)
  expect(electron.on).toHaveBeenCalledWith('dap:event', expect.any(Function))
})

afterAll(async () => {
  const { stopIdeBridge } = await import('./bridge')

  await stopIdeBridge()
})
