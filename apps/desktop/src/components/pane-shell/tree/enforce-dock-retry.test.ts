import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registry } from '@/contrib/registry'

import { findGroupOfPane, group, split } from './model'
import { $layoutTree, adoptContributedPanes, resetEnforcedDocks } from './store'

vi.mock('@/store/notifications', () => ({ notify: vi.fn() }))

const disposers: (() => void)[] = []

function registerPane(id: string, data: Record<string, unknown>) {
  disposers.push(registry.register({ area: 'panes', data, id, render: () => null, title: id }))
}

beforeEach(() => {
  window.localStorage.clear()
  resetEnforcedDocks()
})

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
})

// The Bot Mode routines pane docks to the workspace's right edge
// (dock: { pane: 'workspace', pos: 'right', enforce: true }) but registers
// AFTER boot. When its first adoption pass finds no anchor yet, the pass must
// NOT be burned — the tab otherwise stays stranded in the sessions strip and
// appears/disappears with Bot Mode, reflowing the whole tab row.
describe('enforced dock retry', () => {
  it('re-homes the pane on a later pass when the anchor was missing earlier', () => {
    registerPane('sessions', { placement: 'left', hideOnly: true })
    registerPane('workspace', { placement: 'main', uncloseable: true })
    registerPane('routines', {
      placement: 'main',
      width: '250px',
      dock: { pane: 'workspace', pos: 'right', enforce: true }
    })

    // First pass: the anchor pane is not in the tree at all — the invariant
    // cannot apply yet. (Before the fix this burned the boot's one pass.)
    $layoutTree.set(group(['sessions', 'routines'], { active: 'sessions', id: 'g-side' }))
    adoptContributedPanes()
    expect(findGroupOfPane($layoutTree.get()!, 'routines')?.id).toBe('g-side')

    // Second pass: the workspace arrives with the pane still stranded beside
    // sessions — the enforcement must fire now.
    $layoutTree.set(
      split('row', [
        group(['sessions', 'routines'], { active: 'sessions', id: 'g-side' }),
        group(['workspace'], { active: 'workspace', id: 'g-main' })
      ])
    )
    adoptContributedPanes()

    const tree = $layoutTree.get()!
    const routinesGroup = findGroupOfPane(tree, 'routines')
    // Edge docks split a dedicated zone beside the anchor — the invariant is
    // that the tab is OUT of the sessions strip (where it used to strand).
    expect(routinesGroup?.id).not.toBe('g-side')
    expect(routinesGroup?.panes).toEqual(['routines'])
    expect(findGroupOfPane(tree, 'sessions')?.id).toBe('g-side')
  })
})
