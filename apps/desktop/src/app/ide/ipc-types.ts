/**
 * Workspace search IPC. Ripgrep runs in the Electron main process.
 * Language servers, debug adapters, and extensions use `electron/ide/contract.ts`.
 */

export type LspState = 'unavailable' | 'downloading' | 'ready' | 'crashed'

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
