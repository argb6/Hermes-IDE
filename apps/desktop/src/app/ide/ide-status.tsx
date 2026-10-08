import { useStore } from '@nanostores/react'
import { Activity, AlertCircle, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { COMMAND_CENTER_ROUTE } from '@/app/routes'
import { GatewayMenuPanel } from '@/app/shell/gateway-menu-panel'
import { useStatusSnapshot } from '@/app/shell/hooks/use-status-snapshot'
import { Codicon } from '@/components/ui/codicon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import { statusBarGatewayHealth } from '@/lib/gateway-health-pill'
import { cn } from '@/lib/utils'
import { $repoStatusByCwd, registerRepoStatusCwd } from '@/store/coding-status'
import { $activeConnectionId } from '@/store/connections'
import { requestGatewayForProfile } from '@/store/gateway'
import { $activeGatewayProfile } from '@/store/profile'
import { $gatewayState } from '@/store/session'
import { $gatewayRestarting } from '@/store/system-actions'

import { IdeCheckout } from './ide-checkout'
import { $ideEditor } from './ide-editor'
import { $fileEncoding, encodingLabel, FILE_ENCODINGS, setFileEncoding } from './ide-encoding'

/** Bottom status row: branch, problem counts, and the terminal button. */
export function IdeStatusBar({
  cwd,
  folder,
  terminalOpen,
  onOpenProblems,
  onOpenTerminal
}: {
  cwd: null | string
  folder: string
  terminalOpen: boolean
  onOpenProblems: () => void
  onOpenTerminal: () => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const byCwd = useStore($repoStatusByCwd)
  const encoding = useStore($fileEncoding)
  const editor = useStore($ideEditor)
  const [encodings, setEncodings] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [gatewayMenuOpen, setGatewayMenuOpen] = useState(false)
  const status = cwd ? (byCwd[cwd] ?? null) : null

  useEffect(() => registerRepoStatusCwd(cwd), [cwd])

  // Same gateway pill as agent mode — clickable menu for restart / logs / system.
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
  const gatewayClassName = inferenceReady
    ? undefined
    : gatewayDegraded
      ? 'text-amber-600 hover:text-amber-600'
      : 'text-destructive hover:text-destructive'

  const gatewayMenu = useMemo(
    () => (
      <GatewayMenuPanel
        gatewayState={gatewayState ?? ''}
        inferenceStatus={inferenceStatus}
        onClose={() => setGatewayMenuOpen(false)}
        onOpenSystem={() => {
          setGatewayMenuOpen(false)
          navigate(`${COMMAND_CENTER_ROUTE}?section=system`)
        }}
        statusSnapshot={statusSnapshot}
      />
    ),
    [gatewayState, inferenceStatus, navigate, statusSnapshot]
  )

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) px-2 text-[12px] text-muted-foreground">
      <DropdownMenu onOpenChange={setGatewayMenuOpen} open={gatewayMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-none hover:text-foreground',
              gatewayClassName
            )}
            title={gatewayHealth.title || inferenceStatus?.reason || gatewayHealth.detail || undefined}
            type="button"
          >
            {gatewayRestarting ? (
              <Loader2 aria-hidden className="size-3 animate-spin" />
            ) : inferenceReady ? (
              <Activity aria-hidden className="size-3" />
            ) : (
              <AlertCircle aria-hidden className="size-3" />
            )}
            <span>{copy.gatewayTitle}</span>
            <span>{gatewayHealth.detail}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-0" side="top" sideOffset={8}>
          {gatewayMenu}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="relative">
        <button
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => setCheckout(open => !open)}
          title={status?.branch || folder}
          type="button"
        >
          <Codicon name="source-control" size={14} />
          <span className="max-w-48 truncate">{status?.branch || '—'}</span>
        </button>
        {checkout && cwd && <IdeCheckout cwd={cwd} onClose={() => setCheckout(false)} />}
      </div>
      {folder && <span className="max-w-40 truncate">{folder}</span>}
      <button className="flex items-center gap-1 hover:text-foreground" onClick={onOpenProblems} type="button">
        <Codicon name="error" size={14} />
        {status?.conflicted ?? 0}
      </button>
      <button className="flex items-center gap-1 hover:text-foreground" onClick={onOpenProblems} type="button">
        <Codicon name="warning" size={14} />
        {status?.unstaged ?? 0}
      </button>
      <div className="flex-1" />
      {editor && (
        <span>
          {t.ide.editorLine(editor.line, editor.column)}
        </span>
      )}
      {editor && <span>{editor.indent === 'tab' ? t.ide.editorTab : t.ide.editorSpaces(editor.indent)}</span>}
      <div className="relative">
        <button className="hover:text-foreground" onClick={() => setEncodings(open => !open)} type="button">
          {encodingLabel(encoding)}
        </button>
        {encodings && (
          <div className="absolute bottom-6 right-0 z-30 w-36 rounded-md border border-(--ui-stroke-secondary) bg-popover py-1 shadow-lg">
            {FILE_ENCODINGS.map(item => (
              <button
                className={cn(
                  'flex h-7 w-full items-center px-2 text-left text-xs hover:bg-(--ui-control-hover-background)',
                  item === encoding && 'text-foreground'
                )}
                key={item}
                onClick={() => {
                  setFileEncoding(item)
                  setEncodings(false)
                }}
                type="button"
              >
                {encodingLabel(item)}
              </button>
            ))}
          </div>
        )}
      </div>
      {editor && <span>{editor.eol}</span>}
      {editor && <span>{editor.language}</span>}
      <button
        className={cn('flex items-center hover:text-foreground', terminalOpen && 'text-foreground')}
        onClick={onOpenTerminal}
        type="button"
      >
        <Codicon name="terminal" size={14} />
      </button>
    </div>
  )
}
