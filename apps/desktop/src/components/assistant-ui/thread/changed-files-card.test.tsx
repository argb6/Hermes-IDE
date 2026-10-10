import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChangedFilesCard } from './changed-files-card'

// The card's two scope hooks only answer WHERE a click lands; this test is
// about WHICH rows the conversation produces, so both are stubbed flat.
vi.mock('@/app/chat/composer/scope', () => ({ useComposerScope: () => ({ target: 'main' }) }))
vi.mock('@/app/chat/session-view', () => ({
  useSessionView: () => ({
    kind: 'primary',
    $cwd: { get: () => null, listen: () => () => undefined, subscribe: () => () => undefined }
  })
}))

const patchPart = (path: string, diff: string) => ({
  type: 'tool-call',
  toolName: 'patch',
  args: { path },
  result: { success: true, diff }
})

describe('ChangedFilesCard', () => {
  it('lists every file the conversation touched, not just the last turn', () => {
    render(
      <ChangedFilesCard
        messages={[
          { parts: [patchPart('src/a.ts', '+a\n'), patchPart('src/b.ts', '+b\n')] },
          { parts: [patchPart('TODO.md', '+todo\n')] }
        ]}
      />
    )

    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText('b.ts')).toBeTruthy()
    expect(screen.getByText('TODO.md')).toBeTruthy()
  })

  it('keeps one row per file when turns re-edit it', () => {
    render(
      <ChangedFilesCard
        messages={[
          { parts: [patchPart('src/a.ts', '+one\n+two\n')] },
          { parts: [patchPart('src/a.ts', '+three\n')] }
        ]}
      />
    )

    expect(screen.getAllByText('a.ts')).toHaveLength(1)
  })
})
