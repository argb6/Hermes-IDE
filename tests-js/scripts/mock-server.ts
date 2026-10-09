/**
 * Typecheck stand-in. This checkout does not ship the shared Playwright mock
 * server. The signatures match the desktop e2e imports; calling them throws
 * rather than pretending a server is running.
 */

export const MOCK_REPLY = ''
export const BLOCKING_CLARIFY_QUESTION = ''
export const BLOCKING_CLARIFY_TRIGGER = ''
export const APPROVAL_COMMAND_TRIGGER = ''
export const CORRECTION_SWITCH_TRIGGER = ''
export const PROVIDER_FAILURE_TRIGGER = ''
export const TOOL_THEN_FAILURE_TEXT = ''
export const TOOL_THEN_FAILURE_TRIGGER = ''
export const VERIFICATION_STOP_TEXT = ''
export const VERIFICATION_STOP_TRIGGER = ''
export const BATCH_CLARIFY_TRIGGER = ''
export const SINGLE_BATCH_CLARIFY_TRIGGER = ''
export const BATCH_CLARIFY_QUESTIONS: { question: string }[] = []
export const SINGLE_BATCH_CLARIFY_QUESTIONS: { question: string }[] = []
export const SIDEBAR_TEXTS = { finalText: '' }
export const SIDEBAR_CROSS_TEXTS = { finalText: '' }
export const INTERIM_TEXTS = { finalText: '', interims: [] as string[] }

export interface MockServerOptions {
  backgroundReleasePath?: string
  holdFirstCompletionContaining?: string
  holdFirstStreamForPrompt?: string
  replyForPrompt?: (prompt: string) => string
  verificationWritePath?: string
}

export interface MockServer {
  close: () => Promise<void>
  heldCompletionCount: () => number
  receivedPrompts: string[]
  releaseHeldStream: () => void
  url: string
  waitForHeldCompletion: () => Promise<void>
  waitForHeldStream: () => Promise<void>
}

function missing(): never {
  throw new Error('tests-js mock server is not included in this checkout')
}

export function startMockServer(_options?: MockServerOptions): Promise<MockServer> {
  return missing()
}

export function restartMockServer(_options?: MockServerOptions): void {
  missing()
}

export function receivedUserTexts(): string[] {
  return missing()
}

export function createBackgroundReleaseHandle(): { cleanup: () => void; path: string; release: () => void } {
  return missing()
}
