import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { openSession } from '@/app/open-session'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { sessionTitle } from '@/lib/chat-runtime'
import { cn } from '@/lib/utils'
import { requestFreshSession } from '@/store/profile'
import { $sessions, $selectedStoredSessionId } from '@/store/session'

/** Chat column header: the open conversation as a tab, plus new-chat and history. */
export function IdeChatHeader({
  changesOpen,
  folder,
  onChanges,
  onClose,
  onShowChat
}: {
  changesOpen: boolean
  folder: string
  onChanges: () => void
  onClose: () => void
  onShowChat: () => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const sessions = useStore($sessions)
  const selected = useStore($selectedStoredSessionId)
  const [historyOpen, setHistoryOpen] = useState(false)
  const rows = useMemo(
    () =>
      sessions
        .filter(session => !session.hidden)
        .slice()
        .sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
        .slice(0, 40),
    [sessions]
  )
  const current = rows.find(session => session.id === selected)
  const title = current ? sessionTitle(current) : folder || t.ide.newChat

  return (
    <div className="relative shrink-0 border-b border-(--ui-stroke-secondary) bg-(--ui-bg-chrome)">
      <div className="flex h-9 items-center">
        <div
          className={cn(
            'flex h-full min-w-0 max-w-[70%] items-center gap-1.5 border-r border-(--ui-stroke-secondary) px-2',
            changesOpen ? 'text-muted-foreground' : 'bg-background text-foreground'
          )}
        >
          <button className="flex min-w-0 items-center gap-1.5" onClick={onShowChat} type="button">
            <Codicon name="comment-discussion" size={14} />
            <span className="truncate text-xs">{title}</span>
          </button>
          <button
            aria-label={t.ide.closeTab}
            className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-(--ui-control-hover-background)"
            onClick={onClose}
            type="button"
          >
            <Codicon name="close" size={12} />
          </button>
        </div>
        <div className="flex-1" />
        <HeaderButton
          icon="add"
          label={t.ide.newChat}
          onClick={() => {
            setHistoryOpen(false)
            requestFreshSession()
          }}
        />
        <HeaderButton icon="history" label={t.ide.history} onClick={() => setHistoryOpen(open => !open)} pressed={historyOpen} />
        <HeaderButton icon="layout-sidebar-right" label={t.ide.changesPane} onClick={onChanges} pressed={changesOpen} />
      </div>
      {historyOpen && (
        <div className="absolute inset-x-0 top-9 z-20 max-h-72 overflow-auto border-b border-(--ui-stroke-secondary) bg-background shadow-md">
          {rows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{t.ide.historyEmpty}</p>}
          {rows.map(session => (
            <button
              key={session.id}
              className={cn(
                'block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background)',
                session.id === selected && 'bg-(--ui-control-hover-background)'
              )}
              onClick={() => {
                setHistoryOpen(false)
                openSession(session.id, navigate, 'in-place')
              }}
              title={sessionTitle(session)}
              type="button"
            >
              {sessionTitle(session)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function HeaderButton({
  icon,
  label,
  pressed,
  onClick
}: {
  icon: string
  label: string
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={pressed}
      className={cn(
        'flex size-8 items-center justify-center text-muted-foreground hover:text-foreground',
        pressed && 'text-foreground'
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Codicon name={icon} size={16} />
    </button>
  )
}
