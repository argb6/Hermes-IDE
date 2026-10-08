import { WiredPane } from '../contrib/wiring'

/** Minimal spectator shell for a subagent watch window (`?watch=1`).
 *
 * The full pane tree (session sidebar, files, terminal, statusbar) made the
 * window read as a second Hermes instance; a watch window only ever spectates
 * one child's conversation, so the window IS the transcript (plan 12.5). The
 * empty top strip is the drag region — the titlebar tool clusters are `fixed`
 * and hang off it. The composer stays hidden by `isWatchWindow()` upstream.
 */
export function WatchShell() {
  return (
    <div className="flex h-screen min-h-0 w-screen flex-col bg-background text-(--ui-text-primary)">
      <div className="h-8 shrink-0 border-b border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) [-webkit-app-region:drag]" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <WiredPane part="chatRoutes" />
      </div>
    </div>
  )
}
