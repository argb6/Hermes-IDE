import { useStore } from '@nanostores/react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { requestIdeGoto } from './ide-nav'
import { $ideDiagnostics } from './ide-state'

export function IdeProblems() {
  const { t } = useI18n()
  const items = useStore($ideDiagnostics)

  if (items.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">{t.ide.problemsEmpty}</p>
  }

  return (
    <div className="h-full overflow-auto py-1">
      {items.map(item => (
        <button
          className="flex w-full items-baseline gap-2 px-3 py-0.5 text-left text-xs hover:bg-(--ui-control-hover-background)"
          key={`${item.uri}:${item.line}:${item.character}:${item.message}`}
          onClick={() => requestIdeGoto(item.path, item.line, item.character)}
          type="button"
        >
          <span
            className={cn(
              'shrink-0',
              item.severity === 2 ? 'text-[#cca700]' : item.severity >= 3 ? 'text-[#3794ff]' : 'text-[#f14c4c]'
            )}
          >
            {item.severity === 2 ? t.ide.problemsWarn : item.severity >= 3 ? t.ide.problemsInfo : t.ide.problemsError}
          </span>
          <span className="min-w-0 flex-1 truncate">{item.message}</span>
          <span className="shrink-0 text-muted-foreground">
            {leaf(item.path)}:{item.line}
          </span>
        </button>
      ))}
    </div>
  )
}

function leaf(path: string) {
  return path.split(/[\\/]/).pop() || path
}
