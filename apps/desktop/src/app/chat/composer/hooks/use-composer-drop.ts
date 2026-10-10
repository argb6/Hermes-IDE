import { type DragEvent as ReactDragEvent, useRef, useState } from 'react'

import { triggerHaptic } from '@/lib/haptics'

import {
  type DroppedFile,
  extractDroppedFiles,
  HERMES_PATHS_MIME
} from '../../hooks/use-composer-actions'
import { dragHasAttachments, droppedFileInlineRefs, type InlineRefInput } from '../inline-refs'
import type { ChatBarProps } from '../types'

interface UseComposerDropArgs {
  cwd: ChatBarProps['cwd']
  insertInlineRefs: (refs: InlineRefInput[]) => boolean
  onAttachDroppedItems: ChatBarProps['onAttachDroppedItems']
  recordUndoPoint: () => void
  requestMainFocus: () => void
}

/** Line ranges and links are mentions and stay inline `@line:`/`@url:` chips;
 *  files and folders become attachment capsules — the composer shows a file
 *  card instead of a chunk of path text. The capsule's `refText` submits the
 *  same `@file:` ref the gateway already resolves, so this is display-only. */
function splitDrops(candidates: DroppedFile[]): { files: DroppedFile[]; mentions: DroppedFile[] } {
  return {
    files: candidates.filter(candidate => !candidate.line && !candidate.url),
    mentions: candidates.filter(candidate => Boolean(candidate.line) || Boolean(candidate.url))
  }
}

/**
 * Drag-and-drop attachment engine. Line-range and link drops stay inline
 * `@line:`/`@url:` mentions; files and folders — in-app project-tree drags and
 * OS/Finder drops alike — land as attachment capsules through the attach
 * handler. Off the keystroke path; consumes `insertInlineRefs` + the attach
 * handler.
 */
export function useComposerDrop({
  cwd,
  insertInlineRefs,
  onAttachDroppedItems,
  recordUndoPoint,
  requestMainFocus
}: UseComposerDropArgs) {
  const [dragActive, setDragActive] = useState(false)
  const dragDepthRef = useRef(0)

  const resetDragState = () => {
    dragDepthRef.current = 0
    setDragActive(false)
  }

  const handleDragEnter = (event: ReactDragEvent<HTMLFormElement>) => {
    if (!onAttachDroppedItems || !dragHasAttachments(event.dataTransfer, HERMES_PATHS_MIME)) {
      return
    }

    event.preventDefault()
    dragDepthRef.current += 1

    if (!dragActive) {
      setDragActive(true)
    }
  }

  const handleDragOver = (event: ReactDragEvent<HTMLFormElement>) => {
    if (!onAttachDroppedItems || !dragHasAttachments(event.dataTransfer, HERMES_PATHS_MIME)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: ReactDragEvent<HTMLFormElement>) => {
    if (!onAttachDroppedItems) {
      return
    }

    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setDragActive(false)
    }
  }

  const handleDrop = (event: ReactDragEvent<HTMLFormElement>) => {
    if (!onAttachDroppedItems) {
      return
    }

    event.preventDefault()
    resetDragState()

    const candidates = extractDroppedFiles(event.dataTransfer)

    if (candidates.length === 0) {
      return
    }

    const { files, mentions } = splitDrops(candidates)
    const refs = droppedFileInlineRefs(mentions, cwd)

    if (refs.length && insertInlineRefs(refs)) {
      triggerHaptic('selection')
    }

    if (files.length) {
      void Promise.resolve(onAttachDroppedItems(files)).then(attached => {
        if (attached) {
          triggerHaptic('selection')
          requestMainFocus()
        }
      })
    }
  }

  const handleInputDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragHasAttachments(event.dataTransfer, HERMES_PATHS_MIME)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleInputDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragHasAttachments(event.dataTransfer, HERMES_PATHS_MIME)) {
      // A plain text drag within the editor mutates the DOM without a
      // React-visible beforeinput (insertFromDrop), so the undo snapshot has
      // to be banked here — before Chromium applies the move.
      recordUndoPoint()

      return
    }

    const candidates = extractDroppedFiles(event.dataTransfer)

    if (!candidates.length) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    resetDragState()

    // Dropping straight onto the text box lands files as attachment capsules
    // like every other drop; only line-range and link mentions stay inline.
    // (When no attach handler is wired, fall back to inline refs for all.)
    const attach = onAttachDroppedItems
    const { files, mentions } = splitDrops(candidates)
    const refs = droppedFileInlineRefs(attach ? mentions : candidates, cwd)

    if (refs.length && insertInlineRefs(refs)) {
      triggerHaptic('selection')
    }

    if (attach && files.length) {
      void Promise.resolve(attach(files)).then(attached => {
        if (attached) {
          triggerHaptic('selection')
          requestMainFocus()
        }
      })
    }
  }

  return {
    dragActive,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleInputDragOver,
    handleInputDrop
  }
}
