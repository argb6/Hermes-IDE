import * as monaco from 'monaco-editor'
import { $focusedWorkspaceCwd } from '@/store/session-states'

import { documentFileUri, documentUriForModel } from './document-uri'
import { lspLanguageId } from './ide-language'
import { replaceDiagnostics } from './ide-state'
import { lspRequest, onLspDiagnostics } from './lsp-client'

interface LspDiagnostic {
  code?: number | string
  message: string
  range: {
    end: { character: number; line: number }
    start: { character: number; line: number }
  }
  severity?: number
  source?: string
}

const LANGUAGE_IDS = ['python', 'typescript', 'javascript'] as const

let registered = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function ready(model: monaco.editor.ITextModel) {
  return lspLanguageId(model.uri.fsPath)
}

async function ask(model: monaco.editor.ITextModel, method: string, params: unknown) {
  const languageId = ready(model)
  const rootPath = $focusedWorkspaceCwd.get() || ''

  if (!languageId) {
    return null
  }

  return lspRequest({ language: languageId, method, params, workspaceRoot: rootPath })
}

function position(pos: monaco.Position) {
  return { character: pos.column - 1, line: pos.lineNumber - 1 }
}

function textDocument(model: monaco.editor.ITextModel) {
  return { uri: documentUriForModel(model) }
}

function toRange(range: Record<string, unknown>): monaco.IRange | null {
  const start = isRecord(range.start) ? range.start : null
  const end = isRecord(range.end) ? range.end : start

  if (!start || typeof start.line !== 'number' || typeof start.character !== 'number') {
    return null
  }

  const endLine = end && typeof end.line === 'number' ? end.line : start.line
  const endCharacter = end && typeof end.character === 'number' ? end.character : start.character

  return {
    endColumn: endCharacter + 1,
    endLineNumber: endLine + 1,
    startColumn: start.character + 1,
    startLineNumber: start.line + 1
  }
}

function locations(result: unknown) {
  const list = Array.isArray(result) ? result : result ? [result] : []

  return list.flatMap(item => {
    if (!isRecord(item)) {
      return []
    }

    const uri = typeof item.uri === 'string' ? item.uri : typeof item.targetUri === 'string' ? item.targetUri : ''
    const range = isRecord(item.range) ? item.range : isRecord(item.targetSelectionRange) ? item.targetSelectionRange : null
    const mapped = range ? toRange(range) : null

    if (!uri || !mapped) {
      return []
    }

    return [{ range: mapped, uri: monaco.Uri.parse(uri) }]
  })
}

function completionItems(result: unknown, fallback: monaco.IRange): monaco.languages.CompletionItem[] {
  const raw = Array.isArray(result) ? result : isRecord(result) && Array.isArray(result.items) ? result.items : []

  return raw.flatMap(item => {
    if (!isRecord(item) || (typeof item.label !== 'string' && !isRecord(item.label))) {
      return []
    }

    const label = typeof item.label === 'string' ? item.label : String(item.label.label ?? '')
    const edit = isRecord(item.textEdit) && typeof item.textEdit.newText === 'string' ? item.textEdit : null
    const mapped = edit && isRecord(edit.range) ? toRange(edit.range) : null
    const insertText =
      typeof item.insertText === 'string' ? item.insertText : typeof edit?.newText === 'string' ? edit.newText : label
    const suggestion: monaco.languages.CompletionItem = {
      insertText,
      kind: typeof item.kind === 'number' ? item.kind : monaco.languages.CompletionItemKind.Text,
      label,
      range: mapped ?? fallback
    }

    if (item.insertTextFormat === 2) {
      suggestion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    }

    if (typeof item.detail === 'string') {
      suggestion.detail = item.detail
    }

    return [suggestion]
  })
}

function hoverContents(result: unknown): monaco.IMarkdownString[] {
  if (!isRecord(result)) {
    return []
  }

  const contents = result.contents
  const parts = Array.isArray(contents) ? contents : contents ? [contents] : []

  return parts.flatMap(part => {
    if (typeof part === 'string') {
      return [{ value: part }]
    }

    if (isRecord(part) && typeof part.value === 'string') {
      return [{ value: part.value }]
    }

    return []
  })
}

function diagnosticItems(value: unknown[]): LspDiagnostic[] {
  return value.flatMap(item => {
    if (!isRecord(item) || typeof item.message !== 'string' || !isRecord(item.range)) {
      return []
    }

    const range = item.range

    if (!isRecord(range.start) || !isRecord(range.end)) {
      return []
    }

    return [
      {
        code: typeof item.code === 'number' || typeof item.code === 'string' ? item.code : undefined,
        message: item.message,
        range: {
          end: { character: numberField(range.end.character), line: numberField(range.end.line) },
          start: { character: numberField(range.start.character), line: numberField(range.start.line) }
        },
        severity: typeof item.severity === 'number' ? item.severity : undefined,
        source: typeof item.source === 'string' ? item.source : undefined
      }
    ]
  })
}

function numberField(value: unknown) {
  return typeof value === 'number' ? value : 0
}

function markers(diagnostics: LspDiagnostic[]): monaco.editor.IMarkerData[] {
  return diagnostics.flatMap(item => {
    const range = toRange(item.range as unknown as Record<string, unknown>)

    if (!range) {
      return []
    }

    return [
      {
        ...range,
        code: item.code === undefined ? undefined : String(item.code),
        message: item.message,
        severity: item.severity ?? monaco.MarkerSeverity.Error,
        source: item.source
      }
    ]
  })
}

export function registerLspProviders() {
  if (registered) {
    return
  }

  registered = true

  onLspDiagnostics(event => {
    const uri = monaco.Uri.parse(event.uri)
    const model = monaco.editor.getModel(uri)
    const diagnostics = diagnosticItems(event.diagnostics)

    if (model) {
      monaco.editor.setModelMarkers(model, 'lsp', markers(diagnostics))
    }

    replaceDiagnostics(
      event.uri,
      diagnostics.flatMap(item => {
        const range = toRange(item.range as unknown as Record<string, unknown>)

        if (!range) {
          return []
        }

        return [
          {
            character: range.startColumn,
            endCharacter: range.endColumn,
            endLine: range.endLineNumber,
            line: range.startLineNumber,
            message: item.message,
            path: uri.fsPath || event.uri,
            severity: item.severity ?? 1,
            source: item.source,
            uri: event.uri
          }
        ]
      })
    )
  })

  for (const language of LANGUAGE_IDS) {
    monaco.languages.registerCompletionItemProvider(language, {
      async provideCompletionItems(model, pos) {
        const result = await ask(model, 'textDocument/completion', { position: position(pos), textDocument: textDocument(model) })

        const word = model.getWordUntilPosition(pos)

        return {
          suggestions: completionItems(result, {
            endColumn: pos.column,
            endLineNumber: pos.lineNumber,
            startColumn: word.startColumn,
            startLineNumber: pos.lineNumber
          })
        }
      }
    })

    monaco.languages.registerHoverProvider(language, {
      async provideHover(model, pos) {
        const result = await ask(model, 'textDocument/hover', { position: position(pos), textDocument: textDocument(model) })
        const contents = hoverContents(result)

        if (!isRecord(result) || contents.length === 0) {
          return null
        }

        const range = isRecord(result.range) ? toRange(result.range) ?? undefined : undefined

        return { contents, range }
      }
    })

    monaco.languages.registerDefinitionProvider(language, {
      async provideDefinition(model, pos) {
        const result = await ask(model, 'textDocument/definition', { position: position(pos), textDocument: textDocument(model) })

        return locations(result)
      }
    })

    monaco.languages.registerReferenceProvider(language, {
      async provideReferences(model, pos) {
        const result = await ask(model, 'textDocument/references', {
          context: { includeDeclaration: true },
          position: position(pos),
          textDocument: textDocument(model)
        })

        return locations(result)
      }
    })

    monaco.languages.registerRenameProvider(language, {
      async provideRenameEdits(model, pos, newName) {
        const result = await ask(model, 'textDocument/rename', {
          newName,
          position: position(pos),
          textDocument: textDocument(model)
        })

        if (!isRecord(result) || !isRecord(result.changes)) {
          return null
        }

        const edits = Object.entries(result.changes).flatMap(([uri, value]) => {
          if (!Array.isArray(value)) {
            return []
          }

          return value.flatMap(edit => {
            if (!isRecord(edit) || typeof edit.newText !== 'string' || !isRecord(edit.range)) {
              return []
            }

            const range = toRange(edit.range)

            return range ? [{ resource: monaco.Uri.parse(uri), textEdit: { range, text: edit.newText }, versionId: undefined }] : []
          })
        })

        return { edits }
      }
    })

    monaco.languages.registerDocumentFormattingEditProvider(language, {
      async provideDocumentFormattingEdits(model) {
        const result = await ask(model, 'textDocument/formatting', { textDocument: textDocument(model) })

        if (!Array.isArray(result)) {
          return []
        }

        return result.flatMap(edit => {
          if (!isRecord(edit) || typeof edit.newText !== 'string' || !isRecord(edit.range)) {
            return []
          }

          const range = toRange(edit.range)

          return range ? [{ range, text: edit.newText }] : []
        })
      }
    })
  }
}

export function lspUri(filePath: string) {
  return documentFileUri(filePath) || ''
}
