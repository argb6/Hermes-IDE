import { useStore } from '@nanostores/react'

import { cn } from '@/lib/utils'
import { $backdrop } from '@/store/backdrop'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

/** Faint statue fill behind chat / IDE. `force` paints even when the
 *  Appearance toggle is off — IDE uses that so the main column always has
 *  the official backdrop without requiring a settings flip. */
export function Backdrop({ className, force = false }: { className?: string; force?: boolean }) {
  const on = useStore($backdrop)

  if (!force && !on) {
    return null
  }

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-2 opacity-[0.025] mix-blend-difference',
        className
      )}
    >
      <img
        alt=""
        className="h-[160dvh] w-auto min-w-dvw object-cover object-left-top [filter:invert(var(--backdrop-invert-mul,1))]"
        fetchPriority="low"
        src={assetPath('ds-assets/filler-bg0.jpg')}
      />
    </div>
  )
}
