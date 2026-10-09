import { useStore } from '@nanostores/react'
import { useEffect, useState, type ReactNode } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import {
  addDebugWatch,
  debugContinue,
  debugEvaluate,
  debugPause,
  debugRestart,
  debugStart,
  debugStep,
  debugStop,
  ensureDebugEvents,
  removeDebugWatch,
  selectDebugFrame
} from './ide-debug-session'
import { requestIdeGoto } from './ide-nav'
import {
  $debugConsole,
  $debugFrames,
  $debugNotice,
  $debugPhase,
  $debugVariables,
  $debugWatch,
  $ideBreakpoints,
  clearIdeBreakpoints,
  setAllBreakpointsEnabled
} from './ide-state'

const TOOLS = [
  { icon: 'debug-start', id: 'start', run: () => void debugStart(false) },
  { icon: 'debug-continue', id: 'continue', run: () => void debugContinue() },
  { icon: 'debug-pause', id: 'pause', run: () => void debugPause() },
  { icon: 'debug-step-over', id: 'over', run: () => void debugStep('next') },
  { icon: 'debug-step-into', id: 'into', run: () => void debugStep('stepIn') },
  { icon: 'debug-step-out', id: 'out', run: () => void debugStep('stepOut') },
  { icon: 'debug-restart', id: 'restart', run: () => void debugRestart() },
  { icon: 'debug-stop', id: 'stop', run: () => void debugStop() }
] as const

export function IdeDebugToolbar({ className }: { className?: string }) {
  const { t } = useI18n()
  const label = {
    continue: t.ide.debugContinue,
    into: t.ide.debugStepInto,
    out: t.ide.debugStepOut,
    over: t.ide.debugStepOver,
    pause: t.ide.debugPause,
    restart: t.ide.debugRestart,
    start: t.ide.debugStart,
    stop: t.ide.debugStop
  }

  useEffect(() => {
    ensureDebugEvents()
  }, [])

  return (
    <div className={cn('flex h-8 shrink-0 items-center gap-0.5 px-1', className)}>
      {TOOLS.map(tool => (
        <button
          aria-label={label[tool.id]}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-(--ui-control-hover-background) hover:text-foreground"
          key={tool.id}
          onClick={tool.run}
          title={label[tool.id]}
          type="button"
        >
          <Codicon name={tool.icon} size={16} />
        </button>
      ))}
    </div>
  )
}

export function IdeDebugSidebar() {
  const { t } = useI18n()
  const phase = useStore($debugPhase)
  const notice = useStore($debugNotice)
  const variables = useStore($debugVariables)
  const frames = useStore($debugFrames)
  const watch = useStore($debugWatch)
  const breakpoints = useStore($ideBreakpoints)
  const [expression, setExpression] = useState('')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <IdeDebugToolbar />
      {phase === 'unavailable' && <p className="px-3 py-1 text-xs text-muted-foreground">{t.ide.debugUnavailable}</p>}
      {notice === 'need-file' && <p className="px-3 py-1 text-xs text-muted-foreground">{t.ide.debugNeedFile}</p>}
      <Section title={t.ide.debugVariables}>
        {variables.length === 0 && <Empty />}
        {variables.map(item => (
          <Row key={item.name} label={item.name} value={item.value} />
        ))}
      </Section>
      <Section title={t.ide.debugWatch}>
        <form
          onSubmit={event => {
            event.preventDefault()
            void addDebugWatch(expression)
            setExpression('')
          }}
        >
          <input
            className="mx-2 mb-1 w-[calc(100%-1rem)] rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-xs"
            onChange={event => setExpression(event.target.value)}
            placeholder={t.ide.debugWatchPlaceholder}
            value={expression}
          />
        </form>
        {watch.map(item => (
          <button
            className="block w-full truncate px-3 py-0.5 text-left text-xs hover:bg-(--ui-control-hover-background)"
            key={item.expression}
            onClick={() => removeDebugWatch(item.expression)}
            type="button"
          >
            {item.expression}
            {item.value ? `: ${item.value}` : ''}
          </button>
        ))}
      </Section>
      <Section title={t.ide.debugCallStack}>
        {frames.length === 0 && <Empty />}
        {frames.map(frame => (
          <button
            className="block w-full truncate px-3 py-0.5 text-left text-xs hover:bg-(--ui-control-hover-background)"
            key={frame.id}
            onClick={() => selectDebugFrame(frame)}
            type="button"
          >
            {frame.name}
            {frame.path ? ` — ${leaf(frame.path)}:${frame.line}` : ''}
          </button>
        ))}
      </Section>
      <Section
        action={() => {
          setAllBreakpointsEnabled(false)
          clearIdeBreakpoints()
        }}
        title={t.ide.debugBreakpoints}
      >
        {breakpoints.length === 0 && <Empty />}
        {breakpoints.map(item => (
          <button
            className="flex w-full items-center gap-2 px-3 py-0.5 text-left text-xs hover:bg-(--ui-control-hover-background)"
            key={`${item.path}:${item.line}`}
            onClick={() => requestIdeGoto(item.path, item.line)}
            type="button"
          >
            <span className={cn('size-2 shrink-0 rounded-full', item.enabled ? 'bg-[#e51400]' : 'bg-muted-foreground')} />
            <span className="truncate">
              {leaf(item.path)}:{item.line}
              {item.condition ? ` if ${item.condition}` : ''}
            </span>
          </button>
        ))}
      </Section>
    </div>
  )
}

export function IdeDebugConsole() {
  const { t } = useI18n()
  const lines = useStore($debugConsole)
  const [draft, setDraft] = useState('')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground">
        {lines.length === 0 ? t.ide.debugEmpty : lines.join('\n')}
      </pre>
      <form
        className="shrink-0 border-t border-(--ui-stroke-secondary)"
        onSubmit={event => {
          event.preventDefault()
          const expression = draft.trim()

          if (!expression) {
            return
          }

          void debugEvaluate(expression)
          setDraft('')
        }}
      >
        <input
          className="w-full bg-transparent px-3 py-1.5 font-mono text-xs outline-none"
          onChange={event => setDraft(event.target.value)}
          placeholder={t.ide.debugConsolePlaceholder}
          value={draft}
        />
      </form>
    </div>
  )
}

function Section({
  action,
  children,
  title
}: {
  action?: () => void
  children: ReactNode
  title: string
}) {
  return (
    <section className="border-t border-(--ui-stroke-secondary) py-1">
      <div className="flex items-center justify-between px-3 py-1">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
        {action && (
          <button className="text-muted-foreground hover:text-foreground" onClick={action} type="button">
            <Codicon name="close-all" size={12} />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="truncate px-3 py-0.5 font-mono text-xs">
      {label}: {value}
    </p>
  )
}

function Empty() {
  return null
}

function leaf(path: string) {
  return path.split(/[\\/]/).pop() || path
}
