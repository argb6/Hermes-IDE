import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { TerminalPaneChrome } from '@/app/right-sidebar/terminal/chrome'
import {
  $activeTerminalId,
  $terminals,
  closeOtherTerminals,
  closeTerminal,
  createTerminal,
  renameTerminal,
  selectTerminal,
  setTerminalAppearance,
  TERMINAL_COLOR_CHOICES,
  TERMINAL_ICON_CHOICES
} from '@/app/right-sidebar/terminal/terminals'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { $ideShell, IDE_SHELLS, setIdeShell, type IdeShell } from './ide-shells'

const TABS = ['problems', 'output', 'debug', 'terminal', 'ports'] as const

export type IdeBottomTab = (typeof TABS)[number]

/** Bottom panel chrome: the tab row and the terminal toolbar. */
export function IdePanel({
  cwd,
  fileName,
  onClose,
  onTab,
  tab
}: {
  cwd: null | string
  fileName?: string
  onClose: () => void
  onTab?: (tab: IdeBottomTab) => void
  tab?: IdeBottomTab
}) {
  const { t } = useI18n()
  const terminals = useStore($terminals)
  const activeId = useStore($activeTerminalId)
  const [localTab, setLocalTab] = useState<IdeBottomTab>(tab ?? 'terminal')
  const shownTab = tab ?? localTab
  const setTab = (next: IdeBottomTab) => {
    setLocalTab(next)
    onTab?.(next)
  }
  const [menu, setMenu] = useState<null | 'actions' | 'profiles'>(null)
  const [hover, setHover] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [picker, setPicker] = useState<null | 'color' | 'icon'>(null)
  const [draft, setDraft] = useState('')
  const barRef = useRef<HTMLDivElement>(null)
  const chosen = useStore($ideShell)
  const active = terminals.find(term => term.id === activeId)
  const shown = (active?.shell as IdeShell | undefined) || chosen
  const shellLabel: Record<IdeShell, string> = {
    cmd: t.ide.shellCmd,
    powershell: t.ide.shellPowershell,
    pwsh: t.ide.shellPwsh
  }
  const name = active?.title || shellLabel[shown] || shown
  const place = active?.restoreCwd || active?.cwd || cwd || ''
  const label: Record<IdeBottomTab, string> = {
    debug: t.ide.debugConsole,
    output: t.ide.output,
    ports: t.ide.ports,
    problems: t.ide.problems,
    terminal: t.ide.terminal
  }
  const empty: Record<Exclude<IdeBottomTab, 'terminal'>, string> = {
    debug: t.ide.debugEmpty,
    output: t.ide.outputEmpty,
    ports: t.ide.portsEmpty,
    problems: fileName ? `${fileName} — ${t.ide.problemsEmpty}` : t.ide.problemsEmpty
  }

  const openShell = (shell: IdeShell = chosen) => {
    setIdeShell(shell)
    createTerminal(cwd || undefined, shell)
    setTab('terminal')
    setMenu(null)
  }

  useEffect(() => {
    if (!menu) {
      return
    }

    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) {
        setMenu(null)
        setRenaming(false)
        setPicker(null)
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null)
        setRenaming(false)
        setPicker(null)
      }
    }

    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const saveName = () => {
    if (activeId) {
      renameTerminal(activeId, draft)
    }

    setRenaming(false)
    setMenu(null)
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-(--ui-terminal-surface-background)">
      <div className="flex h-9 shrink-0 items-center border-b border-(--ui-stroke-secondary) pr-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2">
          {TABS.map(item => (
            <button
              className={cn(
                'rounded px-2 py-1 text-xs whitespace-nowrap',
                shownTab === item ? 'bg-(--ui-control-hover-background) text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              key={item}
              onClick={() => {
                setTab(item)

                if (item === 'terminal' && terminals.length === 0) {
                  openShell()
                }
              }}
              type="button"
            >
              {label[item]}
            </button>
          ))}
        </div>
        <div className="relative flex shrink-0 items-center text-muted-foreground" ref={barRef}>
          <div
            className="relative"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <button
              className="flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-(--ui-control-hover-background)"
              onClick={() => {
                setHover(false)
                setPicker(null)
                setRenaming(false)
                setMenu(open => (open === 'actions' ? null : 'actions'))
              }}
              style={active?.color ? { color: active.color } : undefined}
              type="button"
            >
              <Codicon name={active?.icon || 'terminal'} size={14} />
              {name}
              <Codicon name="chevron-down" size={12} />
            </button>
            {hover && menu !== 'actions' && (
              <div className="absolute bottom-8 left-0 z-30 w-max max-w-72 rounded-md border border-(--ui-stroke-secondary) bg-popover px-2 py-1.5 shadow-lg">
                <p className="text-xs text-foreground">{name}</p>
                {place && <p className="truncate text-[11px] text-muted-foreground">{place}</p>}
              </div>
            )}
            {menu === 'actions' && (
              <div className="absolute bottom-8 left-0 z-30 w-56 rounded-md border border-(--ui-stroke-secondary) bg-popover py-1 shadow-lg">
                {terminals.length > 1 &&
                  terminals.map(term => (
                    <button
                      className={cn(
                        'flex h-7 w-full items-center gap-2 px-2 text-left text-xs hover:bg-(--ui-control-hover-background)',
                        term.id === activeId && 'text-foreground'
                      )}
                      key={term.id}
                      onClick={() => {
                        selectTerminal(term.id)
                        setMenu(null)
                      }}
                      style={term.color ? { color: term.color } : undefined}
                      type="button"
                    >
                      <Codicon name={term.icon || 'terminal'} size={14} />
                      <span className="truncate">{term.title}</span>
                    </button>
                  ))}
                {terminals.length > 1 && <div className="my-1 h-px bg-(--ui-stroke-secondary)" />}
                {renaming ? (
                  <form
                    className="px-2 py-1"
                    onSubmit={event => {
                      event.preventDefault()
                      saveName()
                    }}
                  >
                    <input
                      autoFocus
                      className="h-7 w-full rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-xs text-foreground"
                      onChange={event => setDraft(event.target.value)}
                      value={draft}
                    />
                  </form>
                ) : (
                  <MenuRow
                    disabled={!activeId}
                    label={t.ide.terminalRename}
                    onClick={() => {
                      setDraft(active?.title || name)
                      setPicker(null)
                      setRenaming(true)
                    }}
                  />
                )}
                <MenuRow
                  disabled={!activeId}
                  label={t.ide.terminalColor}
                  onClick={() => setPicker(open => (open === 'color' ? null : 'color'))}
                />
                {picker === 'color' && (
                  <div className="flex gap-1 px-2 py-1">
                    <button
                      aria-label={t.ide.terminalColor}
                      className="size-4 rounded-full border border-(--ui-stroke-secondary)"
                      onClick={() => activeId && setTerminalAppearance(activeId, { color: '' })}
                      type="button"
                    />
                    {TERMINAL_COLOR_CHOICES.map(color => (
                      <button
                        aria-label={color}
                        className="size-4 rounded-full"
                        key={color}
                        onClick={() => activeId && setTerminalAppearance(activeId, { color })}
                        style={{ background: color }}
                        type="button"
                      />
                    ))}
                  </div>
                )}
                <MenuRow
                  disabled={!activeId}
                  label={t.ide.terminalIcon}
                  onClick={() => setPicker(open => (open === 'icon' ? null : 'icon'))}
                />
                {picker === 'icon' && (
                  <div className="flex gap-1 px-2 py-1">
                    {TERMINAL_ICON_CHOICES.map(icon => (
                      <button
                        aria-label={icon}
                        className="flex size-6 items-center justify-center rounded hover:bg-(--ui-control-hover-background)"
                        key={icon}
                        onClick={() => activeId && setTerminalAppearance(activeId, { icon })}
                        type="button"
                      >
                        <Codicon name={icon} size={14} />
                      </button>
                    ))}
                  </div>
                )}
                {activeId && terminals.length > 1 && (
                  <MenuRow
                    label={t.ide.closeOtherTerminals}
                    onClick={() => {
                      closeOtherTerminals(activeId)
                      setMenu(null)
                    }}
                  />
                )}
                <div className="my-1 h-px bg-(--ui-stroke-secondary)" />
                <MenuRow
                  disabled={!activeId}
                  label={t.ide.killTerminal}
                  onClick={() => {
                    if (activeId) {
                      closeTerminal(activeId)
                    }

                    setMenu(null)
                  }}
                />
              </div>
            )}
          </div>
          <PanelButton icon="add" label={t.ide.newTerminal} onClick={() => openShell()} />
          <div className="relative">
            <PanelButton
              icon="chevron-down"
              label={t.ide.newTerminal}
              onClick={() => {
                setHover(false)
                setMenu(open => (open === 'profiles' ? null : 'profiles'))
              }}
            />
            {menu === 'profiles' && (
              <div className="absolute bottom-8 right-0 z-30 w-44 rounded-md border border-(--ui-stroke-secondary) bg-popover py-1 shadow-lg">
                {IDE_SHELLS.map(shell => (
                  <button
                    className={cn(
                      'flex h-7 w-full items-center px-2 text-left text-xs hover:bg-(--ui-control-hover-background)',
                      shell === chosen && 'text-foreground'
                    )}
                    key={shell}
                    onClick={() => openShell(shell)}
                    type="button"
                  >
                    {shellLabel[shell]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <PanelButton
            icon="trash"
            label={t.ide.killTerminal}
            onClick={() => {
              if (activeId) {
                closeTerminal(activeId)
              }
            }}
          />
          <PanelButton icon="close" label={t.ide.closePanel} onClick={onClose} />
        </div>
      </div>
      <div className={cn('min-h-0 flex-1', shownTab === 'terminal' ? 'flex' : 'hidden')}>
        <TerminalPaneChrome showRail={false} />
      </div>
      {shownTab !== 'terminal' && <p className="px-3 py-2 text-xs text-muted-foreground">{empty[shownTab]}</p>}
    </div>
  )
}

function MenuRow({ disabled, label, onClick }: { disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className="flex h-7 w-full items-center px-2 text-left text-xs hover:bg-(--ui-control-hover-background) disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function PanelButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="flex size-7 items-center justify-center rounded hover:bg-(--ui-control-hover-background) hover:text-foreground"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Codicon name={icon} size={16} />
    </button>
  )
}
