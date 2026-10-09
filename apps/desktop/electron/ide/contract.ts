// IPC payloads for the IDE intelligence bridge. The preload exposes these
// methods on `window.hermesDesktop`; channel names are the strings below.
// Renderer UI is intentionally not wired here — see IPC.md.

export type IdeRuntimeStatus = 'unavailable' | 'downloading' | 'ready' | 'crashed'

export type LspLanguage = 'python' | 'typescript' | 'javascript'

export interface LspStartRequest {
  language: string
  workspaceRoot: string
}

export interface LspStartResult {
  ok: boolean
  status: IdeRuntimeStatus
  reason?: string
  language: string
  workspaceRoot?: string
}

export interface LspStopRequest {
  language?: string
  workspaceRoot?: string
}

export interface LspStopResult {
  ok: boolean
}

export interface LspDidOpenRequest {
  language: string
  workspaceRoot: string
  uri: string
  languageId: string
  version: number
  text: string
}

export interface LspDidChangeRequest {
  language: string
  workspaceRoot: string
  uri: string
  version: number
  contentChanges: unknown[]
}

export interface LspDidCloseRequest {
  language: string
  workspaceRoot: string
  uri: string
}

export interface LspSyncResult {
  ok: boolean
  status?: IdeRuntimeStatus
  reason?: string
}

export interface LspRequest {
  language: string
  workspaceRoot: string
  method: string
  params?: unknown
}

export interface LspRequestResult {
  ok: boolean
  status?: IdeRuntimeStatus
  reason?: string
  result?: unknown
}

export interface LspStatusQuery {
  language?: string
  workspaceRoot?: string
}

export interface LspLanguageStatus {
  language: string
  status: IdeRuntimeStatus
  reason?: string
  workspaceRoot?: string
}

export interface LspStatusResult {
  languages: LspLanguageStatus[]
}

export interface LspDiagnosticEvent {
  language: string
  workspaceRoot: string
  uri: string
  diagnostics: unknown[]
}

export interface LspBridge {
  start: (request: LspStartRequest) => Promise<LspStartResult>
  stop: (request?: LspStopRequest) => Promise<LspStopResult>
  didOpen: (request: LspDidOpenRequest) => Promise<LspSyncResult>
  didChange: (request: LspDidChangeRequest) => Promise<LspSyncResult>
  didClose: (request: LspDidCloseRequest) => Promise<LspSyncResult>
  request: (request: LspRequest) => Promise<LspRequestResult>
  status: (query?: LspStatusQuery) => Promise<LspStatusResult>
  onDiagnostics: (callback: (event: LspDiagnosticEvent) => void) => () => void
}

export type DapAdapter = 'python' | 'node'

export interface DapLaunchConfig {
  request?: 'launch' | 'attach'
  program?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  port?: number
  stopOnEntry?: boolean
  console?: string
  justMyCode?: boolean
  runtimeExecutable?: string
  runtimeArgs?: string[]
  python?: string
  pythonArgs?: string[]
}

export interface DapStartRequest {
  adapter: DapAdapter
  workspaceRoot: string
  launch?: DapLaunchConfig
}

export interface DapStartResult {
  ok: boolean
  status: IdeRuntimeStatus
  reason?: string
  sessionId?: string
  adapter?: DapAdapter
  /** Agent interpreter the debugpy adapter was spawned with. Put this in the DAP `launch` `python` field. */
  pythonPath?: string
  /**
   * Electron binary used to run the js-debug adapter (`ELECTRON_RUN_AS_NODE=1`).
   * This is the adapter host, not the debuggee. The frontend chooses the
   * debuggee runtime in the DAP launch request.
   */
  nodeExecPath?: string
}

export interface DapSendRequest {
  sessionId: string
  command: string
  arguments?: unknown
}

export interface DapResponseMessage {
  type: 'response'
  request_seq: number
  success: boolean
  command: string
  message?: string
  body?: unknown
}

export interface DapSendResult {
  ok: boolean
  status?: IdeRuntimeStatus
  reason?: string
  response?: DapResponseMessage
}

export interface DapStopRequest {
  sessionId?: string
  workspaceRoot?: string
}

export interface DapStopResult {
  ok: boolean
}

export interface DapAdapterStatus {
  adapter: DapAdapter
  status: IdeRuntimeStatus
  reason?: string
}

export interface DapSessionStatus {
  sessionId: string
  adapter: DapAdapter
  workspaceRoot: string
  status: IdeRuntimeStatus
  reason?: string
}

export interface DapStatusResult {
  adapters: DapAdapterStatus[]
  sessions: DapSessionStatus[]
}

export interface DapEventMessage {
  sessionId: string
  event: {
    type: 'event'
    event: string
    seq?: number
    body?: unknown
  }
}

export interface DapBridge {
  start: (request: DapStartRequest) => Promise<DapStartResult>
  send: (request: DapSendRequest) => Promise<DapSendResult>
  stop: (request?: DapStopRequest) => Promise<DapStopResult>
  status: () => Promise<DapStatusResult>
  onEvent: (callback: (event: DapEventMessage) => void) => () => void
}

export interface ExtensionContributes {
  themes: ExtensionTheme[]
  grammars: ExtensionGrammar[]
  snippets: ExtensionSnippets[]
  languages: ExtensionLanguage[]
}

export interface ExtensionTheme {
  label: string
  id?: string
  uiTheme?: string
  path: string
}

export interface ExtensionGrammar {
  scopeName?: string
  language?: string
  path: string
  embeddedLanguages?: Record<string, string>
}

export interface ExtensionSnippets {
  language?: string
  path: string
}

export interface ExtensionLanguage {
  id: string
  aliases?: string[]
  extensions?: string[]
  filenames?: string[]
  configuration?: string
}

export interface InstalledExtension {
  id: string
  version: string
  displayName?: string
  description?: string
  path: string
  contributes: ExtensionContributes
}

export interface ExtensionSearchHit {
  id: string
  namespace: string
  name: string
  version: string
  displayName?: string
  description?: string
  downloadCount?: number
}

export interface ExtensionSearchResult {
  ok: boolean
  status?: IdeRuntimeStatus
  reason?: string
  extensions?: ExtensionSearchHit[]
  total?: number
}

export interface ExtensionInstallResult {
  ok: boolean
  status?: IdeRuntimeStatus | 'rejected'
  reason?: string
  /** Set when a code extension is refused: `main` and/or `browser`. */
  fields?: string[]
  extension?: InstalledExtension
}

export interface ExtensionListResult {
  ok: boolean
  extensions: InstalledExtension[]
}

export interface ExtensionUninstallResult {
  ok: boolean
  reason?: string
}

export interface ExtBridge {
  search: (query: { query?: string; size?: number; offset?: number }) => Promise<ExtensionSearchResult>
  install: (request: { id: string; version?: string }) => Promise<ExtensionInstallResult>
  uninstall: (request: { id: string }) => Promise<ExtensionUninstallResult>
  list: () => Promise<ExtensionListResult>
}
