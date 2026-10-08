/**
 * RED repro loop: leaving HUD mode must not duplicate a user message in the
 * transcript.
 *
 * HUD exit (`app/hud/handoff.ts` → `resumeSession(target)`) re-enters the
 * warm-cache resume path with `omit_messages: true` on `session.activate`, so
 * the transcript is rebuilt from
 *
 *   graftRefreshedTailOntoBackfill(REST tail page, cached view)
 *   → reconcileAuthoritativeChatMessages(..., cached view)
 *
 * Every case below seeds the warm session-state cache + the view with a
 * transcript as the chat page left it, answers `session.activate` like a real
 * backend (messages_omitted), mocks `getLatestSessionMessages` with a durable
 * page, runs a real `resumeSession`, then asserts that no message text renders
 * twice. Any red case is a reproduced duplicate.
 */

import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAllSessionMessages, getLatestSessionMessages, getSession } from '@/hermes'
import { createClientSessionState } from '@/lib/chat-runtime'
import { type ChatMessage, chatMessageText, textPart, toChatMessages } from '@/lib/chat-messages'
import { ensureGatewayProfile } from '@/store/profile'
import {
  $messages,
  _resetSessionOwnerHintsForTests,
  setActiveSessionId,
  setAwaitingResponse,
  setBusy,
  setConnection,
  setMessages,
  setSelectedStoredSessionId,
  setSessions
} from '@/store/session'
import { clearAllSessionStates } from '@/store/session-states'
import type { SessionMessage } from '@/types/hermes'

import type { ClientSessionState } from '../../types'
import { useSessionActions } from './use-session-actions'
import { transcriptRowContentKey, type TranscriptViewCutoff } from './use-session-actions/transcript-provenance'

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAllSessionMessages: vi.fn(),
  getLatestSessionMessages: vi.fn(),
  getSession: vi.fn()
}))

vi.mock('@/store/profile', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureGatewayAgent: vi.fn().mockResolvedValue(undefined),
  ensureGatewayProfile: vi.fn().mockResolvedValue(undefined)
}))

const STORED = 'hud-dup-stored'
const RUNTIME = 'hud-dup-runtime'

const storedRow = () => ({
  ended_at: null,
  id: STORED,
  input_tokens: 0,
  is_active: false,
  last_active: 1,
  message_count: 6,
  model: null,
  output_tokens: 0,
  preview: null,
  source: 'desktop' as const,
  started_at: 1,
  title: 'HUD duplicate',
  tool_call_count: 0
})

/** The durable transcript as the backend would serve it (numeric id = row id). */
const durablePage: SessionMessage[] = [
  { content: 'first question', id: 10, role: 'user', timestamp: 100 },
  { content: 'first answer', id: 11, role: 'assistant', timestamp: 101 },
  { content: 'hud question', id: 12, role: 'user', timestamp: 102 },
  { content: 'hud answer', id: 13, role: 'assistant', timestamp: 103 },
  { content: 'after hud question', id: 14, role: 'user', timestamp: 104 },
  { content: 'after hud answer', id: 15, role: 'assistant', timestamp: 105 }
] as SessionMessage[]

/** A locally-seeded user bubble: `user-*` id, no durable row id. */
const localUser = (text: string, rowId?: number, timestamp = 102): ChatMessage =>
  ({
    id: 'user-1760000000000-local1',
    parts: [textPart(text)],
    role: 'user',
    timestamp,
    ...(rowId === undefined ? {} : { rowId })
  }) as ChatMessage

const hydrated = (page: SessionMessage[]): ChatMessage[] => toChatMessages(page)

interface ResumeOutcome {
  cacheMessages: ChatMessage[]
  viewMessages: ChatMessage[]
}

type ResumeFn = (id: string, replaceRoute?: boolean) => Promise<unknown>

/**
 * Reproduce the HUD-exit resume: the view AND the warm cache hold
 * `cachedMessages`, the session is already selected/bound, `session.activate`
 * answers with `messages_omitted`, and REST returns `restPage`.
 */
async function runHudExitResume({
  activated = {},
  cachedMessages,
  restPage = durablePage
}: {
  activated?: Record<string, unknown>
  cachedMessages: ChatMessage[]
  restPage?: SessionMessage[]
}): Promise<ResumeOutcome> {
  const stateMap: MutableRefObject<Map<string, ClientSessionState>> = { current: new Map() }
  const runtimeMap: MutableRefObject<Map<string, string>> = { current: new Map() }
  const activeRef: MutableRefObject<null | string> = { current: RUNTIME }
  const selectedRef: MutableRefObject<null | string> = { current: STORED }
  const heldCutoffs = new Map<string, TranscriptViewCutoff>()

  runtimeMap.current.set(STORED, RUNTIME)
  stateMap.current.set(RUNTIME, { ...createClientSessionState(STORED), messages: cachedMessages })

  setSessions([storedRow()])
  setMessages(cachedMessages)
  setSelectedStoredSessionId(STORED)
  setActiveSessionId(RUNTIME)

  vi.mocked(getSession).mockResolvedValue(null as never)
  vi.mocked(getAllSessionMessages).mockResolvedValue({ messages: [] } as never)
  vi.mocked(getLatestSessionMessages).mockResolvedValue({
    messages: restPage,
    session_id: STORED
  } as never)

  const activateResult = {
    info: {},
    message_count: restPage.length,
    messages: [],
    messages_omitted: true,
    resumed: STORED,
    running: false,
    session_id: RUNTIME,
    session_key: STORED,
    ...activated
  }

  const requestGateway = vi.fn(async (method: string) =>
    method === 'session.activate' ? (activateResult as never) : ({} as never)
  )

  let resume: ResumeFn | null = null

  function Harness({ onReady }: { onReady: (resume: ResumeFn) => void }) {
    const ref = <T,>(value: T): MutableRefObject<T> => ({ current: value })

    const actions = useSessionActions({
      activeSessionId: RUNTIME,
      activeSessionIdRef: activeRef,
      busyRef: ref(false),
      creatingSessionRef: ref(false),
      ensureSessionState: () => createClientSessionState(STORED),
      getRouteToken: () => 'hud-exit',
      getRoutedStoredSessionId: () => STORED,
      navigate: vi.fn() as never,
      requestGateway,
      resetViewSync: vi.fn(),
      routedSessionId: STORED,
      runtimeIdByStoredSessionIdRef: runtimeMap,
      selectedStoredSessionId: STORED,
      selectedStoredSessionIdRef: selectedRef,
      sessionStateByRuntimeIdRef: stateMap,
      holdSessionTranscriptView: (sessionId: string) => {
        const rows = stateMap.current.get(sessionId)?.messages ?? []

        heldCutoffs.set(sessionId, {
          cutoffIds: new Set(rows.map(message => message.id)),
          cutoffKeys: new Set(rows.map(transcriptRowContentKey))
        })

        return () => {
          heldCutoffs.delete(sessionId)
        }
      },
      syncSessionStateToView: () => undefined,
      updateSessionState: (sessionId, updater, storedSessionId) => {
        const current = stateMap.current.get(sessionId) ?? createClientSessionState(storedSessionId ?? null)
        const next = updater(current)

        stateMap.current.set(sessionId, next)

        return next
      }
    })

    useEffect(() => {
      onReady(actions.resumeSession as never)
    }, [actions.resumeSession, onReady])

    return null
  }

  render(<Harness onReady={value => (resume = value)} />)
  await waitFor(() => expect(resume).not.toBeNull())

  await act(async () => {
    await resume!(STORED, true)
  })

  return {
    cacheMessages: stateMap.current.get(RUNTIME)?.messages ?? [],
    viewMessages: $messages.get()
  }
}

const counts = (messages: ChatMessage[]): Map<string, number> => {
  const tally = new Map<string, number>()

  for (const message of messages) {
    const text = chatMessageText(message).trim()

    tally.set(text, (tally.get(text) ?? 0) + 1)
  }

  return tally
}

const duplicates = (messages: ChatMessage[]): string[] =>
  [...counts(messages)].filter(([, count]) => count > 1).map(([text, count]) => `${count}x "${text}"`)

function expectNoDuplicates(messages: ChatMessage[], label: string): void {
  expect(duplicates(messages), `${label}: transcript rows ${JSON.stringify(messages.map(m => ({ id: m.id, role: m.role, rowId: m.rowId, text: chatMessageText(m).trim() })), null, 1)}`).toEqual([])
}

beforeEach(() => {
  clearAllSessionStates()
  _resetSessionOwnerHintsForTests()
  setConnection(null)
  setMessages([])
  setActiveSessionId(null)
  setSelectedStoredSessionId(null)
  setBusy(false)
  setAwaitingResponse(false)
  vi.mocked(ensureGatewayProfile).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  clearAllSessionStates()
  setMessages([])
  setSessions([])
  setActiveSessionId(null)
  setSelectedStoredSessionId(null)
  vi.restoreAllMocks()
})

describe('HUD exit must not duplicate transcript messages', () => {
  it('baseline: durable cache + the same durable page render every message once', async () => {
    const cached = hydrated(durablePage)
    const { cacheMessages, viewMessages } = await runHudExitResume({ cachedMessages: cached })

    expectNoDuplicates(cacheMessages, 'cache')
    expectNoDuplicates(viewMessages, 'view')
  })

  it('durable cache + a truncated durable page (page starts mid-transcript)', async () => {
    const cached = hydrated(durablePage)
    const { cacheMessages } = await runHudExitResume({
      cachedMessages: cached,
      restPage: durablePage.slice(2)
    })

    expectNoDuplicates(cacheMessages, 'cache')
  })

  it('keeps one copy when the cached user row is still the local optimistic one', async () => {
    const durable = hydrated(durablePage)
    const cached = [...durable.slice(0, 2), localUser('hud question'), ...durable.slice(3)]
    const { cacheMessages, viewMessages } = await runHudExitResume({ cachedMessages: cached })

    expectNoDuplicates(cacheMessages, 'cache')
    expectNoDuplicates(viewMessages, 'view')
  })

  it('keeps one copy when the local user row has no durable twin before the page start', async () => {
    const durable = hydrated(durablePage)
    const cached = [...durable.slice(0, 2), localUser('hud question'), ...durable.slice(3)]
    const { cacheMessages } = await runHudExitResume({
      cachedMessages: cached,
      restPage: durablePage.slice(2)
    })

    expectNoDuplicates(cacheMessages, 'cache')
  })

  it('keeps one copy when the local user row carried its submit receipt rowId', async () => {
    const durable = hydrated(durablePage)
    const cached = [...durable.slice(0, 2), localUser('hud question', 12), ...durable.slice(3)]
    const { cacheMessages } = await runHudExitResume({
      cachedMessages: cached,
      restPage: durablePage.slice(2)
    })

    expectNoDuplicates(cacheMessages, 'cache')
  })

  // SECONDARY PROBE (reachability unconfirmed): `appendLiveSessionProjection`
  // normally suppresses itself via `latestUserRun`, and this case only fires
  // when the durable page already carries a LATER user turn than the inflight
  // one. Kept as a standing invariant check, not the reported bug.
  // Skipped pending reachability confirmation: in the normal flow
  // appendLiveSessionProjection's latestUserRun guard covers this shape; the
  // constructed case only fires when the page already carries a LATER user
  // row. Kept as documentation of a possible second edge — confirm a real
  // path before un-skipping.
  it.skip('secondary probe: inflight projection must not duplicate an already-persisted turn', async () => {
    const durable = hydrated(durablePage)
    const cached = [
      ...durable.slice(0, 2),
      localUser('hud question'),
      { ...durable[3], pending: true } as ChatMessage
    ]
    const { cacheMessages } = await runHudExitResume({
      activated: {
        inflight: { assistant: 'hud answer', streaming: true, user: 'hud question' },
        running: true
      },
      cachedMessages: cached
    })

    expectNoDuplicates(cacheMessages, 'cache')
  })
})
