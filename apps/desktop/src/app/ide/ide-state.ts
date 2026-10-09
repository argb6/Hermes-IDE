import { atom } from 'nanostores'

import type { LspState } from './ipc-types'

const WRAP_KEY = 'hermes.desktop.ide.wordWrap'

function readWrap() {
  try {
    return localStorage.getItem(WRAP_KEY) === '1'
  } catch {
    return false
  }
}

export const $ideWordWrap = atom(readWrap())

export function toggleIdeWordWrap() {
  const next = !$ideWordWrap.get()

  $ideWordWrap.set(next)

  try {
    localStorage.setItem(WRAP_KEY, next ? '1' : '0')
  } catch {
    // A private window can refuse the write; the toggle still applies.
  }
}

export const $lspStatus = atom<Record<string, LspState>>({})

export function noteLspStatus(languageId: string, state: LspState) {
  const current = $lspStatus.get()

  if (current[languageId] === state) {
    return
  }

  $lspStatus.set({ ...current, [languageId]: state })
}

export interface IdeDiagnostic {
  character: number
  endCharacter: number
  endLine: number
  line: number
  message: string
  path: string
  severity: number
  source?: string
  uri: string
}

export const $ideDiagnostics = atom<IdeDiagnostic[]>([])

export function replaceDiagnostics(uri: string, items: IdeDiagnostic[]) {
  $ideDiagnostics.set([...$ideDiagnostics.get().filter(item => item.uri !== uri), ...items])
}

export interface IdeBreakpoint {
  condition?: string
  enabled: boolean
  line: number
  path: string
}

export const $ideBreakpoints = atom<IdeBreakpoint[]>([])
export const $ideBreakpointsEnabled = atom(true)

export function toggleIdeBreakpoint(path: string, line: number, condition?: string) {
  const current = $ideBreakpoints.get()
  const index = current.findIndex(item => item.path === path && item.line === line)

  if (index >= 0 && condition === undefined) {
    $ideBreakpoints.set(current.filter((_, item) => item !== index))

    return
  }

  if (index >= 0) {
    const next = current.slice()

    next[index] = { ...next[index], condition, enabled: true }
    $ideBreakpoints.set(next)

    return
  }

  $ideBreakpoints.set([...current, { condition, enabled: true, line, path }])
}

export function setAllBreakpointsEnabled(enabled: boolean) {
  $ideBreakpointsEnabled.set(enabled)
  $ideBreakpoints.set($ideBreakpoints.get().map(item => ({ ...item, enabled })))
}

export function clearIdeBreakpoints() {
  $ideBreakpoints.set([])
}

export type DebugPhase = 'idle' | 'paused' | 'running' | 'stopped' | 'unavailable'

export interface DebugFrame {
  column: number
  id: number
  line: number
  name: string
  path: string
}

export interface DebugVar {
  name: string
  value: string
}

export const $debugPhase = atom<DebugPhase>('idle')
export const $debugSessionId = atom<null | string>(null)
export const $debugThreadId = atom<null | number>(null)
export const $debugFrameId = atom<null | number>(null)
export const $debugFrames = atom<DebugFrame[]>([])
export const $debugVariables = atom<DebugVar[]>([])
export const $debugWatch = atom<{ expression: string; value: string }[]>([])
export const $debugConsole = atom<string[]>([])
export const $debugLocation = atom<null | { line: number; path: string }>(null)
export const $debugNotice = atom<null | 'need-file'>(null)

export const $ideSearchReplace = atom(false)

export function openIdeSearchReplace() {
  $ideSearchReplace.set(true)
}

export function appendDebugConsole(line: string) {
  $debugConsole.set([...$debugConsole.get(), line].slice(-400))
}
