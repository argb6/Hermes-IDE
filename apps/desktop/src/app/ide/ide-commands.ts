import { atom } from 'nanostores'

/** Commands the IDE menu sends into the IDE window. Agent chrome does not listen. */
export type IdeCommand =
  | 'edit.palette'
  | 'file.closeTab'
  | 'file.openFolder'
  | 'go.git'
  | 'go.search'
  | 'run.terminal'
  | 'selection.all'
  | 'terminal.new'
  | 'terminal.toggle'
  | 'view.chat'
  | 'view.files'
  | 'view.git'
  | 'view.github'
  | 'view.search'
  | 'view.debug'
  | 'view.output'
  | 'view.problems'
  | 'view.terminal'
  | 'view.terminalShow'

export const $ideCommand = atom<null | { name: IdeCommand; seq: number }>(null)

let seq = 0

export function runIdeCommand(name: IdeCommand) {
  seq += 1
  $ideCommand.set({ name, seq })
}
