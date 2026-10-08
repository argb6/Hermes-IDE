import { atom } from 'nanostores'

/** One editor group (primary / secondary split). UI still owns rendering. */
export interface IdeEditorGroup {
  activeId: null | string
  id: string
  tabIds: string[]
}

export interface IdeEditorGroupsState {
  activeGroupId: string
  groups: IdeEditorGroup[]
}

const INITIAL: IdeEditorGroupsState = {
  activeGroupId: 'primary',
  groups: [
    { activeId: null, id: 'primary', tabIds: [] },
    { activeId: null, id: 'secondary', tabIds: [] }
  ]
}

export const $ideEditorGroups = atom<IdeEditorGroupsState>(INITIAL)

export function syncIdeEditorGroup(groupId: string, tabIds: string[], activeId: null | string) {
  const state = $ideEditorGroups.get()

  const groups = state.groups.map(group =>
    group.id === groupId ? { ...group, activeId, tabIds } : group
  )

  if (!groups.some(group => group.id === groupId)) {
    groups.push({ activeId, id: groupId, tabIds })
  }

  $ideEditorGroups.set({ ...state, groups })
}

export function setActiveIdeEditorGroup(groupId: string) {
  const state = $ideEditorGroups.get()

  if (state.activeGroupId === groupId) {
    return
  }

  $ideEditorGroups.set({ ...state, activeGroupId: groupId })
}
