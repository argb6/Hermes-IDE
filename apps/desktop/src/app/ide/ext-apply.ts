import type { ExtContributes, InstalledExtension } from './ipc-types'

/**
 * Applies declarative contributions. TextMate grammars are recorded as language
 * ids; Monaco already highlights the built-in languages, and a full Oniguruma
 * tokenizer is not bundled. Themes need inlined colors — a path alone is skipped.
 */
export async function applyExtension(extension: InstalledExtension) {
  if (extension.rejected) {
    return
  }

  const monaco = await import('monaco-editor')

  applyThemes(monaco, extension.contributes)
  applyLanguages(monaco, extension.contributes)
  applySnippets(monaco, extension.contributes)
}

function applyThemes(monaco: MonacoApi, contributes: ExtContributes) {
  for (const theme of contributes.themes ?? []) {
    if (!theme.colors && !theme.tokenColors?.length) {
      continue
    }

    const id = theme.id || theme.label

    monaco.editor.defineTheme(id, {
      base: theme.uiTheme === 'vs' ? 'vs' : 'vs-dark',
      colors: theme.colors ?? {},
      inherit: true,
      rules: (theme.tokenColors ?? []).flatMap(token => {
        const scopes = Array.isArray(token.scope) ? token.scope : token.scope ? [token.scope] : []

        return scopes.map(scope => ({
          fontStyle: token.settings?.fontStyle,
          foreground: token.settings?.foreground?.replace('#', ''),
          token: scope
        }))
      })
    })
    monaco.editor.setTheme(id)
  }
}

function applyLanguages(monaco: MonacoApi, contributes: ExtContributes) {
  for (const language of contributes.languages ?? []) {
    monaco.languages.register({
      aliases: language.aliases,
      extensions: language.extensions,
      id: language.id
    })

    const config = language.configuration

    if (!config) {
      continue
    }

    monaco.languages.setLanguageConfiguration(language.id, {
      autoClosingPairs: config.autoClosingPairs,
      brackets: config.brackets,
      comments: config.comments
    })
  }

  for (const grammar of contributes.grammars ?? []) {
    if (grammar.language) {
      monaco.languages.register({ id: grammar.language })
    }
  }
}

function applySnippets(monaco: MonacoApi, contributes: ExtContributes) {
  for (const pack of contributes.snippets ?? []) {
    const snippets = pack.snippets ?? []

    monaco.languages.registerCompletionItemProvider(pack.language, {
      provideCompletionItems: (_model, position) => ({
        suggestions: snippets.map(snippet => ({
          documentation: snippet.description,
          insertText: Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body,
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

type MonacoApi = typeof import('monaco-editor')
