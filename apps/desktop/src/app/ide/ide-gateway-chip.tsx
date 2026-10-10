import { useStore } from '@nanostores/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import { SETTINGS_ROUTE } from '@/app/routes'
import { GatewayMenuPanel } from '@/app/shell/gateway-menu-panel'
import { useStatusSnapshot } from '@/app/shell/hooks/use-status-snapshot'
import { useI18n } from '@/i18n'
import { statusBarGatewayHealth } from '@/lib/gateway-health-pill'
import { Activity, AlertCircle } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $activeConnectionId } from '@/store/connections'
import { $activeGatewayProfile } from '@/store/profile'
import { $gatewayState } from '@/store/session'

/** Compact gateway control for the IDE status bar (shell statusbar is not mounted in IDE mode). */
export function IdeGatewayChip() {
  const { t } = useI18n()
  const copy = t.shell.statusbar
  const navigate = useNavigate()
  const gatewayState = useStore($gatewayState)
  const activeConnectionId = useStore($activeConnectionId)
  const activeGatewayProfile = useStore($activeGatewayProfile)
  const gatewayScope = `${activeConnectionId ?? ''}\0${activeGatewayProfile}`
  const { requestGateway } = useGatewayRequest()
  const [open, setOpen] = useState(false)
  // The same snapshot + inference-readiness poll the shell statusbar runs.
  // Handing the health pill a permanent `inferenceStatus: null` is what used
  // to pin this chip on "checking" forever: null reads as "not yet checked".
  const { inferenceStatus, statusSnapshot } = useStatusSnapshot(gatewayState, requestGateway, gatewayScope)

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
    inferenceStatus,
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
        title={health.title || inferenceStatus?.reason || health.detail}
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
            inferenceStatus={inferenceStatus}
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
