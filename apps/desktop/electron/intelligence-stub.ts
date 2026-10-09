import { ipcMain } from 'electron'

/**
 * Quiet stand-in for the backend intelligence bridge (LSP, DAP, Open VSX).
 * Every call answers `unavailable` / empty so the editor keeps working offline
 * and never surfaces a missing-handler error.
 *
 * Remove this registrar when the backend PR handles the same channels.
 * Registering both throws at startup.
 */
export function registerIntelligenceStub() {
  const unavailable = async () => ({ state: 'unavailable' as const })

  ipcMain.handle('lsp:start', unavailable)
  ipcMain.handle('lsp:stop', async () => ({ ok: true }))
  ipcMain.handle('lsp:didOpen', async () => ({ ok: true }))
  ipcMain.handle('lsp:didChange', async () => ({ ok: true }))
  ipcMain.handle('lsp:didClose', async () => ({ ok: true }))
  ipcMain.handle('lsp:request', async () => null)
  ipcMain.handle('lsp:status', unavailable)

  ipcMain.handle('dap:start', unavailable)
  ipcMain.handle('dap:send', async () => ({ success: false, message: 'unavailable' }))
  ipcMain.handle('dap:stop', async () => ({ ok: true }))
  ipcMain.handle('dap:status', unavailable)

  ipcMain.handle('ext:search', async () => ({ extensions: [] }))
  ipcMain.handle('ext:list', async () => ({ extensions: [] }))
  ipcMain.handle('ext:install', unavailable)
  ipcMain.handle('ext:uninstall', async () => ({ ok: false }))
}
