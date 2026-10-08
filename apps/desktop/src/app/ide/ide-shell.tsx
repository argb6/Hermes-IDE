import { TITLEBAR_HEIGHT } from '@/app/shell/titlebar'

import { IdeWorkspace } from './ide-workspace'

/** IDE window. Agent chrome (sessions, file rail, chat, status bar) is not mounted. */
export function IdeShell() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ paddingTop: TITLEBAR_HEIGHT }}>
      <IdeWorkspace />
    </div>
  )
}
