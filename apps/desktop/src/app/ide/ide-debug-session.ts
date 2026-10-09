import { $focusedWorkspaceCwd } from '@/store/session-states'

import { dapLaunchArguments, dapSend, dapStart, dapStop, onDapEvent } from './dap-client'
import { $ideEditor } from './ide-editor'
import { debugAdapterFor } from './ide-language'
import { requestIdeGoto } from './ide-nav'
import {
  $debugConsole,
  $debugFrameId,
  $debugFrames,
  $debugLocation,
  $debugNotice,
  $debugPhase,
  $debugSessionId,
  $debugThreadId,
  $debugVariables,
  $debugWatch,
  $ideBreakpoints,
  $ideBreakpointsEnabled,
  appendDebugConsole,
  type DebugFrame
} from './ide-state'

let listening = false
const configuring = new Map<string, Promise<void>>()

function record(value: unknown): null | Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function ensureDebugEvents() {
  if (listening) {
    return
  }

  listening = true
  onDapEvent(message => {
    void onDebugEvent(message.sessionId, message.event.event, message.event.body)
  })
  $ideBreakpoints.subscribe(() => {
    const sessionId = $debugSessionId.get()

    if (sessionId) {
      void pushBreakpoints(sessionId)
    }
  })
  $ideBreakpointsEnabled.subscribe(() => {
    const sessionId = $debugSessionId.get()

    if (sessionId) {
      void pushBreakpoints(sessionId)
    }
  })
}

export async function debugStart(noDebug = false) {
  ensureDebugEvents()
  const program = $ideEditor.get()?.path
  const cwd = $focusedWorkspaceCwd.get()
  const type = program ? debugAdapterFor(program) : null

  if (!cwd || !program || !type) {
    $debugNotice.set('need-file')

    return
  }

  $debugNotice.set(null)
  $debugConsole.set([])
  const started = await dapStart({
    adapter: type,
    launch: { cwd, program, request: 'launch' },
    workspaceRoot: cwd
  })

  if (!started.ok || !started.sessionId || started.status === 'unavailable') {
    $debugPhase.set('unavailable')
    $debugSessionId.set(null)

    return
  }

  const sessionId = started.sessionId

  $debugSessionId.set(sessionId)
  $debugPhase.set('running')
  const initialized = waitForInitialized(sessionId)

  const handshake = await dapSend({
    arguments: {
      adapterID: type,
      clientID: 'hermes-ide',
      clientName: 'Hermes IDE',
      columnsStartAt1: true,
      linesStartAt1: true,
      pathFormat: 'path'
    },
    command: 'initialize',
    sessionId
  })

  if (!handshake.ok && handshake.status === 'unavailable') {
    $debugPhase.set('unavailable')

    return
  }

  await dapSend({
    arguments: dapLaunchArguments({ adapter: type, cwd, noDebug, program, pythonPath: started.pythonPath }),
    command: 'launch',
    sessionId
  })
  await initialized
  await completeConfiguration(sessionId)
}

export async function debugContinue() {
  const sessionId = $debugSessionId.get()

  if (!sessionId) {
    await debugStart(false)

    return
  }

  await dapSend({ arguments: { threadId: $debugThreadId.get() }, command: 'continue', sessionId })
  $debugPhase.set('running')
}

export async function debugPause() {
  const sessionId = $debugSessionId.get()

  if (!sessionId) {
    return
  }

  let threadId = $debugThreadId.get()

  if (threadId == null) {
    threadId = await firstThread(sessionId)
  }

  await dapSend({ arguments: { threadId }, command: 'pause', sessionId })
}

export async function debugStep(command: 'next' | 'stepIn' | 'stepOut') {
  const sessionId = $debugSessionId.get()
  const threadId = $debugThreadId.get()

  if (!sessionId || threadId == null) {
    return
  }

  await dapSend({ arguments: { threadId }, command, sessionId })
}

export async function debugStop() {
  const sessionId = $debugSessionId.get()

  if (!sessionId) {
    $debugPhase.set('idle')

    return
  }

  await dapSend({ arguments: { terminateDebuggee: true }, command: 'disconnect', sessionId })
  await dapStop({ sessionId })
  configuring.delete(sessionId)
  $debugSessionId.set(null)
  $debugPhase.set('stopped')
  $debugLocation.set(null)
}

export async function debugRestart() {
  await debugStop()
  await debugStart(false)
}

export async function addDebugWatch(expression: string) {
  const trimmed = expression.trim()

  if (!trimmed) {
    return
  }

  $debugWatch.set([...$debugWatch.get(), { expression: trimmed, value: '' }])
  const sessionId = $debugSessionId.get()
  const frameId = $debugFrameId.get()

  if (sessionId && frameId != null) {
    await refreshWatch(sessionId, frameId)
  }
}

export function removeDebugWatch(expression: string) {
  $debugWatch.set($debugWatch.get().filter(item => item.expression !== expression))
}

export function selectDebugFrame(frame: DebugFrame) {
  $debugFrameId.set(frame.id)

  if (frame.path) {
    $debugLocation.set({ line: frame.line, path: frame.path })
    requestIdeGoto(frame.path, frame.line, frame.column)
  }

  const sessionId = $debugSessionId.get()

  if (sessionId) {
    void refreshVariables(sessionId, frame.id)
  }
}

export async function debugEvaluate(expression: string) {
  appendDebugConsole(`> ${expression}`)
  const sessionId = $debugSessionId.get()

  if (!sessionId) {
    return
  }

  const result = await dapSend({
    arguments: { context: 'repl', expression, frameId: $debugFrameId.get() },
    command: 'evaluate',
    sessionId
  })
  const body = record(result.response?.body)

  appendDebugConsole(typeof body?.result === 'string' ? body.result : result.response?.message || '')
}

async function onDebugEvent(sessionId: string, name: string, body: unknown) {
  if ($debugSessionId.get() !== sessionId) {
    return
  }

  if (name === 'output') {
    const text = record(body)?.output

    if (typeof text === 'string' && text) {
      appendDebugConsole(text.replace(/\n$/, ''))
    }

    return
  }

  if (name === 'continued') {
    $debugPhase.set('running')
    $debugLocation.set(null)

    return
  }

  if (name === 'terminated' || name === 'exited') {
    configuring.delete(sessionId)
    $debugPhase.set('stopped')
    $debugSessionId.set(null)
    $debugLocation.set(null)

    return
  }

  if (name === 'initialized') {
    await completeConfiguration(sessionId)

    return
  }

  if (name === 'stopped') {
    $debugPhase.set('paused')
    const threadId = record(body)?.threadId
    const chosen = typeof threadId === 'number' ? threadId : $debugThreadId.get()

    if (typeof threadId === 'number') {
      $debugThreadId.set(threadId)
    }

    await refreshStack(sessionId, chosen)
  }
}

function waitForInitialized(sessionId: string) {
  return new Promise<void>(resolve => {
    const timer = window.setTimeout(() => {
      off()
      resolve()
    }, 5_000)
    const off = onDapEvent(message => {
      if (message.sessionId === sessionId && message.event.event === 'initialized') {
        window.clearTimeout(timer)
        off()
        resolve()
      }
    })
  })
}

function completeConfiguration(sessionId: string) {
  const existing = configuring.get(sessionId)

  if (existing) {
    return existing
  }

  const run = (async () => {
    await pushBreakpoints(sessionId)
    await dapSend({ command: 'configurationDone', sessionId })
  })()

  configuring.set(sessionId, run)

  return run
}

async function pushBreakpoints(sessionId: string) {
  const enabled = $ideBreakpointsEnabled.get()
  const groups = new Map<string, { condition?: string; line: number }[]>()

  for (const item of $ideBreakpoints.get()) {
    const list = groups.get(item.path) ?? []

    if (enabled && item.enabled) {
      list.push({ condition: item.condition, line: item.line })
    }

    groups.set(item.path, list)
  }

  for (const [file, breakpoints] of groups) {
    await dapSend({
      arguments: { breakpoints, source: { path: file } },
      command: 'setBreakpoints',
      sessionId
    })
  }
}

async function firstThread(sessionId: string) {
  const threads = await dapSend({ command: 'threads', sessionId })
  const list = record(threads.response?.body)?.threads
  const first = Array.isArray(list) ? record(list[0]) : null

  if (typeof first?.id !== 'number') {
    return null
  }

  $debugThreadId.set(first.id)

  return first.id
}

async function refreshStack(sessionId: string, threadId: null | number) {
  if (threadId == null) {
    return
  }

  const response = await dapSend({ arguments: { threadId }, command: 'stackTrace', sessionId })
  const raw = record(response.response?.body)?.stackFrames
  const frames: DebugFrame[] = Array.isArray(raw) ? raw.flatMap(toFrame) : []

  $debugFrames.set(frames)
  const top = frames[0]

  if (!top) {
    return
  }

  $debugFrameId.set(top.id)

  if (top.path) {
    $debugLocation.set({ line: top.line, path: top.path })
    requestIdeGoto(top.path, top.line, top.column)
  }

  await refreshVariables(sessionId, top.id)
  await refreshWatch(sessionId, top.id)
}

function toFrame(item: unknown): DebugFrame[] {
  const frame = record(item)
  const source = record(frame?.source)

  if (!frame || typeof frame.id !== 'number' || typeof frame.name !== 'string') {
    return []
  }

  return [
    {
      column: typeof frame.column === 'number' ? frame.column : 1,
      id: frame.id,
      line: typeof frame.line === 'number' ? frame.line : 1,
      name: frame.name,
      path: typeof source?.path === 'string' ? source.path : ''
    }
  ]
}

async function refreshVariables(sessionId: string, frameId: number) {
  const scopes = await dapSend({ arguments: { frameId }, command: 'scopes', sessionId })
  const list = record(scopes.response?.body)?.scopes
  const scope = Array.isArray(list) ? record(list[0]) : null

  if (typeof scope?.variablesReference !== 'number') {
    $debugVariables.set([])

    return
  }

  const vars = await dapSend({
    arguments: { variablesReference: scope.variablesReference },
    command: 'variables',
    sessionId
  })
  const raw = record(vars.response?.body)?.variables

  $debugVariables.set(
    Array.isArray(raw)
      ? raw.flatMap(item => {
          const row = record(item)

          if (!row || typeof row.name !== 'string') {
            return []
          }

          return [{ name: row.name, value: typeof row.value === 'string' ? row.value : '' }]
        })
      : []
  )
}

async function refreshWatch(sessionId: string, frameId: number) {
  const next = []

  for (const item of $debugWatch.get()) {
    const result = await dapSend({
      arguments: { context: 'watch', expression: item.expression, frameId },
      command: 'evaluate',
      sessionId
    })
    const body = record(result.response?.body)

    next.push({
      expression: item.expression,
      value: typeof body?.result === 'string' ? body.result : result.response?.message || ''
    })
  }

  $debugWatch.set(next)
}
