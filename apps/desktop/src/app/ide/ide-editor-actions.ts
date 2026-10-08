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

let active: EditorView | null = null

export function noteActiveCodeEditor(view: EditorView | null) {
  active = view
}

export function clearActiveCodeEditor(view: EditorView) {
  if (active === view) {
    active = null
  }
}

function run(command: Command) {
  if (!active) {
    return false
  }

  active.focus()

  return command(active)
}

export const editorUndo = () => run(undo)
export const editorRedo = () => run(redo)
export const editorSelectAll = () => run(selectAll)
export const editorCopyLineUp = () => run(copyLineUp)
export const editorCopyLineDown = () => run(copyLineDown)
export const editorMoveLineUp = () => run(moveLineUp)
export const editorMoveLineDown = () => run(moveLineDown)
export const editorToggleComment = () => run(toggleComment)
export const editorToggleBlockComment = () => run(toggleBlockComment)
export const editorCursorAbove = () => run(addCursorAbove)
export const editorCursorBelow = () => run(addCursorBelow)
export const editorExpandSelection = () => run(selectParentSyntax)
export const editorMatchingBracket = () => run(cursorMatchingBracket)

export function editorClipboard(kind: 'copy' | 'cut' | 'paste') {
  active?.focus()
  document.execCommand(kind)
}

export function editorFind(query: string) {
  const view = active

  if (!view || !query) {
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
  const view = active

  if (!view || !from) {
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
  const view = active

  if (!view || !Number.isFinite(line) || line < 1) {
    return false
  }

  const clamped = Math.min(view.state.doc.lines, Math.floor(line))
  const row = view.state.doc.line(clamped)

  view.focus()
  view.dispatch({ scrollIntoView: true, selection: { anchor: row.from } })

  return true
}
