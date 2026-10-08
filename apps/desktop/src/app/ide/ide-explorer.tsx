import { useStore } from '@nanostores/react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { RightSidebarPane } from '@/app/right-sidebar'
import { Codicon } from '@/components/ui/codicon'
import type { HermesFileCommit } from '@/global'
import { useI18n } from '@/i18n'
import { readDesktopFileText } from '@/lib/desktop-fs'
import { desktopGit } from '@/lib/desktop-git'
import { cn } from '@/lib/utils'
import { $focusedWorkspaceCwd } from '@/store/session-states'

import { $ideEditor } from './ide-editor'
import { editorGotoLine } from './ide-editor-actions'
import { $ideOutlineTick, requestIdeOutlineJump } from './ide-nav'

interface OutlineRow {
  depth: number
  kind: 'class' | 'function' | 'heading' | 'type'
  line: number
  name: string
}

const KIND_ICON: Record<OutlineRow['kind'], string> = {
  class: 'symbol-class',
  function: 'symbol-method',
  heading: 'symbol-string',
  type: 'symbol-interface'
}

/** File tree, plus an outline and a per-file git timeline under it. */
export function IdeExplorer({
  activePath,
  cwd,
  onDiff,
  onOpen
}: {
  activePath: null | string
  cwd?: null | string
  onDiff: (text: null | string) => void
  onOpen: (path: string) => void
}) {
  const { locale, t } = useI18n()
  const focused = useStore($focusedWorkspaceCwd)
  const repo = cwd || focused
  const editor = useStore($ideEditor)
  const outlineTick = useStore($ideOutlineTick)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [outline, setOutline] = useState<OutlineRow[]>([])
  const [collapsed, setCollapsed] = useState<number[]>([])
  const [commits, setCommits] = useState<HermesFileCommit[]>([])
  const [picked, setPicked] = useState<null | string>(null)

  useEffect(() => {
    if (outlineTick > 0) {
      setOutlineOpen(true)
    }
  }, [outlineTick])

  useEffect(() => {
    setCollapsed([])
    setPicked(null)

    if (!activePath) {
      setOutline([])

      return
    }

    let cancelled = false

    void readDesktopFileText(activePath)
      .then(result => {
        if (!cancelled) {
          setOutline(result.text ? outlineRows(activePath, result.text) : [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOutline([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [activePath])

  useEffect(() => {
    if (!activePath || !repo) {
      setCommits([])

      return
    }

    let cancelled = false

    void desktopGit()
      ?.fileHistory(repo, activePath)
      .then(result => {
        if (!cancelled) {
          setCommits(result?.commits ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommits([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [activePath, repo])

  const visible = useMemo(() => visibleRows(outline, new Set(collapsed)), [collapsed, outline])
  const cursorLine = editor?.path === activePath ? editor.line : 0
  const currentLine = activeOutlineLine(visible, cursorLine)

  const jump = (row: OutlineRow) => {
    editorGotoLine(row.line)
    requestIdeOutlineJump(row.name)
  }

  const showCommit = (hash: string) => {
    if (!activePath || !repo) {
      return
    }

    setPicked(hash)
    void desktopGit()
      ?.fileCommitDiff(repo, activePath, hash)
      .then(text => onDiff(text || null))
      .catch(() => onDiff(null))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <RightSidebarPane
          onActivateFile={() => undefined}
          onActivateFolder={() => undefined}
          onOpenFile={onOpen}
          openFileOnClick
          underTitlebar={false}
        />
      </div>
      <Section label={t.ide.outline} onToggle={() => setOutlineOpen(open => !open)} open={outlineOpen}>
        {visible.length === 0 && <p className="px-3 py-1 text-xs text-muted-foreground">{t.ide.outlineEmpty}</p>}
        {visible.map(row => {
          const child = outline.some(other => other.line > row.line && other.depth > row.depth && other.line < nextSibling(outline, row))

          return (
            <div
              className={cn(
                'flex h-6 min-w-0 items-center gap-1 pr-2 text-xs hover:bg-(--ui-control-hover-background)',
                currentLine === row.line && 'bg-(--ui-row-active-background) text-foreground'
              )}
              key={`${row.line}-${row.name}`}
              style={{ paddingLeft: 8 + row.depth * 12 }}
            >
              <button
                className={cn('flex size-4 shrink-0 items-center justify-center text-muted-foreground', !child && 'invisible')}
                onClick={() =>
                  setCollapsed(current =>
                    current.includes(row.line) ? current.filter(line => line !== row.line) : [...current, row.line]
                  )
                }
                type="button"
              >
                <Codicon name={collapsed.includes(row.line) ? 'chevron-right' : 'chevron-down'} size={14} />
              </button>
              <button
                className="flex min-w-0 flex-1 items-center gap-1 text-left text-muted-foreground hover:text-foreground"
                onClick={() => jump(row)}
                title={row.name}
                type="button"
              >
                <Codicon name={KIND_ICON[row.kind]} size={14} />
                <span className="truncate">{row.name}</span>
              </button>
            </div>
          )
        })}
      </Section>
      <Section label={t.ide.timeline} onToggle={() => setTimelineOpen(open => !open)} open={timelineOpen}>
        {!activePath && <p className="px-3 py-1 text-xs text-muted-foreground">{t.ide.timelineEmpty}</p>}
        {activePath && (
          <TimelineButton
            active={picked === null}
            label={t.ide.timelineNow}
            onClick={() => {
              setPicked(null)
              onDiff(null)
            }}
          />
        )}
        {activePath && commits.length === 0 && (
          <p className="px-3 py-1 text-xs text-muted-foreground">{t.ide.timelineEmpty}</p>
        )}
        {commits.map(commit => (
          <TimelineButton
            active={picked === commit.hash}
            detail={commit.at ? relativeTime(commit.at, locale) : commit.hash}
            key={commit.hash}
            label={commit.subject}
            onClick={() => showCommit(commit.hash)}
          />
        ))}
      </Section>
    </div>
  )
}

function TimelineButton({
  active,
  detail,
  label,
  onClick
}: {
  active?: boolean
  detail?: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex h-6 w-full min-w-0 items-center gap-2 px-3 text-left text-xs hover:bg-(--ui-control-hover-background)',
        active && 'bg-(--ui-row-active-background)'
      )}
      onClick={onClick}
      title={detail ? `${label} · ${detail}` : label}
      type="button"
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', active ? 'bg-foreground' : 'bg-sky-500')} />
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      {detail && <span className="shrink-0 text-[10px] text-muted-foreground">{detail}</span>}
    </button>
  )
}

function Section({
  children,
  label,
  open,
  onToggle
}: {
  children: ReactNode
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="shrink-0 border-t border-(--ui-stroke-secondary)">
      <button
        className="flex h-7 w-full items-center gap-1 px-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
        onClick={onToggle}
        type="button"
      >
        <Codicon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        {label}
      </button>
      {open && <div className="max-h-48 overflow-auto pb-1">{children}</div>}
    </div>
  )
}

function nextSibling(rows: OutlineRow[], row: OutlineRow) {
  const index = rows.indexOf(row)

  for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
    if (rows[cursor].depth <= row.depth) {
      return rows[cursor].line
    }
  }

  return Number.POSITIVE_INFINITY
}

function visibleRows(rows: OutlineRow[], collapsed: Set<number>) {
  let hideBelow = Number.POSITIVE_INFINITY
  const shown: OutlineRow[] = []

  for (const row of rows) {
    if (row.depth > hideBelow) {
      continue
    }

    hideBelow = Number.POSITIVE_INFINITY
    shown.push(row)

    if (collapsed.has(row.line)) {
      hideBelow = row.depth
    }
  }

  return shown
}

function activeOutlineLine(rows: OutlineRow[], cursor: number) {
  let best = 0

  for (const row of rows) {
    if (row.line <= cursor) {
      best = row.line
    } else {
      break
    }
  }

  return best
}

function relativeTime(seconds: number, locale: string) {
  const delta = Math.max(0, Date.now() / 1000 - seconds)
  const format = new Intl.RelativeTimeFormat(locale || 'en', { numeric: 'auto' })

  if (delta < 60) {
    return format.format(-Math.round(delta), 'second')
  }

  if (delta < 3600) {
    return format.format(-Math.round(delta / 60), 'minute')
  }

  if (delta < 86400) {
    return format.format(-Math.round(delta / 3600), 'hour')
  }

  return format.format(-Math.round(delta / 86400), 'day')
}

function outlineRows(path: string, text: string): OutlineRow[] {
  const markdown = /\.mdx?$/i.test(path)
  const rows: OutlineRow[] = []

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()

    if (markdown) {
      const heading = /^(#{1,6})\s+(\S.*)$/.exec(line)

      if (heading) {
        rows.push({
          depth: heading[1].length - 1,
          kind: 'heading',
          line: index + 1,
          name: heading[2].replace(/\s+#+\s*$/, '')
        })
      }

      return
    }

    const symbol = /^(?:export\s+)?(?:async\s+)?(function|class|interface|type|def)\s+(\w+)/.exec(line)

    if (!symbol) {
      return
    }

    const word = symbol[1]
    const kind = word === 'class' ? 'class' : word === 'type' || word === 'interface' ? 'type' : 'function'

    rows.push({ depth: 0, kind, line: index + 1, name: symbol[2] })
  })

  return rows.slice(0, 80)
}
