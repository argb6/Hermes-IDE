import { type ReactNode } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

/** Collapsible side-bar group: chevron, label, and an optional count pill. */
export function IdeDisclosure({
  children,
  count,
  open,
  title,
  uppercase = false,
  onToggle
}: {
  children?: ReactNode
  count?: number
  open: boolean
  title: string
  uppercase?: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <button
        className={cn(
          'flex h-7 w-full items-center gap-1 px-2 text-left text-[11px] font-semibold text-muted-foreground hover:text-foreground',
          uppercase && 'tracking-wide uppercase'
        )}
        onClick={onToggle}
        type="button"
      >
        <Codicon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        <span className="min-w-0 truncate">{title}</span>
        {typeof count === 'number' && (
          <span className="ml-auto rounded-full bg-(--ui-bg-quaternary) px-1.5 text-[10px] font-medium text-foreground">
            {count}
          </span>
        )}
      </button>
      {open && children}
    </div>
  )
}
