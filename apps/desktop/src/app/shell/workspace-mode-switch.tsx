import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { $hudActive, closeHud } from '@/store/hud'
import { $workspaceMode, setWorkspaceMode, type WorkspaceMode } from '@/store/workspace-mode'

/** Agent is the chat-first window. IDE puts files and the open file in front
 *  and keeps that same conversation on the right. Both windows use the same
 *  current-mode pill; the other mode is a menu choice, not a second button. */
export function WorkspaceModeSwitch() {
  const { t } = useI18n()
  const mode = useStore($workspaceMode)
  const [menu, setMenu] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== 'ide') {
      return
    }

    if ($hudActive.get()) {
      closeHud()
    }
  }, [mode])

  useEffect(() => {
    if (!menu) {
      return
    }

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenu(false)
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false)
      }
    }

    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const choose = (next: WorkspaceMode) => {
    setMenu(false)

    if (next === mode) {
      return
    }

    triggerHaptic('tap')
    setWorkspaceMode(next)
  }

  const label = mode === 'ide' ? t.titlebar.workspaceIde : t.titlebar.workspaceAgent

  return (
    <div className="relative mr-1" ref={rootRef}>
      <button
        aria-expanded={menu}
        aria-haspopup="menu"
        aria-label={t.titlebar.workspaceModes}
        className="flex h-6 items-center gap-1 rounded-full bg-sky-700 px-2.5 text-[11px] text-white"
        onClick={() => setMenu(open => !open)}
        onPointerDown={event => event.stopPropagation()}
        type="button"
      >
        {label}
        <Codicon name="chevron-down" size={12} />
      </button>
      {menu && (
        <div
          className="absolute right-0 top-7 z-80 w-36 rounded-md border border-(--ui-stroke-secondary) bg-popover p-1 shadow-lg"
          role="menu"
        >
          <ModeRow active={mode === 'agent'} label={t.titlebar.workspaceAgent} onSelect={() => choose('agent')} />
          <ModeRow active={mode === 'ide'} label={t.titlebar.workspaceIde} onSelect={() => choose('ide')} />
        </div>
      )}
    </div>
  )
}

function ModeRow({ active = false, label, onSelect }: { active?: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      className={cn(
        'flex h-7 w-full items-center rounded px-2 text-left text-xs hover:bg-(--ui-control-hover-background)',
        active && 'bg-(--ui-control-hover-background) text-foreground'
      )}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  )
}

