import { atom } from 'nanostores'

import { $workspaceMode } from '@/store/workspace-mode'

export interface IdeEditorState {
  column: number
  eol: 'CRLF' | 'LF'
  indent: 'tab' | number
  language: string
  line: number
  path: string
}

export const $ideEditor = atom<IdeEditorState | null>(null)
export const $ideSaveRequest = atom(0)

export function requestIdeSave() {
  $ideSaveRequest.set($ideSaveRequest.get() + 1)
}

const LANGUAGE_LABEL: Record<string, string> = {
  c: 'C',
  cpp: 'C++',
  css: 'CSS',
  go: 'Go',
  html: 'HTML',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  lua: 'Lua',
  markdown: 'Markdown',
  mermaid: 'Mermaid',
  python: 'Python',
  ruby: 'Ruby',
  rust: 'Rust',
  shell: 'Shell',
  sql: 'SQL',
  text: 'Plain Text',
  toml: 'TOML',
  tsx: 'TSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML'
}

export function languageLabel(language: string) {
  const key = language.trim().toLowerCase()

  return LANGUAGE_LABEL[key] || language || 'Plain Text'
}

export function fileFacts(text: string) {
  const eol: IdeEditorState['eol'] = text.includes('\r\n') ? 'CRLF' : 'LF'
  const lines = text.split(/\r?\n/).slice(0, 80)

  if (lines.some(line => line.startsWith('\t'))) {
    return { eol, indent: 'tab' as const }
  }

  const widths = lines.map(line => /^ +/.exec(line)?.[0].length ?? 0).filter(width => width > 0)

  return { eol, indent: widths.length > 0 ? Math.min(...widths) : 4 }
}

export function noteIdeEditor(next: IdeEditorState | null) {
  if ($workspaceMode.get() !== 'ide') {
    return
  }

  const current = $ideEditor.get()

  if (
    current?.path === next?.path &&
    current?.line === next?.line &&
    current?.column === next?.column &&
    current?.eol === next?.eol &&
    current?.indent === next?.indent &&
    current?.language === next?.language
  ) {
    return
  }

  $ideEditor.set(next)
}
