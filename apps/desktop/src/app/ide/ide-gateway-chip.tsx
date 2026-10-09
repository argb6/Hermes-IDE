import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { SETTINGS_ROUTE } from '@/app/routes'
import { GatewayMenuPanel } from '@/app/shell/gateway-menu-panel'
import { getStatus } from '@/hermes'
import { useI18n } from '@/i18n'
import { statusBarGatewayHealth } from '@/lib/gateway-health-pill'
import { Activity, AlertCircle } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $gatewayState } from '@/store/session'
import type { StatusResponse } from '@/types/hermes'

/** Compact gateway control for the IDE status bar (shell statusbar is not mounted in IDE mode). */
export function IdeGatewayChip() {
  const { t } = useI18n()
  const copy = t.shell.statusbar
  const navigate = useNavigate()
  const gatewayState = useStore($gatewayState)
  const [open, setOpen] = useState(false)
  const [statusSnapshot, setStatusSnapshot] = useState<StatusResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const status = await getStatus()

        if (!cancelled) {
          setStatusSnapshot(status)
        }
      } catch {
        if (!cancelled) {
          setStatusSnapshot(null)
        }
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 60_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [gatewayState])

  const health = statusBarGatewayHealth({
    connectionState: gatewayState,
    copy: {
      backend: copy.backend,
      checking: copy.gatewayChecking,
      connecting: copy.gatewayConnecting,
      messagingDegraded: copy.messagingDegraded,
      messagingStopped: copy.messagingStopped,
      needsSetup: copy.gatewayNeedsSetup,
      offline: copy.gatewayOffline,
      ready: copy.gatewayReady,
      restarting: copy.gatewayRestarting,
      unavailable: copy.gatewayUnavailable
    },
    inferenceStatus: null,
    messagingRunning: statusSnapshot?.gateway_running,
    messagingState: statusSnapshot?.gateway_state,
    platforms: statusSnapshot?.gateway_platforms
  })

  const ready = gatewayState === 'open' && !health.degraded && health.detail === copy.gatewayReady

  return (
    <div className="relative">
      <button
        className={cn(
          'flex items-center gap-1 hover:text-foreground',
          health.degraded || gatewayState !== 'open' ? 'text-amber-500' : undefined
        )}
        onClick={() => setOpen(value => !value)}
        title={health.title || health.detail}
        type="button"
      >
        {ready ? <Activity className="size-3.5" /> : <AlertCircle className="size-3.5" />}
        <span>{copy.gatewayTitle}</span>
        <span className="max-w-28 truncate">{health.detail}</span>
      </button>
      {open && (
        <div className="absolute bottom-6 left-0 z-40 w-72 overflow-hidden rounded-md border border-(--ui-stroke-secondary) bg-popover shadow-lg">
          <GatewayMenuPanel
            gatewayState={gatewayState}
            inferenceStatus={null}
            onClose={() => setOpen(false)}
            onOpenSystem={() => {
              setOpen(false)
              navigate(`${SETTINGS_ROUTE}?tab=gateway`)
            }}
            statusSnapshot={statusSnapshot}
          />
        </div>
      )}
    </div>
  )
}
