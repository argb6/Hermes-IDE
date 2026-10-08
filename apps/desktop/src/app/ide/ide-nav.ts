import { atom } from 'nanostores'

/** Editor back/forward and the centered folder name in the IDE titlebar. */
export const $ideNav = atom({ canBack: false, canForward: false, title: '' })
export const $ideSideTick = atom(0)
export const $ideReveal = atom<null | { id: string; seq: number }>(null)

export function requestIdeSideToggle() {
  $ideSideTick.set($ideSideTick.get() + 1)
}
export const $ideOutlineTick = atom(0)
export const $ideOpenPath = atom<null | { path: string; seq: number }>(null)
export const $ideQuickOpen = atom(0)
export const $ideOutlineJump = atom<null | { name: string; seq: number }>(null)

export function requestIdeOutlineJump(name: string) {
  const seq = ($ideOutlineJump.get()?.seq ?? 0) + 1

  $ideOutlineJump.set({ name, seq })
}

export function requestIdeQuickOpen() {
  $ideQuickOpen.set($ideQuickOpen.get() + 1)
}
export const $ideTimeline = atom<{ at: number; path: string }[]>([])

let openSeq = 0

export function requestIdeOutline() {
  $ideOutlineTick.set($ideOutlineTick.get() + 1)
}

export function requestIdeOpen(path: string) {
  openSeq += 1
  $ideOpenPath.set({ path, seq: openSeq })
}

const past: string[] = []
const future: string[] = []
let current: null | string = null
let fromHistory = false
let revealSeq = 0

function publish() {
  const nav = $ideNav.get()

  $ideNav.set({ ...nav, canBack: past.length > 0, canForward: future.length > 0 })
}

export function setIdeTitle(title: string) {
  const nav = $ideNav.get()

  if (nav.title === title) {
    return
  }

  $ideNav.set({ ...nav, title })
}

export function noteIdeFile(id: string) {
  if (!id || id === current) {
    return
  }

  if (current) {
    past.push(current)
  }

  current = id
  future.length = 0
  publish()
}

export function noteIdeTimeline(path: string) {
  if (!path) {
    return
  }

  const next = [{ at: Date.now(), path }, ...$ideTimeline.get().filter(row => row.path !== path)].slice(0, 30)

  $ideTimeline.set(next)
}

export function takeIdeHistoryMove() {
  const moved = fromHistory

  fromHistory = false

  return moved
}

function reveal(id: string) {
  fromHistory = true
  revealSeq += 1
  $ideReveal.set({ id, seq: revealSeq })
  publish()
}

export function ideBack() {
  const previous = past.pop()

  if (!previous || !current) {
    return
  }

  future.push(current)
  current = previous
  reveal(previous)
}

export function ideForward() {
  const next = future.pop()

  if (!next || !current) {
    return
  }

  past.push(current)
  current = next
  reveal(next)
}
