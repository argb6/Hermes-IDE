import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $repoStatusByCwd, registerRepoStatusCwd } from '@/store/coding-status'

import { IdeCheckout } from './ide-checkout'
import { $ideEditor } from './ide-editor'
import { IdeGatewayChip } from './ide-gateway-chip'
import { $ideDiagnostics, $lspStatus } from './ide-state'
import { $fileEncoding, encodingLabel, FILE_ENCODINGS, setFileEncoding } from './ide-encoding'

/** LSP DiagnosticSeverity: 1 Error, 2 Warning, 3 Information, 4 Hint. */
function diagnosticCounts(items: { severity: number }[]) {
  let errors = 0
  let warnings = 0

  for (const item of items) {
    if (item.severity === 2) {
      warnings += 1
    } else if (item.severity === 1 || item.severity < 1) {
      // Missing severity treated as error (same as Monaco marker default).
      errors += 1
    }
  }

  return { errors, warnings }
}

/** Bottom status row: branch, gateway, LSP problem counts, and the terminal button. */
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
  const byCwd = useStore($repoStatusByCwd)
  const encoding = useStore($fileEncoding)
  const editor = useStore($ideEditor)
  const lsp = useStore($lspStatus)
  const diagnostics = useStore($ideDiagnostics)
  const [encodings, setEncodings] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const status = cwd ? (byCwd[cwd] ?? null) : null
  const { errors, warnings } = diagnosticCounts(diagnostics)

  useEffect(() => registerRepoStatusCwd(cwd), [cwd])

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) px-2 text-[12px] text-muted-foreground">
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
      <IdeGatewayChip />
      <button
        aria-label={`${t.ide.problemsError} ${errors}, ${t.ide.problemsWarn} ${warnings}`}
        className="flex items-center gap-1.5 hover:text-foreground"
        onClick={onOpenProblems}
        title={`${t.ide.problemsError} ${errors} · ${t.ide.problemsWarn} ${warnings}`}
        type="button"
      >
        <span className="inline-flex items-center gap-1">
          <Codicon name="error" size={14} />
          {errors}
        </span>
        <span className="inline-flex items-center gap-1">
          <Codicon name="warning" size={14} />
          {warnings}
        </span>
      </button>
      <LspIndicator lsp={lsp} />
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

function LspIndicator({ lsp }: { lsp: Record<string, 'crashed' | 'downloading' | 'ready' | 'unavailable'> }) {
  const { t } = useI18n()
  const label = {
    crashed: t.ide.lspCrashed,
    downloading: t.ide.lspDownloading,
    ready: t.ide.lspReady,
    unavailable: t.ide.lspOffline
  }
  const rows = Object.entries(lsp)

  if (rows.length === 0) {
    return null
  }

  return (
    <span className="max-w-48 truncate text-[11px]" title={rows.map(([language, state]) => `${language} ${label[state]}`).join(', ')}>
      {rows.map(([language, state]) => `${language}: ${label[state]}`).join(' · ')}
    </span>
  )
}
