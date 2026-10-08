import { compactNumber } from '@hermes/shared'

import { useI18n } from '@/i18n'
import { useStoreSelector } from '@/lib/use-session-slice'
import { $sessions, sessionMatchesStoredId } from '@/store/session'
import { $sessionStates } from '@/store/session-states'

/** Tokens this conversation has spent. Live usage wins once a turn reports;
 *  the session row covers a chat resumed before the next turn. */
export function SessionTokenUse({ sessionId }: { sessionId: null | string }) {
  const { t } = useI18n()
  const live = useStoreSelector($sessionStates, states => {
    if (!sessionId) {
      return 0
    }

    const usage = states[sessionId]?.usage

    if (!usage) {
      return 0
    }

    return usage.total || (usage.input || 0) + (usage.output || 0)
  })
  const stored = useStoreSelector($sessions, sessions => {
    if (!sessionId) {
      return 0
    }

    const row = sessions.find(session => sessionMatchesStoredId(session, sessionId))

    return row ? (row.input_tokens || 0) + (row.output_tokens || 0) : 0
  })
  const tokens = Math.max(live, stored)
  const label = t.composer.sessionTokenUse(tokens > 0 ? compactNumber(tokens) : '0')

  return (
    <p className="w-full text-right text-[0.68rem] tabular-nums text-muted-foreground/80" title={label}>
      {label}
    </p>
  )
}
