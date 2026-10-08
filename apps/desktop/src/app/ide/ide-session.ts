import { atom } from 'nanostores'

import { $ideTimeline } from './ide-nav'

const LAYOUT_KEY = 'hermes.desktop.ide.layout'
const TABS_KEY = 'hermes.desktop.ide.tabs'
const RECENT_FOLDERS_KEY = 'hermes.desktop.ide.recentFolders'

export interface IdeLayoutState {
  bottomTab: string
  chatOpen: boolean
  panel: string
  rightTab: 'changes' | 'chat'
  sideOpen: boolean
  terminalOpen: boolean
}

export interface IdeSavedTab {
  path: string
}

const DEFAULT_LAYOUT: IdeLayoutState = {
  bottomTab: 'terminal',
  chatOpen: true,
  panel: 'files',
  rightTab: 'chat',
  sideOpen: true,
  terminalOpen: false
}

export function readIdeLayout(): IdeLayoutState {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') as Partial<IdeLayoutState>

    return {
      bottomTab: typeof raw.bottomTab === 'string' ? raw.bottomTab : DEFAULT_LAYOUT.bottomTab,
      chatOpen: typeof raw.chatOpen === 'boolean' ? raw.chatOpen : DEFAULT_LAYOUT.chatOpen,
      panel: typeof raw.panel === 'string' ? raw.panel : DEFAULT_LAYOUT.panel,
      rightTab: raw.rightTab === 'changes' ? 'changes' : 'chat',
      sideOpen: typeof raw.sideOpen === 'boolean' ? raw.sideOpen : DEFAULT_LAYOUT.sideOpen,
      terminalOpen: typeof raw.terminalOpen === 'boolean' ? raw.terminalOpen : DEFAULT_LAYOUT.terminalOpen
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function writeIdeLayout(next: IdeLayoutState) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(next))
}

export function readIdeTabs(): IdeSavedTab[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY) || '[]') as IdeSavedTab[]

    return Array.isArray(raw) ? raw.filter(row => typeof row?.path === 'string' && row.path).slice(0, 24) : []
  } catch {
    return []
  }
}

export function writeIdeTabs(paths: string[]) {
  const tabs = paths.filter(Boolean).slice(0, 24).map(path => ({ path }))

  localStorage.setItem(TABS_KEY, JSON.stringify(tabs))
}

export function noteIdeRecentFolder(path: string) {
  if (!path.trim()) {
    return
  }

  const next = [{ at: Date.now(), path }, ...readIdeRecentFolders().filter(row => row.path !== path)].slice(0, 8)

  localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(next))
  $ideRecentFolders.set(next)
}

export function readIdeRecentFolders(): { at: number; path: string }[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_FOLDERS_KEY) || '[]') as { at: number; path: string }[]

    return Array.isArray(raw) ? raw.filter(row => typeof row?.path === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

export const $ideRecentFolders = atom(readIdeRecentFolders())

/** Keep the File → Open Recent list and the empty-state folder list in sync. */
export function seedRecentFoldersFromTimeline() {
  const fromTimeline = $ideTimeline.get().map(row => row.path.replace(/[/\\][^/\\]*$/, '')).filter(Boolean)
  const merged = [...readIdeRecentFolders().map(row => row.path), ...fromTimeline]
  const unique: { at: number; path: string }[] = []

  for (const path of merged) {
    if (!unique.some(row => row.path === path)) {
      unique.push({ at: Date.now(), path })
    }

    if (unique.length >= 8) {
      break
    }
  }

  localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(unique))
  $ideRecentFolders.set(unique)
}
