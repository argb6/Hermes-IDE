import type * as MonacoTypes from 'monaco-editor'

import type { ExtensionContributes, InstalledExtension } from '../../../electron/ide/contract'

import { noteIdeColorTheme } from './ide-state'

/**
 * Loads declarative contributions from the absolute paths the bridge returns.
 * TextMate grammars are read and their language ids are registered. Monaco has
 * no Oniguruma tokenizer, so those files do not become token rules.
 */
export async function applyExtension(extension: InstalledExtension) {
  const monaco = await import('monaco-editor')
  const contributes = extension.contributes

  await applyThemes(monaco, contributes)
  await applyLanguages(monaco, contributes)
  await applySnippets(monaco, contributes)
}

async function readText(filePath: string | undefined) {
  if (!filePath) {
    return null
  }

  try {
    const result = await window.hermesDesktop.readFileText(filePath)

    if (!result || !('text' in result) || typeof result.text !== 'string') {
      return null
    }

    return result.text
  } catch {
    return null
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    return JSON.parse(stripped)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

async function applyThemes(monaco: MonacoApi, contributes: ExtensionContributes) {
  for (const theme of contributes.themes) {
    const text = await readText(theme.path)

    if (!text) {
      continue
    }

    let parsed: unknown

    try {
      parsed = parseJson(text)
    } catch {
      continue
    }

    if (!isRecord(parsed)) {
      continue
    }

    const colors = isRecord(parsed.colors) ? stringMap(parsed.colors) : {}
    const tokenColors = Array.isArray(parsed.tokenColors) ? parsed.tokenColors : []
    const id = theme.id || theme.label

    monaco.editor.defineTheme(id, {
      base: theme.uiTheme === 'vs' ? 'vs' : 'vs-dark',
      colors,
      inherit: true,
      rules: tokenColors.flatMap(token => {
        if (!isRecord(token)) {
          return []
        }

        const settings = isRecord(token.settings) ? token.settings : {}
        const foreground = typeof settings.foreground === 'string' ? settings.foreground.replace('#', '') : undefined
        const fontStyle = typeof settings.fontStyle === 'string' ? settings.fontStyle : undefined
        const scopes = Array.isArray(token.scope) ? token.scope : typeof token.scope === 'string' ? [token.scope] : []

        return scopes.flatMap(scope => (typeof scope === 'string' ? [{ fontStyle, foreground, token: scope }] : []))
      })
    })
    noteIdeColorTheme(id)
  }
}

function stringMap(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

async function applyLanguages(monaco: MonacoApi, contributes: ExtensionContributes) {
  for (const language of contributes.languages) {
    monaco.languages.register({
      aliases: language.aliases,
      extensions: language.extensions,
      filenames: language.filenames,
      id: language.id
    })

    const text = await readText(language.configuration)

    if (!text) {
      continue
    }

    try {
      const parsed = parseJson(text)

      if (isRecord(parsed)) {
        monaco.languages.setLanguageConfiguration(
          language.id,
          languageConfiguration(parsed) as MonacoTypes.languages.LanguageConfiguration
        )
      }
    } catch {
      // A bad configuration file leaves the language registered.
    }
  }

  for (const grammar of contributes.grammars) {
    const text = await readText(grammar.path)

    if (!text || !grammar.language) {
      continue
    }

    monaco.languages.register({ id: grammar.language })
  }
}

function languageConfiguration(parsed: Record<string, unknown>): Record<string, unknown> {
  const comments = isRecord(parsed.comments) ? parsed.comments : {}

  return {
    autoClosingPairs: Array.isArray(parsed.autoClosingPairs) ? parsed.autoClosingPairs : undefined,
    brackets: Array.isArray(parsed.brackets) ? parsed.brackets : undefined,
    comments: {
      blockComment: Array.isArray(comments.blockComment) ? comments.blockComment : undefined,
      lineComment: typeof comments.lineComment === 'string' ? comments.lineComment : undefined
    }
  }
}

async function applySnippets(monaco: MonacoApi, contributes: ExtensionContributes) {
  for (const pack of contributes.snippets) {
    if (!pack.language) {
      continue
    }

    const text = await readText(pack.path)

    if (!text) {
      continue
    }

    let parsed: unknown

    try {
      parsed = parseJson(text)
    } catch {
      continue
    }

    const snippets = snippetEntries(parsed)

    if (snippets.length === 0) {
      continue
    }

    const language = pack.language

    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems: (_model, position) => ({
        suggestions: snippets.map(snippet => ({
          documentation: snippet.description,
          insertText: snippet.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          kind: monaco.languages.CompletionItemKind.Snippet,
          label: snippet.prefix,
          range: {
            endColumn: position.column,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            startLineNumber: position.lineNumber
          }
        }))
      })
    })
  }
}

function snippetEntries(parsed: unknown) {
  const rows = Array.isArray(parsed) ? parsed : isRecord(parsed) ? Object.values(parsed) : []

  return rows.flatMap(item => {
    if (!isRecord(item)) {
      return []
    }

    const prefix = typeof item.prefix === 'string' ? item.prefix : Array.isArray(item.prefix) ? item.prefix.find(part => typeof part === 'string') : ''
    const body = Array.isArray(item.body) ? item.body.filter(line => typeof line === 'string').join('\n') : typeof item.body === 'string' ? item.body : ''

    if (typeof prefix !== 'string' || !prefix || !body) {
      return []
    }

    return [{ body, description: typeof item.description === 'string' ? item.description : undefined, prefix }]
  })
}

type MonacoApi = typeof import('monaco-editor')
