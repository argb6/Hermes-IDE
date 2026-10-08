import { useNavigate } from 'react-router'

import { SETTINGS_ROUTE } from '@/app/routes'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

export type IdePanel = 'files' | 'git' | 'github' | 'search'

const PANELS: { icon: string; id: IdePanel; label: 'files' | 'git' | 'github' | 'search' }[] = [
  { icon: 'files', id: 'files', label: 'files' },
  { icon: 'search', id: 'search', label: 'search' },
  { icon: 'source-control', id: 'git', label: 'git' },
  { icon: 'github', id: 'github', label: 'github' }
]

/** VS Code activity bar. The active icon shows a marker, and clicking it
 *  again folds the side bar. */
export function IdeActivityBar({
  panel,
  sideOpen,
  onPanel
}: {
  panel: IdePanel
  sideOpen: boolean
  onPanel: (panel: IdePanel) => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center gap-0.5 border-r border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) py-1">
      {PANELS.map(item => {
        const active = sideOpen && panel === item.id

        return (
          <button
            key={item.id}
            aria-pressed={active}
            className={cn(
              'relative flex size-12 items-center justify-center text-muted-foreground hover:text-foreground',
              active && 'text-foreground'
            )}
            onClick={() => onPanel(item.id)}
            title={t.ide[item.label]}
            type="button"
          >
            {active && <span className="absolute inset-y-2 left-0 w-0.5 bg-foreground" />}
            <Codicon name={item.icon} size={22} />
          </button>
        )
      })}
      <div className="flex-1" />
      <button
        className="flex size-12 items-center justify-center text-muted-foreground hover:text-foreground"
        onClick={() => navigate(SETTINGS_ROUTE)}
        title={t.titlebar.openSettings}
        type="button"
      >
        <Codicon name="settings-gear" size={22} />
      </button>
    </div>
  )
}
