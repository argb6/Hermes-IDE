import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  copyLineUp,
  cursorMatchingBracket,
  moveLineDown,
  moveLineUp,
  redo,
  selectAll,
  selectParentSyntax,
  toggleBlockComment,
  toggleComment,
  undo
} from '@codemirror/commands'
import type { Command, EditorView } from '@codemirror/view'

import { toggleIdeBreakpoint, toggleIdeWordWrap } from './ide-state'

export interface ActiveMonaco {
  focus: () => void
  getOffset: () => number
  getValue: () => string
  goto: (line: number, column?: number) => void
  path: () => string
  position: () => { column: number; line: number }
  replaceOffsets: (start: number, end: number, text: string) => void
  selectOffsets: (anchor: number, head: number) => void
  toggleColumnSelection: () => void
  trigger: (id: string) => void
}

let active: EditorView | null = null
let monaco: ActiveMonaco | null = null

export function noteActiveCodeEditor(view: EditorView | null) {
  active = view
}

export function clearActiveCodeEditor(view: EditorView) {
  if (active === view) {
    active = null
  }
}

export function noteActiveMonaco(next: ActiveMonaco | null) {
  monaco = next
}

export function clearActiveMonaco(next: ActiveMonaco) {
  if (monaco === next) {
    monaco = null
  }
}

function run(command: Command) {
  if (!active) {
    return false
  }

  active.focus()

  return command(active)
}

function trigger(id: string) {
  if (!monaco) {
    return false
  }

  monaco.focus()
  monaco.trigger(id)

  return true
}

export const editorUndo = () => trigger('undo') || run(undo)
export const editorRedo = () => trigger('redo') || run(redo)
export const editorSelectAll = () => trigger('editor.action.selectAll') || run(selectAll)
export const editorCopyLineUp = () => trigger('editor.action.copyLinesUpAction') || run(copyLineUp)
export const editorCopyLineDown = () => trigger('editor.action.copyLinesDownAction') || run(copyLineDown)
export const editorMoveLineUp = () => trigger('editor.action.moveLinesUpAction') || run(moveLineUp)
export const editorMoveLineDown = () => trigger('editor.action.moveLinesDownAction') || run(moveLineDown)
export const editorToggleComment = () => trigger('editor.action.commentLine') || run(toggleComment)
export const editorToggleBlockComment = () => trigger('editor.action.blockComment') || run(toggleBlockComment)
export const editorCursorAbove = () => trigger('editor.action.insertCursorAbove') || run(addCursorAbove)
export const editorCursorBelow = () => trigger('editor.action.insertCursorBelow') || run(addCursorBelow)
export const editorExpandSelection = () => trigger('editor.action.smartSelect.expand') || run(selectParentSyntax)
export const editorMatchingBracket = () => trigger('editor.action.jumpToBracket') || run(cursorMatchingBracket)
export const editorGoToDefinition = () => trigger('editor.action.revealDefinition')
export const editorFindReferences = () => trigger('editor.action.goToReferences')
export const editorRename = () => trigger('editor.action.rename')
export const editorFormatDocument = () => trigger('editor.action.formatDocument')
export const editorNextOccurrence = () => trigger('editor.action.addSelectionToNextFindMatch')
export const editorPrevOccurrence = () => trigger('editor.action.addSelectionToPreviousFindMatch')
export const editorAllOccurrences = () => trigger('editor.action.selectHighlights')
export const editorNextProblem = () => trigger('editor.action.marker.next')
export const editorPrevProblem = () => trigger('editor.action.marker.prev')
export const editorToggleWordWrap = () => toggleIdeWordWrap()

export function editorToggleColumnSelection() {
  monaco?.toggleColumnSelection()
}

export function editorToggleBreakpoint() {
  if (!monaco) {
    return
  }

  toggleIdeBreakpoint(monaco.path(), monaco.position().line)
}

export function editorClipboard(kind: 'copy' | 'cut' | 'paste') {
  monaco?.focus()
  active?.focus()
  document.execCommand(kind)
}

export function editorFind(query: string) {
  if (!query) {
    return false
  }

  if (monaco) {
    const text = monaco.getValue()
    const start = monaco.getOffset()
    const later = text.indexOf(query, start)
    const at = later >= 0 ? later : text.indexOf(query)

    if (at < 0) {
      return false
    }

    monaco.focus()
    monaco.selectOffsets(at, at + query.length)

    return true
  }

  const view = active

  if (!view) {
    return false
  }

  const text = view.state.doc.toString()
  const start = view.state.selection.main.to
  const later = text.indexOf(query, start)
  const at = later >= 0 ? later : text.indexOf(query)

  if (at < 0) {
    return false
  }

  view.focus()
  view.dispatch({ scrollIntoView: true, selection: { anchor: at, head: at + query.length } })

  return true
}

export function editorReplace(from: string, to: string) {
  if (!from) {
    return false
  }

  if (monaco) {
    const text = monaco.getValue()
    const at = text.indexOf(from)

    if (at < 0) {
      return false
    }

    monaco.focus()
    monaco.replaceOffsets(at, at + from.length, to)
    monaco.selectOffsets(at, at + to.length)

    return true
  }

  const view = active

  if (!view) {
    return false
  }

  const text = view.state.doc.toString()
  const at = text.indexOf(from)

  if (at < 0) {
    return false
  }

  view.focus()
  view.dispatch({
    changes: { from: at, insert: to, to: at + from.length },
    selection: { anchor: at + to.length }
  })

  return true
}

export function editorGotoLine(line: number) {
  if (!Number.isFinite(line) || line < 1) {
    return false
  }

  if (monaco) {
    monaco.goto(Math.floor(line))

    return true
  }

  const view = active

  if (!view) {
    return false
  }

  const clamped = Math.min(view.state.doc.lines, Math.floor(line))
  const row = view.state.doc.line(clamped)

  view.focus()
  view.dispatch({ scrollIntoView: true, selection: { anchor: row.from } })

  return true
}
