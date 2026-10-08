import { persistentAtom } from '@/lib/persisted'

export type WorkspaceMode = 'agent' | 'ide'

const STORAGE_KEY = 'hermes.desktop.workspaceMode'

export const $workspaceMode = persistentAtom<WorkspaceMode>(STORAGE_KEY, 'ide', {
  decode: raw => (raw === 'agent' ? 'agent' : 'ide'),
  encode: value => value
})

export function setWorkspaceMode(mode: WorkspaceMode) {
  $workspaceMode.set(mode)
}
