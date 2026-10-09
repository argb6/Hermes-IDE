/** Typecheck stand-in. The shared desktop chat smoke helper is not in this checkout. */

function missing(): never {
  throw new Error('tests-js desktop chat smoke is not included in this checkout')
}

export function waitForChatReady(_page: unknown, _timeoutMs?: number): Promise<void> {
  return missing()
}

export function runDesktopChatSmoke(
  _page: unknown,
  _options: { mockUrl: string; outDir: string; phase: string }
): Promise<void> {
  return missing()
}
