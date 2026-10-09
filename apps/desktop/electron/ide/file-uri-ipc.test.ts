import { expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  listeners: new Map<string, (event: { returnValue?: unknown }, payload: unknown) => void>()
}))

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getPath: () => '/tmp',
    getAppPath: () => '/tmp/app',
    isPackaged: false
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: vi.fn(),
    on: (channel: string, handler: (event: { returnValue?: unknown }, payload: unknown) => void) => {
      electron.listeners.set(channel, handler)
    }
  }
}))

it('answers hermes:lsp-file-uri with pathToFileUri', async () => {
  const { pathToFileUri } = await import('./lsp/manager')
  const { registerIdeFileUriIpc } = await import('./ipc')

  registerIdeFileUriIpc()
  const event: { returnValue?: unknown } = {}
  const filePath = '/work/a #b.ts'

  electron.listeners.get('hermes:lsp-file-uri')?.(event, filePath)

  expect(event.returnValue).toBe(pathToFileUri(filePath))
  expect(event.returnValue).toBe('file:///work/a%20%23b.ts')
})
