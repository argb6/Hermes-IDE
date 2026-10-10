import { useStore } from '@nanostores/react'
import * as monaco from 'monaco-editor'
import { useEffect, useRef } from 'react'

import { tryFormatJson } from '@/lib/json-format'
import { $focusedWorkspaceCwd } from '@/store/session-states'
import { useTheme } from '@/themes/context'

import {
  clearActiveMonaco,
  type ActiveMonaco,
  noteActiveMonaco
} from './ide-editor-actions'
import { documentFileUri, documentUriForModel, rememberDocumentUri } from './document-uri'
import { lspLanguageId, monacoLanguageId } from './ide-language'
import './ide-monaco.css'
import {
  $debugLocation,
  $ideBreakpoints,
  $ideBreakpointsEnabled,
  $ideColorTheme,
  $ideWordWrap,
  toggleIdeBreakpoint
} from './ide-state'
import { $ideGoto } from './ide-nav'
import { lspDidChange, lspDidClose, lspDidOpen, lspStart } from './lsp-client'
import { ensureMonacoEnvironment } from './monaco-env'
import { registerLspProviders } from './lsp-providers'

import 'monaco-editor/min/vs/editor/editor.main.css'

ensureMonacoEnvironment()
registerLspProviders()

// Monaco's in-browser TS/JS checker knows nothing about the project — no
// tsconfig, no node_modules — so it paints "Cannot find module" over valid
// code and its squiggles pile up beside the language server's. The
// project-aware servers (pyright, typescript-language-server) are the only
// validators; the workers stay for their editor smarts.
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true
})
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true
})

monaco.languages.registerDocumentFormattingEditProvider('json', {
  provideDocumentFormattingEdits(model) {
    const result = tryFormatJson(model.getValue())

    if (!result.ok || result.text === model.getValue()) {
      return []
    }

    return [{ range: model.getFullModelRange(), text: result.text }]
  }
})

export interface IdeMonacoProps {
  host?: boolean
  initialValue: string
  minimap?: boolean
  modelUri?: string
  onCaret?: (caret: { column: number; line: number }) => void
  onChange?: (value: string) => void
  onSave?: () => void
  path: string
  readOnly?: boolean
  value?: string
}

export function IdeMonaco({
  host = true,
  initialValue,
  minimap = true,
  modelUri,
  onCaret,
  onChange,
  onSave,
  path,
  readOnly = false,
  value
}: IdeMonacoProps) {
  const node = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onCaretRef = useRef(onCaret)
  const onSaveRef = useRef(onSave)
  const { renderedMode } = useTheme()
  const wrap = useStore($ideWordWrap)
  const colorTheme = useStore($ideColorTheme)
  const monacoTheme = colorTheme || (renderedMode === 'dark' ? 'vs-dark' : 'vs')

  onChangeRef.current = onChange
  onCaretRef.current = onCaret
  onSaveRef.current = onSave

  useEffect(() => {
    const parent = node.current

    if (!parent) {
      return
    }

    const ownedUri = modelUri || documentFileUri(path)
    const uri = monaco.Uri.parse(ownedUri || monaco.Uri.file(path).toString())
    const existing = monaco.editor.getModel(uri)
    const model = existing ?? monaco.editor.createModel(initialValue, monacoLanguageId(path), uri)

    if (ownedUri && !modelUri) {
      rememberDocumentUri(model, ownedUri)
    }

    const editor = monaco.editor.create(parent, {
      automaticLayout: true,
      fontFamily: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      glyphMargin: host,
      minimap: { enabled: minimap },
      model,
      multiCursorModifier: 'alt',
      readOnly,
      scrollBeyondLastLine: false,
      tabSize: 4,
      theme: monacoTheme,
      wordWrap: wrap ? 'on' : 'off'
    })

    editorRef.current = editor
    const api = host ? bindActions(editor, model, path) : null

    if (api) {
      noteActiveMonaco(api)
      editor.onDidFocusEditorText(() => noteActiveMonaco(api))
    }

    const lsp = host ? bindDocument(model, path) : null
    const decorations = editor.createDecorationsCollection()
    const paint = () => decorations.set(host ? breakpointDecorations(path) : [])
    const stops = [
      $ideBreakpoints.subscribe(paint),
      $ideBreakpointsEnabled.subscribe(paint),
      $debugLocation.subscribe(paint),
      $ideWordWrap.subscribe(next => editor.updateOptions({ wordWrap: next ? 'on' : 'off' }))
    ]

    paint()
    editor.onDidChangeModelContent(() => {
      onChangeRef.current?.(editor.getValue())
      lsp?.change()
    })
    editor.onDidChangeCursorPosition(event => {
      onCaretRef.current?.({ column: event.position.column, line: event.position.lineNumber })
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.())
    editor.onMouseDown(event => {
      if (!host || event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        return
      }

      const line = event.target.position?.lineNumber

      if (!line) {
        return
      }

      event.event.preventDefault()
      toggleIdeBreakpoint(path, line)
    })

    return () => {
      lsp?.close()
      stops.forEach(stop => stop())

      if (api) {
        clearActiveMonaco(api)
      }

      editor.dispose()
      editorRef.current = null

      if (!monaco.editor.getEditors().some(item => item.getModel() === model)) {
        model.dispose()
      }
    }
    // The buffer is owned by the editor. Parents remount (new key) to reload a file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, minimap, modelUri, path, readOnly])

  useEffect(() => {
    monaco.editor.setTheme(monacoTheme)
  }, [monacoTheme])

  useEffect(() => {
    const editor = editorRef.current

    if (!editor || value === undefined || editor.getValue() === value) {
      return
    }

    editor.setValue(value)
  }, [value])

  useEffect(() => {
    const reveal = (goto: { column: number; line: number; path: string } | null) => {
      if (!goto || goto.path !== path) {
        return
      }

      editorRef.current?.setPosition({ column: goto.column, lineNumber: goto.line })
      editorRef.current?.revealLineInCenter(goto.line)
      editorRef.current?.focus()
    }

    reveal($ideGoto.get())

    return $ideGoto.subscribe(reveal)
  }, [path])

  return <div className="ide-monaco" ref={node} />
}

function bindActions(editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel, path: string): ActiveMonaco {
  return {
    focus: () => editor.focus(),
    getOffset: () => {
      const pos = editor.getPosition()

      return pos ? model.getOffsetAt(pos) : 0
    },
    getValue: () => model.getValue(),
    goto: (line, column = 1) => {
      const lineNumber = Math.max(1, Math.min(line, model.getLineCount()))

      editor.setPosition({ column, lineNumber })
      editor.revealLineInCenter(lineNumber)
      editor.focus()
    },
    path: () => path,
    position: () => {
      const pos = editor.getPosition()

      return { column: pos?.column ?? 1, line: pos?.lineNumber ?? 1 }
    },
    replaceOffsets: (start, end, text) => {
      editor.executeEdits('menu', [
        {
          range: monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end)),
          text
        }
      ])
    },
    selectOffsets: (anchor, head) => {
      const selection = monaco.Selection.fromPositions(model.getPositionAt(anchor), model.getPositionAt(head))

      editor.setSelection(selection)
      editor.revealRangeInCenter(selection)
    },
    toggleColumnSelection: () => {
      editor.updateOptions({ columnSelection: !editor.getOption(monaco.editor.EditorOption.columnSelection) })
    },
    trigger: id => editor.trigger('menu', id, null)
  }
}

function bindDocument(model: monaco.editor.ITextModel, path: string) {
  const languageId = lspLanguageId(path)

  if (!languageId) {
    return null
  }

  let version = 1
  let timer = 0
  const rootPath = () => $focusedWorkspaceCwd.get() || ''
  const uri = documentUriForModel(model)
  const workspaceRoot = () => rootPath()
  const document = () => ({
    language: languageId,
    languageId,
    text: model.getValue(),
    uri,
    version,
    workspaceRoot: workspaceRoot()
  })

  void lspStart({ language: languageId, workspaceRoot: workspaceRoot() })
  void lspDidOpen(document())

  return {
    change() {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        version += 1
        void lspDidChange({
          contentChanges: [{ text: model.getValue() }],
          language: languageId,
          uri,
          version,
          workspaceRoot: workspaceRoot()
        })
      }, 160)
    },
    close() {
      window.clearTimeout(timer)
      void lspDidClose({ language: languageId, uri, workspaceRoot: workspaceRoot() })
    }
  }
}

function breakpointDecorations(path: string): monaco.editor.IModelDeltaDecoration[] {
  const enabled = $ideBreakpointsEnabled.get()
  const marks: monaco.editor.IModelDeltaDecoration[] = $ideBreakpoints
    .get()
    .filter(item => item.path === path)
    .map(item => ({
      options: {
        glyphMarginClassName: item.enabled && enabled ? 'ide-bp' : 'ide-bp-off',
        glyphMarginHoverMessage: item.condition ? { value: item.condition } : undefined
      },
      range: new monaco.Range(item.line, 1, item.line, 1)
    }))
  const location = $debugLocation.get()

  if (location && location.path === path) {
    marks.push({
      options: { className: 'ide-debug-current', isWholeLine: true },
      range: new monaco.Range(location.line, 1, location.line, 1)
    })
  }

  return marks
}
