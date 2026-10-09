import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import type { SearchMatch } from './ipc-types'
import { $ideSearchReplace } from './ide-state'

const RENDER_CAP = 800

export function IdeSearch({ cwd, onOpen }: { cwd: null | string; onOpen: (path: string, line?: number, column?: number) => void }) {
  const { t } = useI18n()
  const replaceOpen = useStore($ideSearchReplace)
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [showReplace, setShowReplace] = useState(replaceOpen)
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [include, setInclude] = useState('')
  const [exclude, setExclude] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<null | 'all' | 'one'>(null)
  const [selected, setSelected] = useState<SearchMatch | null>(null)
  const activeId = useRef('')

  useEffect(() => {
    if (replaceOpen) {
      setShowReplace(true)
    }
  }, [replaceOpen])

  useEffect(() => {
    const bridge = window.hermesDesktop?.search

    if (!bridge) {
      return
    }

    return bridge.onEvent(event => {
      if (event.id !== activeId.current) {
        return
      }

      if (event.type === 'match') {
        setMatches(current => (current.length >= RENDER_CAP ? current : [...current, event.match]))

        return
      }

      setRunning(false)

      if (event.type === 'error') {
        setError(event.message)
      }
    })
  }, [])

  useEffect(() => {
    const needle = query.trim()
    const bridge = window.hermesDesktop?.search

    if (!cwd || needle.length < 2 || !bridge) {
      setMatches([])
      setRunning(false)
      setError(cwd && needle.length >= 2 && !bridge ? t.ide.searchUnavailable : '')

      return
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    activeId.current = id
    let cancelled = false

    setMatches([])
    setError('')
    setRunning(true)
    setConfirming(null)

    void bridge
      .start({ caseSensitive, cwd, exclude, id, include, query: needle, regex, wholeWord })
      .catch(() => {
        if (!cancelled) {
          setRunning(false)
          setError(t.ide.searchUnavailable)
        }
      })

    return () => {
      cancelled = true
      void bridge.cancel(id)
    }
  }, [caseSensitive, cwd, exclude, include, query, regex, t.ide.searchUnavailable, wholeWord])

  const runReplace = async (one: boolean) => {
    const bridge = window.hermesDesktop?.search

    if (!cwd || !bridge) {
      return
    }

    const result = await bridge.replace({
      caseSensitive,
      cwd,
      exclude,
      id: `replace-${Date.now()}`,
      include,
      path: one ? selected?.path : undefined,
      query: query.trim(),
      regex,
      replace,
      wholeWord
    })

    setConfirming(null)
    setError(result.error || '')

    if (!result.error) {
      setQuery(current => `${current}`)
    }
  }

  const grouped = groupMatches(matches)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-2 pt-2">
        <input
          className="min-w-0 flex-1 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-xs"
          onChange={event => setQuery(event.target.value)}
          placeholder={t.ide.searchPlaceholder}
          value={query}
        />
        <button
          className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowReplace(open => !open)}
          type="button"
        >
          {t.ide.searchReplace}
        </button>
      </div>
      {showReplace && (
        <input
          className="mx-2 mt-1 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-xs"
          onChange={event => setReplace(event.target.value)}
          placeholder={t.ide.searchReplace}
          value={replace}
        />
      )}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        <Toggle on={regex} onClick={() => setRegex(value => !value)} title={t.ide.searchRegex}>
          .*
        </Toggle>
        <Toggle on={caseSensitive} onClick={() => setCaseSensitive(value => !value)} title={t.ide.searchCase}>
          Aa
        </Toggle>
        <Toggle on={wholeWord} onClick={() => setWholeWord(value => !value)} title={t.ide.searchWord}>
          ab
        </Toggle>
        {running && <span className="text-[11px] text-muted-foreground">{t.ide.searchRunning}</span>}
        {!running && matches.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{t.ide.searchMatches(matches.length)}</span>
        )}
      </div>
      <input
        className="mx-2 mb-1 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-[11px]"
        onChange={event => setInclude(event.target.value)}
        placeholder={t.ide.searchInclude}
        value={include}
      />
      <input
        className="mx-2 mb-1 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-[11px]"
        onChange={event => setExclude(event.target.value)}
        placeholder={t.ide.searchExclude}
        value={exclude}
      />
      {showReplace && (
        <div className="flex gap-2 px-2 pb-1">
          <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setConfirming('one')} type="button">
            {t.ide.searchReplace}
          </button>
          <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setConfirming('all')} type="button">
            {t.ide.searchReplaceAll}
          </button>
        </div>
      )}
      {confirming && (
        <div className="mx-2 mb-1 rounded border border-[#e2c08d]/50 px-2 py-1 text-[11px]">
          <p>{t.ide.searchReplaceConfirm(confirming === 'one' ? 1 : matches.length)}</p>
          <div className="mt-1 flex gap-2">
            <button className="hover:text-foreground" onClick={() => void runReplace(confirming === 'one')} type="button">
              {t.ide.searchReplace}
            </button>
            <button className="text-muted-foreground" onClick={() => setConfirming(null)} type="button">
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}
      {error && <p className="px-3 text-[11px] text-muted-foreground">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {query.trim().length >= 2 && !running && matches.length === 0 && !error && (
          <p className="px-1 text-xs text-muted-foreground">{t.ide.searchEmpty}</p>
        )}
        {[...grouped.entries()].map(([file, rows]) => (
          <div key={file}>
            <p className="truncate px-1 pt-1 text-[11px] font-semibold text-muted-foreground" title={file}>
              {leaf(file)}
            </p>
            {rows.map(hit => (
              <button
                className="block w-full truncate rounded px-2 py-0.5 text-left font-mono text-[11px] hover:bg-(--ui-control-hover-background)"
                key={`${hit.path}:${hit.line}:${hit.column}`}
                onClick={() => {
                  setSelected(hit)
                  onOpen(hit.path, hit.line, hit.column)
                }}
                title={hit.preview}
                type="button"
              >
                <span className="mr-2 text-muted-foreground">{hit.line}</span>
                {preview(hit)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Toggle({ children, on, onClick, title }: { children: string; on: boolean; onClick: () => void; title: string }) {
  return (
    <button
      className={cn(
        'rounded border px-1.5 py-0.5 font-mono text-[11px]',
        on ? 'border-foreground text-foreground' : 'border-(--ui-stroke-secondary) text-muted-foreground'
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

function groupMatches(matches: SearchMatch[]) {
  const groups = new Map<string, SearchMatch[]>()

  for (const match of matches) {
    const rows = groups.get(match.path) ?? []

    rows.push(match)
    groups.set(match.path, rows)
  }

  return groups
}

function leaf(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function preview(hit: SearchMatch) {
  const start = Math.max(0, hit.column - 1)
  const end = hit.length > 0 ? start + hit.length : start

  return `${hit.preview.slice(0, start)}【${hit.preview.slice(start, end) || hit.preview.slice(start, start + 1)}】${hit.preview.slice(end)}`
}
