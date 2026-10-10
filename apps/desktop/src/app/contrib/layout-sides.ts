import { computed } from 'nanostores'

import { TITLEBAR_CHROME_CHANGED_EVENT } from '@/app/shell/titlebar'
import { allPaneIds } from '@/components/pane-shell/tree/model'
import { $layoutTree, bindTreeSideVisibility, mirrorLayoutTree } from '@/components/pane-shell/tree/store'
import { modeLayout } from '@/store/interface-mode'
import { $fileBrowserOpen, $panesFlipped, $sidebarOpen, setFileBrowserOpen, setSidebarOpen } from '@/store/layout'

// A tree re-layout MOVES top-edge strips (flip, session drag onto the other
// side, a mirrored preset) without resizing them, so nothing re-measures their
// titlebar reservations: usePanelTitlebar keeps values from the old position —
// or none at all, and the unmeasured left spacer falls back to 100% width and
// eats the whole strip (dead chat header, unclickable tabs). Re-fire the
// chrome-changed event after the commit that moved them. Double rAF: past
// React's render of the new tree; coalesced to one dispatch per frame.
let chromeNotifyPending = false

function scheduleTitlebarChromeNotify(): void {
  if (chromeNotifyPending) {
    return
  }

  chromeNotifyPending = true
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chromeNotifyPending = false
      window.dispatchEvent(new CustomEvent(TITLEBAR_CHROME_CHANGED_EVENT))
    })
  })
}

/** Side toggles belong to panes, not physical edges. Derive the flip from the
 * tree so dragging sessions or choosing a mirrored preset remaps the buttons. */
export function bindLayoutSides() {
  const sessionsOnRight = () => {
    const tree = $layoutTree.get()

    if (!tree) {
      return null
    }

    const order = allPaneIds(tree)
    const sessions = order.indexOf('sessions')
    const main = order.indexOf('workspace')

    return sessions >= 0 && main >= 0 ? sessions > main : null
  }

  $layoutTree.subscribe(() => {
    const flipped = sessionsOnRight()

    if (flipped !== null && flipped !== $panesFlipped.get()) {
      $panesFlipped.set(flipped)
    }

    scheduleTitlebarChromeNotify()
  })

  $panesFlipped.listen(flipped => {
    const current = sessionsOnRight()

    // Restoration replaces the tree; a transient mismatch is not a flip gesture.
    if (!modeLayout.restoring && current !== null && current !== flipped) {
      mirrorLayoutTree()
    }
  })

  const $leftEdgeOpen = computed([$panesFlipped, $sidebarOpen, $fileBrowserOpen], (flipped, sidebar, files) =>
    flipped ? files : sidebar
  )

  const $rightEdgeOpen = computed([$panesFlipped, $sidebarOpen, $fileBrowserOpen], (flipped, sidebar, files) =>
    flipped ? sidebar : files
  )

  bindTreeSideVisibility('left', $leftEdgeOpen, open =>
    ($panesFlipped.get() ? setFileBrowserOpen : setSidebarOpen)(open)
  )
  bindTreeSideVisibility('right', $rightEdgeOpen, open =>
    ($panesFlipped.get() ? setSidebarOpen : setFileBrowserOpen)(open)
  )
}
