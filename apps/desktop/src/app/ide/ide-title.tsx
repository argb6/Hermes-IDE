import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { openCommandPalette } from '@/store/command-palette'

import { runIdeCommand } from './ide-commands'
import {
  $ideNav,
  $ideQuickOpen,
  $ideTimeline,
  ideBack,
  ideForward,
  requestIdeOpen,
  requestIdeOutline,
  requestIdeSideToggle
} from './ide-nav'

/** Centered folder pill. Clicking it opens quick open. */
export function IdeTitleCenter() {
  const { t } = useI18n()
  const nav = useStore($ideNav)
  const timeline = useStore($ideTimeline)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return $ideQuickOpen.subscribe(tick => {
      if (tick > 0) {
        setOpen(true)
      }
    })
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const recent = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return timeline
      .filter(item => !needle || item.path.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [query, timeline])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const actions = [
    {
      icon: 'go-to-file',
      label: t.ide.quickFile,
      run: () => undefined
    },
    {
      icon: 'symbol-misc',
      label: t.ide.quickCommands,
      run: () => openCommandPalette()
    },
    {
      icon: 'search',
      label: t.ide.quickText,
      run: () => runIdeCommand('view.search')
    },
    {
      icon: 'symbol-method',
      label: t.ide.quickSymbol,
      run: () => {
        runIdeCommand('view.files')
        requestIdeOutline()
      }
    },
    {
      icon: 'terminal',
      label: t.ide.quickTask,
      run: () => runIdeCommand('terminal.new')
    }
  ].filter(action => !query.trim() || action.label.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-70 flex h-[34px] items-center justify-center">
      <div className="pointer-events-auto flex items-center [-webkit-app-region:no-drag]" ref={rootRef}>
        <TitleButton disabled={!nav.canBack} icon="chevron-left" onClick={ideBack} />
        <TitleButton disabled={!nav.canForward} icon="chevron-right" onClick={ideForward} />
        <button
          className="ml-1 flex h-6 max-w-72 items-center gap-1 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) px-3 text-xs text-foreground hover:bg-(--ui-control-hover-background)"
          onClick={() => setOpen(value => !value)}
          type="button"
        >
          <span className="truncate">{nav.title || t.ide.quickPlaceholder}</span>
          <Codicon name="chevron-down" size={12} />
        </button>
        {open && (
          <div className="absolute top-8 left-1/2 z-80 w-[28rem] -translate-x-1/2 overflow-hidden rounded-lg border border-(--ui-stroke-secondary) bg-popover shadow-lg">
            <input
              autoFocus
              className="h-9 w-full border-b border-(--ui-stroke-secondary) bg-transparent px-3 text-sm outline-none"
              onChange={event => setQuery(event.target.value)}
              placeholder={t.ide.quickPlaceholder}
              value={query}
            />
            <div className="max-h-80 overflow-y-auto py-1">
              {actions.map(action => (
                <button
                  className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm hover:bg-(--ui-control-hover-background)"
                  key={action.label}
                  onClick={() => {
                    action.run()

                    if (action.icon !== 'go-to-file') {
                      close()
                    }
                  }}
                  type="button"
                >
                  <Codicon name={action.icon} size={16} />
                  {action.label}
                </button>
              ))}
              {recent.length > 0 && (
                <div className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground">{t.ide.quickRecent}</div>
              )}
              {recent.map(item => (
                <button
                  className="flex h-8 w-full items-center px-3 text-left text-sm hover:bg-(--ui-control-hover-background)"
                  key={item.path}
                  onClick={() => {
                    requestIdeOpen(item.path)
                    close()
                  }}
                  title={item.path}
                  type="button"
                >
                  <span className="truncate">{item.path.split(/[\\/]/).pop()}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function IdeTitleTools() {
  const { t } = useI18n()

  return (
    <div className="mr-1 flex items-center">
      <TitleButton disabled={false} icon="layout-sidebar-left" onClick={requestIdeSideToggle} />
      <TitleButton disabled={false} icon="layout-panel" onClick={() => runIdeCommand('view.terminal')} />
      <TitleButton disabled={false} icon="layout-sidebar-right" onClick={() => runIdeCommand('view.chat')} />
      <span className="sr-only">{t.ide.terminal}</span>
    </div>
  )
}

function TitleButton({ disabled, icon, onClick }: { disabled: boolean; icon: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        'flex size-6 items-center justify-center rounded text-muted-foreground',
        disabled ? 'opacity-40' : 'hover:bg-(--ui-control-hover-background) hover:text-foreground'
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Codicon name={icon} size={16} />
    </button>
  )
}
