const BY_EXT: Record<string, string> = {
  bash: 'shell',
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cts: 'typescript',
  go: 'go',
  h: 'c',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  kt: 'kotlin',
  less: 'less',
  lua: 'lua',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  py: 'python',
  pyi: 'python',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'shell',
  sql: 'sql',
  svg: 'xml',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml'
}

export function monacoLanguageId(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath
  const ext = base.includes('.') ? (base.split('.').pop()?.toLowerCase() ?? '') : ''

  return BY_EXT[ext] ?? 'plaintext'
}

export function lspLanguageId(filePath: string): 'javascript' | 'python' | 'typescript' | null {
  const id = monacoLanguageId(filePath)

  if (id === 'python' || id === 'typescript' || id === 'javascript') {
    return id
  }

  return null
}

export function debugAdapterFor(filePath: string): 'node' | 'python' | null {
  const id = monacoLanguageId(filePath)

  if (id === 'python') {
    return 'python'
  }

  if (id === 'javascript' || id === 'typescript') {
    return 'node'
  }

  return null
}

/** Monaco `file://` URI. Kept as a string so callers do not import Monaco. */
export function fileUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const prefixed = /^[a-zA-Z]:\//.test(normalized) ? `/${normalized}` : normalized.startsWith('/') ? normalized : `/${normalized}`

  return `file://${encodeURI(prefixed)}`
}
