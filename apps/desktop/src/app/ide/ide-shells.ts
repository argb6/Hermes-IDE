import { atom } from 'nanostores'

import { readKey, writeKey } from '@/lib/storage'

export const IDE_SHELLS = ['pwsh', 'powershell', 'cmd'] as const

export type IdeShell = (typeof IDE_SHELLS)[number]

const STORAGE_KEY = 'hermes.desktop.ide.shell'

function loadShell(): IdeShell {
  const raw = readKey(STORAGE_KEY)

  return raw === 'powershell' || raw === 'cmd' ? raw : 'pwsh'
}

export const $ideShell = atom<IdeShell>(loadShell())

export function setIdeShell(shell: IdeShell) {
  $ideShell.set(shell)
  writeKey(STORAGE_KEY, shell)
}
