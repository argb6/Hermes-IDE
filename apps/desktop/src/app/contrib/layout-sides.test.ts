import { describe, expect, it } from 'vitest'

import { TITLEBAR_CHROME_CHANGED_EVENT } from '@/app/shell/titlebar'
import { group, split } from '@/components/pane-shell/tree/model'
import { $layoutTree } from '@/components/pane-shell/tree/store'
import { $panesFlipped } from '@/store/layout'

import { bindLayoutSides } from './layout-sides'

// A tree re-layout (⌘\ flip, session drag onto the other side, a mirrored
// preset) MOVES top-edge strips without resizing them. The titlebar
// reservation (usePanelTitlebar) must be re-measured after the move — an
// unmeasured strip leaves `--panel-titlebar-left` unset and its left spacer
// falls back to 100% width, eating the whole header (dead chat strip,
// unclickable tabs). Contract: every tree re-layout re-fires
// TITLEBAR_CHROME_CHANGED_EVENT after the render that moved the strips.

const twoSidedTree = () =>
  split('row', [
    group(['sessions'], { active: 'sessions', id: 'side' }),
    group(['workspace'], { active: 'workspace', id: 'main' })
  ])

const nextFrames = () =>
  new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(null))
    })
  })

describe('tree re-layout notifies the titlebar measurement', () => {
  it('re-fires the chrome-changed event when the tree changes', async () => {
    window.localStorage.clear()
    let fired = 0
    const listener = () => {
      fired += 1
    }

    window.addEventListener(TITLEBAR_CHROME_CHANGED_EVENT, listener)
    bindLayoutSides()
    $layoutTree.set(twoSidedTree())
    await nextFrames()

    window.removeEventListener(TITLEBAR_CHROME_CHANGED_EVENT, listener)
    expect(fired).toBeGreaterThan(0)
  })

  it('re-fires after the flip mirrors the tree', async () => {
    window.localStorage.clear()
    $layoutTree.set(twoSidedTree())

    let fired = 0
    const listener = () => {
      fired += 1
    }

    window.addEventListener(TITLEBAR_CHROME_CHANGED_EVENT, listener)
    bindLayoutSides()
    $panesFlipped.set(true)
    await nextFrames()

    window.removeEventListener(TITLEBAR_CHROME_CHANGED_EVENT, listener)
    expect(fired).toBeGreaterThan(0)
  })
})
