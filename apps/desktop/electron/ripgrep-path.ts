/**
 * `@vscode/ripgrep` resolves `rg` inside `app.asar` once the app is packaged.
 * Electron can read that path but cannot exec a binary from inside the archive.
 * electron-builder's asarUnpack mirror lives at the same relative path with
 * `app.asar` replaced by `app.asar.unpacked`.
 */
export function unpackAsarPath(filePath: string): string {
  return filePath.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked')
}
