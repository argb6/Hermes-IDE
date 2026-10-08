import { useStore } from '@nanostores/react'
import { Activity, AlertCircle, Loader2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { COMMAND_CENTER_ROUTE } from '@/app/routes'
import { GatewayMenuPanel } from '@/app/shell/gateway-menu-panel'
import { useStatusSnapshot } from '@/app/shell/hooks/use-status-snapshot'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import { statusBarGatewayHealth } from '@/lib/gateway-health-pill'
import { cn } from '@/lib/utils'
import { $activeConnectionId } from '@/store/connections'
import { requestGatewayForProfile } from '@/store/gateway'
import { $activeGatewayProfile } from '@/store/profile'
import { $gatewayState } from '@/store/session'
import { $gatewayRestarting } from '@/store/system-actions'

/**
 * Live gateway chip for the Agent mode profile-rail foot — fills the empty
 * stretch between the home square and the +/import/manage/plug cluster.
 */
export function ProfileRailGatewayStatus() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const gatewayState = useStore($gatewayState)
  const activeConnectionId = useStore($activeConnectionId)
  const activeGatewayProfile = useStore($activeGatewayProfile)
  const gatewayRestarting = useStore($gatewayRestarting)

  const requestGateway = useCallback(
    <T,>(method: string, params?: Record<string, unknown>): Promise<T> =>
      requestGatewayForProfile<T>(activeGatewayProfile, method, params ?? {}),
    [activeGatewayProfile]
  )
  const { inferenceStatus, statusSnapshot } = useStatusSnapshot(
    gatewayState,
    requestGateway,
    `${activeConnectionId ?? ''}\0${activeGatewayProfile}`
  )

  const copy = t.shell.statusbar
  const gatewayHealth = statusBarGatewayHealth({
    connectionState: gatewayState ?? '',
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
    platforms: statusSnapshot?.gateway_platforms,
    restarting: gatewayRestarting
  })

  const inferenceReady = gatewayState === 'open' && inferenceStatus?.ready === true && !gatewayHealth.degraded
  const gatewayDegraded = gatewayState === 'open' || gatewayState === 'connecting' || gatewayHealth.degraded
  const toneClass = inferenceReady
    ? 'text-muted-foreground hover:text-foreground'
    : gatewayDegraded
      ? 'text-amber-600 hover:text-amber-600'
      : 'text-destructive hover:text-destructive'

  const tip = gatewayHealth.title || inferenceStatus?.reason || gatewayHealth.detail
  const label = `${copy.gatewayTitle} ${gatewayHealth.detail}`

  const menu = useMemo(
    () => (
      <GatewayMenuPanel
        gatewayState={gatewayState ?? ''}
        inferenceStatus={inferenceStatus}
        onClose={() => setOpen(false)}
        onOpenSystem={() => {
          setOpen(false)
          navigate(`${COMMAND_CENTER_ROUTE}?section=system`)
        }}
        statusSnapshot={statusSnapshot}
      />
    ),
    [gatewayState, inferenceStatus, navigate, statusSnapshot]
  )

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            'flex max-w-[9.5rem] shrink-0 items-center gap-1 truncate rounded-[3px] px-1.5 py-0.5 text-left text-[0.6875rem] transition hover:bg-(--ui-control-hover-background)',
            toneClass
          )}
          data-slot="profile-rail-gateway-status"
          title={tip}
          type="button"
        >
          {gatewayRestarting ? (
            <Loader2 aria-hidden className="size-3 shrink-0 animate-spin" />
          ) : inferenceReady ? (
            <Activity aria-hidden className="size-3 shrink-0" />
          ) : (
            <AlertCircle aria-hidden className="size-3 shrink-0" />
          )}
          <span className="truncate">{copy.gatewayTitle}</span>
          <span className="truncate opacity-90">{gatewayHealth.detail}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0" side="top" sideOffset={8}>
        {menu}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
