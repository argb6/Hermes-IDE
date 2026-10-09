import type * as monaco from 'monaco-editor'

const byModel = new WeakMap<monaco.editor.ITextModel, string>()

/**
 * Document URI from `pathToFileUri` in the Electron main process.
 * The renderer cannot import that module (it pulls `node:path`). Returns null
 * only when the desktop bridge is absent, which is the unit-test harness.
 */
export function documentFileUri(filePath: string): string | null {
  const convert = window.hermesDesktop?.pathToFileUri

  if (typeof convert !== 'function' || !filePath) {
    return null
  }

  const uri = convert(filePath)

  return typeof uri === 'string' && uri.startsWith('file:') ? uri : null
}

export function rememberDocumentUri(model: monaco.editor.ITextModel, uri: string) {
  byModel.set(model, uri)
}

/** URI the language server and the agent bridge already agree on. */
export function documentUriForModel(model: monaco.editor.ITextModel): string {
  return byModel.get(model) || model.uri.toString()
}
