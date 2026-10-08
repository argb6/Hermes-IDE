import { atom } from 'nanostores'

export interface IdeOutputLine {
  at: number
  text: string
}

const MAX_LINES = 500

export const $ideOutput = atom<IdeOutputLine[]>([])

/** Append a line to the IDE Output channel (Git / gh / clone logs). */
export function appendIdeOutput(text: string) {
  const trimmed = text.replace(/\s+$/, '')

  if (!trimmed) {
    return
  }

  const next = [...$ideOutput.get(), { at: Date.now(), text: trimmed }]

  $ideOutput.set(next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next)
}

export function clearIdeOutput() {
  $ideOutput.set([])
}
