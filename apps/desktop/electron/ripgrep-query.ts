export interface RgQuery {
  caseSensitive: boolean
  exclude: string
  include: string
  query: string
  regex: boolean
  wholeWord: boolean
}

export interface RgMatch {
  column: number
  length: number
  line: number
  path: string
  preview: string
}

const DEFAULT_GLOBS = [
  '!.git/**',
  '!node_modules/**',
  '!dist/**',
  '!release/**',
  '!.venv/**',
  '!__pycache__/**',
  '!target/**',
  '!vendor/**',
  '!build/**'
]

export function splitGlobs(value: string): string[] {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

export function buildRgArgs(query: RgQuery): string[] {
  const args = ['--json', '--line-number', '--column', '--max-columns', '400', '--max-columns-preview', '--color', 'never']

  if (!query.caseSensitive) {
    args.push('--ignore-case')
  }

  if (query.wholeWord) {
    args.push('--word-regexp')
  }

  if (!query.regex) {
    args.push('--fixed-strings')
  }

  for (const glob of DEFAULT_GLOBS) {
    args.push('--glob', glob)
  }

  for (const glob of splitGlobs(query.include)) {
    args.push('--glob', glob)
  }

  for (const glob of splitGlobs(query.exclude)) {
    args.push('--glob', glob.startsWith('!') ? glob : `!${glob}`)
  }

  args.push('--', query.query)

  return args
}

export function parseRgMatch(line: string): RgMatch | null {
  let parsed: { data?: RgJsonMatch; type?: string }

  try {
    parsed = JSON.parse(line) as { data?: RgJsonMatch; type?: string }
  } catch {
    return null
  }

  if (parsed.type !== 'match' || !parsed.data?.path?.text || !parsed.data.line_number) {
    return null
  }

  const sub = parsed.data.submatches?.[0]
  const start = typeof sub?.start === 'number' ? sub.start : 0
  const end = typeof sub?.end === 'number' ? sub.end : start

  return {
    column: start + 1,
    length: Math.max(0, end - start),
    line: parsed.data.line_number,
    path: parsed.data.path.text,
    preview: String(parsed.data.lines?.text ?? '').replace(/\r?\n$/, '')
  }
}

interface RgJsonMatch {
  line_number?: number
  lines?: { text?: string }
  path?: { text?: string }
  submatches?: { end?: number; start?: number }[]
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Replace matches in a whole file. Regex mode uses the JS RegExp dialect. */
export function replaceInText(text: string, query: RgQuery, replacement: string): { count: number; text: string } {
  const source = query.regex ? query.query : escapeRegExp(query.query)
  const wrapped = query.wholeWord ? `\\b(?:${source})\\b` : source
  const flags = query.caseSensitive ? 'g' : 'gi'
  const pattern = new RegExp(wrapped, flags)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  let count = 0
  const next = text.split(/\r?\n/).map(line => {
    pattern.lastIndex = 0

    return line.replace(pattern, () => {
      count += 1

      return replacement
    })
  })

  return { count, text: next.join(eol) }
}
