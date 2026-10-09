// Phase-1 language servers. They are not bundled in the installer; the manager
// downloads these exact versions on first use.

export const PYRIGHT_VERSION = '1.1.414'
export const TYPESCRIPT_LANGUAGE_SERVER_VERSION = '6.0.1'
export const TSSERVER_VERSION = '6.0.3'

export type LspServerId = 'pyright' | 'typescript-language-server'

export interface LspServerSpec {
  id: LspServerId
  languages: string[]
  packages: { name: string; version: string }[]
  /** Package whose `bin` script is the language server entry. */
  binPackage: string
  binName: string
  args: string[]
}

export const LSP_SERVERS: Record<LspServerId, LspServerSpec> = {
  pyright: {
    id: 'pyright',
    languages: ['python'],
    packages: [{ name: 'pyright', version: PYRIGHT_VERSION }],
    binPackage: 'pyright',
    binName: 'pyright-langserver',
    args: ['--stdio']
  },
  'typescript-language-server': {
    id: 'typescript-language-server',
    languages: ['typescript', 'javascript'],
    packages: [
      { name: 'typescript-language-server', version: TYPESCRIPT_LANGUAGE_SERVER_VERSION },
      { name: 'typescript', version: TSSERVER_VERSION }
    ],
    binPackage: 'typescript-language-server',
    binName: 'typescript-language-server',
    args: ['--stdio']
  }
}

const LANGUAGE_SERVER: Record<string, LspServerId> = {
  python: 'pyright',
  typescript: 'typescript-language-server',
  javascript: 'typescript-language-server',
  typescriptreact: 'typescript-language-server',
  javascriptreact: 'typescript-language-server'
}

export function serverIdForLanguage(language: string): LspServerId | null {
  return LANGUAGE_SERVER[language] ?? null
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  '.py': 'python',
  '.pyi': 'python',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript'
}

export function languageIdForPath(filePath: string): string | null {
  const dot = filePath.lastIndexOf('.')
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))

  if (dot <= slash) {
    return null
  }

  return EXTENSION_LANGUAGE[filePath.slice(dot).toLowerCase()] ?? null
}
