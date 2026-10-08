import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { readDesktopDir, readDesktopFileText } from '@/lib/desktop-fs'

const SKIP = new Set(['.git', 'node_modules', 'dist', 'release', '.venv', '__pycache__', 'target', 'vendor', 'build'])
const TEXT = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'md', 'json', 'css', 'html', 'yml', 'yaml', 'txt', 'rs', 'go', 'cs'])

interface Hit {
  path: string
  line?: number
}

export function IdeSearch({ cwd, onOpen }: { cwd: null | string; onOpen: (path: string) => void }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])

  useEffect(() => {
    const needle = query.trim()

    if (!cwd || needle.length < 2) {
      setHits([])

      return
    }

    let cancelled = false

    void searchFolder(cwd, needle).then(next => {
      if (!cancelled) {
        setHits(next)
      }
    })

    return () => {
      cancelled = true
    }
  }, [cwd, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        className="m-2 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-xs"
        onChange={event => setQuery(event.target.value)}
        placeholder={t.ide.searchPlaceholder}
        value={query}
      />
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {query.trim().length >= 2 && hits.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">{t.ide.searchEmpty}</p>
        )}
        {hits.map(hit => (
          <button
            key={`${hit.path}:${hit.line ?? 0}`}
            className="block w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-(--ui-control-hover-background)"
            onClick={() => onOpen(hit.path)}
            title={hit.path}
            type="button"
          >
            {hit.line ? `${leaf(hit.path)}:${hit.line}` : leaf(hit.path)}
          </button>
        ))}
      </div>
    </div>
  )
}

function leaf(path: string) {
  return path.split(/[\\/]+/).filter(Boolean).pop() ?? path
}

async function searchFolder(root: string, query: string): Promise<Hit[]> {
  const needle = query.toLowerCase()
  const hits: Hit[] = []
  const queue = [root]
  let visited = 0
  let reads = 0

  while (queue.length > 0 && hits.length < 40 && visited < 800) {
    const dir = queue.shift()

    if (!dir) {
      break
    }

    const listed = await readDesktopDir(dir).catch(() => null)

    if (!listed) {
      continue
    }

    for (const entry of listed.entries) {
      if (SKIP.has(entry.name)) {
        continue
      }

      if (entry.isDirectory) {
        queue.push(entry.path)
        continue
      }

      visited += 1

      if (entry.name.toLowerCase().includes(needle)) {
        hits.push({ path: entry.path })
        continue
      }

      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''

      if (!TEXT.has(ext) || reads >= 150 || hits.length >= 40) {
        continue
      }

      reads += 1
      const file = await readDesktopFileText(entry.path).catch(() => null)

      if (!file || file.binary || !file.text) {
        continue
      }

      const line = file.text.split(/\r?\n/).findIndex(row => row.toLowerCase().includes(needle))

      if (line >= 0) {
        hits.push({ line: line + 1, path: entry.path })
      }
    }
  }

  return hits
}
