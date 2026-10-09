/**
 * IDE intelligence IPC. Channel names are the contract with the backend
 * bridge (Electron main). Payload shapes here are what the renderer sends
 * until that PR lands and this file is aligned.
 *
 * Search is implemented in this app (`hermes:search:*`), not by that bridge.
 * LSP / DAP / extensions are invoked here and answered by the bridge.
 */

export type LspState = 'unavailable' | 'downloading' | 'ready' | 'crashed'

export interface LspTarget {
  languageId: string
  rootPath: string
}

/** Full-document sync. `didChange` sends the whole buffer, not a diff. */
export interface LspTextDocument {
  languageId: string
  rootPath: string
  text: string
  uri: string
  version: number
}

export interface LspRequest {
  languageId: string
  method: string
  params: unknown
  rootPath: string
}

export interface LspDiagnostic {
  code?: number | string
  message: string
  range: {
    end: { character: number; line: number }
    start: { character: number; line: number }
  }
  severity?: number
  source?: string
}

export interface LspDiagnosticsEvent {
  diagnostics: LspDiagnostic[]
  uri: string
}

export interface LspStatusEvent extends LspTarget {
  message?: string
  state: LspState
}

export interface LspBridge {
  didChange: (doc: LspTextDocument) => Promise<{ ok: boolean }>
  didClose: (doc: Pick<LspTextDocument, 'languageId' | 'rootPath' | 'uri'>) => Promise<{ ok: boolean }>
  didOpen: (doc: LspTextDocument) => Promise<{ ok: boolean }>
  onDiagnostics: (cb: (event: LspDiagnosticsEvent) => void) => () => void
  onStatus: (cb: (event: LspStatusEvent) => void) => () => void
  request: (request: LspRequest) => Promise<unknown>
  start: (target: LspTarget) => Promise<{ message?: string; state: LspState }>
  status: (target: LspTarget) => Promise<{ message?: string; state: LspState }>
  stop: (target: LspTarget) => Promise<{ ok: boolean }>
}

export type DapPhase = 'idle' | 'paused' | 'running' | 'stopped' | 'unavailable'

export interface DapLaunch {
  args?: string[]
  cwd: string
  noDebug?: boolean
  program: string
  request: 'launch'
  type: 'node' | 'python'
}

export interface DapStartResult {
  sessionId?: string
  state: DapPhase | 'ready'
}

export interface DapMessage {
  arguments?: unknown
  command: string
  sessionId: string
}

export interface DapResponse {
  body?: unknown
  command?: string
  message?: string
  success: boolean
}

export interface DapEvent {
  body?: unknown
  event: string
  sessionId: string
}

export interface DapBridge {
  onEvent: (cb: (event: DapEvent) => void) => () => void
  send: (message: DapMessage) => Promise<DapResponse>
  start: (launch: DapLaunch) => Promise<DapStartResult>
  status: () => Promise<{ state: DapPhase }>
  stop: (sessionId: string) => Promise<{ ok: boolean }>
}

export interface ExtSummary {
  description: string
  id: string
  installed?: boolean
  name: string
  publisher: string
  version: string
}

export interface ExtTokenColor {
  scope?: string | string[]
  settings?: { fontStyle?: string; foreground?: string }
}

/** Theme JSON is inlined. A path-only contribution cannot be applied offline. */
export interface ExtTheme {
  colors?: Record<string, string>
  id: string
  label: string
  tokenColors?: ExtTokenColor[]
  uiTheme?: string
}

export interface ExtSnippet {
  body: string | string[]
  description?: string
  prefix: string
}

export interface ExtLanguageConfig {
  autoClosingPairs?: { close: string; open: string }[]
  brackets?: [string, string][]
  comments?: { blockComment?: [string, string]; lineComment?: string }
}

export interface ExtLanguage {
  aliases?: string[]
  configuration?: ExtLanguageConfig
  extensions?: string[]
  id: string
}

export interface ExtContributes {
  grammars?: { language?: string; path?: string; scopeName: string }[]
  languages?: ExtLanguage[]
  snippets?: { language: string; snippets: ExtSnippet[] }[]
  themes?: ExtTheme[]
}

export interface InstalledExtension extends ExtSummary {
  contributes: ExtContributes
  reason?: string
  rejected?: boolean
}

export interface ExtBridge {
  install: (id: string) => Promise<{ extension?: InstalledExtension; reason?: string; state?: 'unavailable' }>
  list: () => Promise<{ extensions: InstalledExtension[] }>
  search: (query: string) => Promise<{ extensions: ExtSummary[] }>
  uninstall: (id: string) => Promise<{ ok: boolean }>
}

export interface SearchQuery {
  caseSensitive: boolean
  cwd: string
  exclude: string
  id: string
  include: string
  /** When set, replace touches only this file. */
  path?: string
  query: string
  regex: boolean
  replace?: string
  wholeWord: boolean
}

export interface SearchMatch {
  column: number
  length: number
  line: number
  path: string
  preview: string
}

export type SearchEvent =
  | { id: string; match: SearchMatch; type: 'match' }
  | { id: string; matches: number; type: 'done' }
  | { id: string; message: string; type: 'error' }

export interface SearchReplaceResult {
  error?: string
  files: number
  replacements: number
}

export interface SearchBridge {
  cancel: (id: string) => Promise<{ ok: boolean }>
  onEvent: (cb: (event: SearchEvent) => void) => () => void
  replace: (query: SearchQuery) => Promise<SearchReplaceResult>
  start: (query: SearchQuery) => Promise<{ error?: string; ok: boolean }>
}
