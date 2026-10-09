// Main-process IPC for language servers, debug adapters, and declarative
// extensions. Handlers return a status payload; they do not reject.

import fs from 'node:fs'
import path from 'node:path'

import { app, BrowserWindow, ipcMain } from 'electron'

import { resolveDesktopHermesHome } from '../data-paths'
import { bundledPayload, payloadPythonPath } from '../payload-backend'
import { readWindowsUserEnvVar } from '../windows-user-env'
import { resolveAgentPython } from './agent-python'
import type {
  DapSendRequest,
  DapStartRequest,
  DapStopRequest,
  LspDidChangeRequest,
  LspDidCloseRequest,
  LspDidOpenRequest,
  LspRequest,
  LspStartRequest,
  LspStatusQuery,
  LspStopRequest
} from './contract'
import { DapManager } from './dap/manager'
import { ExtensionStore } from './extensions/store'
import { setIdeIntelligenceHost } from './host'
import { LspManager } from './lsp/manager'

let registered = false

export function registerIdeIpc(): void {
  if (registered) {
    return
  }

  registered = true

  const facts = runtimeFacts()
  const lsp = new LspManager({
    ...facts,
    nodeExecPath: process.execPath,
    pythonPath: () => resolveAgentPython(agentPythonRequest())?.executable ?? null,
    onDiagnostics: event => broadcast('lsp:diagnostics', event),
    log: line => console.error(line)
  })
  const dap = new DapManager({
    ...facts,
    nodeExecPath: process.execPath,
    resolvePython: () => resolveAgentPython(agentPythonRequest()),
    onEvent: event => broadcast('dap:event', event),
    log: line => console.error(line)
  })
  const extensions = new ExtensionStore(facts)

  setIdeIntelligenceHost({ lsp, dap, extensions })
  app.on('will-quit', () => {
    lsp.dispose()
    dap.dispose()
    setIdeIntelligenceHost(null)
  })

  ipcMain.handle('lsp:start', (_event, payload: unknown) => lsp.start(asLspStart(payload)))
  ipcMain.handle('lsp:stop', (_event, payload: unknown) => lsp.stop(asLspStop(payload)))
  ipcMain.handle('lsp:didOpen', (_event, payload: unknown) => lsp.didOpen(asDidOpen(payload)))
  ipcMain.handle('lsp:didChange', (_event, payload: unknown) => lsp.didChange(asDidChange(payload)))
  ipcMain.handle('lsp:didClose', (_event, payload: unknown) => lsp.didClose(asDidClose(payload)))
  ipcMain.handle('lsp:request', (_event, payload: unknown) => lsp.request(asLspRequest(payload)))
  ipcMain.handle('lsp:status', (_event, payload: unknown) => lsp.status(asLspStatus(payload)))
  ipcMain.handle('dap:start', (_event, payload: unknown) => dap.start(asDapStart(payload)))
  ipcMain.handle('dap:send', (_event, payload: unknown) => dap.send(asDapSend(payload)))
  ipcMain.handle('dap:stop', (_event, payload: unknown) => dap.stop(asDapStop(payload)))
  ipcMain.handle('dap:status', () => dap.status())
  ipcMain.handle('ext:search', (_event, payload: unknown) => extensions.search(asSearch(payload)))
  ipcMain.handle('ext:install', (_event, payload: unknown) => extensions.install(stringField(record(payload).id), optionalString(record(payload).version)))
  ipcMain.handle('ext:uninstall', (_event, payload: unknown) => extensions.uninstall(stringField(record(payload).id)))
  ipcMain.handle('ext:list', () => extensions.list())
}

function runtimeFacts() {
  return {
    platform: process.platform,
    env: process.env,
    home: app.getPath('home'),
    installRoots: installRoots()
  }
}

function installRoots(): string[] {
  const roots = [path.dirname(process.execPath)]

  if (process.resourcesPath) {
    roots.push(process.resourcesPath)
  }

  roots.push(app.getAppPath())

  return roots
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

function agentPythonRequest(): Parameters<typeof resolveAgentPython>[0] {
  const payload = bundledPayload(process.resourcesPath)
  const home = resolveDesktopHermesHome({
    home: app.getPath('home'),
    env: process.env,
    platform: process.platform,
    directoryExists,
    readWindowsHome: () => readWindowsUserEnvVar('HERMES_HOME')
  })
  const roots: string[] = []

  if (process.env.HERMES_DESKTOP_HERMES_ROOT) {
    roots.push(path.resolve(process.env.HERMES_DESKTOP_HERMES_ROOT))
  }

  if (!app.isPackaged) {
    roots.push(path.resolve(app.getAppPath(), '..', '..'))
  }

  roots.push(path.join(home, 'hermes-agent'))

  return {
    platform: process.platform,
    env: process.env,
    fileExists,
    payloadPython: payload?.storePython ?? null,
    payloadPythonPath: payload ? payloadPythonPath(payload) : null,
    roots
  }
}

function fileExists(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

function directoryExists(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

function asLspStart(payload: unknown): LspStartRequest {
  const body = record(payload)

  return { language: stringField(body.language), workspaceRoot: stringField(body.workspaceRoot) }
}

function asLspStop(payload: unknown): LspStopRequest {
  const body = record(payload)

  return {
    ...(typeof body.language === 'string' ? { language: body.language } : {}),
    ...(typeof body.workspaceRoot === 'string' ? { workspaceRoot: body.workspaceRoot } : {})
  }
}

function asLspRequest(payload: unknown): LspRequest {
  const body = record(payload)

  return {
    language: stringField(body.language),
    workspaceRoot: stringField(body.workspaceRoot),
    method: stringField(body.method),
    params: body.params
  }
}

function asLspStatus(payload: unknown): LspStatusQuery {
  const body = record(payload)

  return {
    ...(typeof body.language === 'string' ? { language: body.language } : {}),
    ...(typeof body.workspaceRoot === 'string' ? { workspaceRoot: body.workspaceRoot } : {})
  }
}

function asDidOpen(payload: unknown): LspDidOpenRequest {
  const body = record(payload)

  return {
    language: stringField(body.language),
    workspaceRoot: stringField(body.workspaceRoot),
    uri: stringField(body.uri),
    languageId: stringField(body.languageId),
    version: typeof body.version === 'number' ? body.version : 0,
    text: stringField(body.text)
  }
}

function asDidChange(payload: unknown): LspDidChangeRequest {
  const body = record(payload)

  return {
    language: stringField(body.language),
    workspaceRoot: stringField(body.workspaceRoot),
    uri: stringField(body.uri),
    version: typeof body.version === 'number' ? body.version : 0,
    contentChanges: Array.isArray(body.contentChanges) ? body.contentChanges : []
  }
}

function asDidClose(payload: unknown): LspDidCloseRequest {
  const body = record(payload)

  return {
    language: stringField(body.language),
    workspaceRoot: stringField(body.workspaceRoot),
    uri: stringField(body.uri)
  }
}

function asDapStart(payload: unknown): DapStartRequest {
  const body = record(payload)
  const launch = body.launch && typeof body.launch === 'object' ? (body.launch as DapStartRequest['launch']) : undefined
  const adapter = body.adapter === 'node' || body.adapter === 'python' ? body.adapter : ('unknown' as 'python')

  return {
    adapter,
    workspaceRoot: stringField(body.workspaceRoot),
    ...(launch ? { launch } : {})
  }
}

function asDapSend(payload: unknown): DapSendRequest {
  const body = record(payload)

  return { sessionId: stringField(body.sessionId), command: stringField(body.command), arguments: body.arguments }
}

function asDapStop(payload: unknown): DapStopRequest {
  const body = record(payload)

  return {
    ...(typeof body.sessionId === 'string' ? { sessionId: body.sessionId } : {}),
    ...(typeof body.workspaceRoot === 'string' ? { workspaceRoot: body.workspaceRoot } : {})
  }
}

function asSearch(payload: unknown): { query?: string; size?: number; offset?: number } {
  const body = record(payload)

  return {
    ...(typeof body.query === 'string' ? { query: body.query } : {}),
    ...(typeof body.size === 'number' ? { size: body.size } : {}),
    ...(typeof body.offset === 'number' ? { offset: body.offset } : {})
  }
}

function record(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}
