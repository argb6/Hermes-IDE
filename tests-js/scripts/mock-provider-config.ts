/** Typecheck stand-in. The shared e2e config writers are not in this checkout. */

function missing(): never {
  throw new Error('tests-js mock provider config is not included in this checkout')
}

export function writeMockProviderConfig(
  _hermesHome: string,
  _url: string,
  _extraDisplay?: unknown,
  _extraConfig?: string,
  _modelContextLength?: unknown
): void {
  missing()
}

export function writeEnvFile(_hermesHome: string, _key?: string, _url?: string): void {
  missing()
}
