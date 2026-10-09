// User-data locations for on-demand language servers, debug adapters, and
// declarative extensions. These trees are downloaded after install, so they
// must live under the per-user data directory — on Windows,
// %LOCALAPPDATA%\Hermes — and never under the install directory. A packaged
// app may be in a read-only Program Files tree, and that tree is replaced on
// update and removed on uninstall. Uninstall should keep
// %LOCALAPPDATA%\Hermes\{lsp,dap,extensions} by default so the next install
// does not re-download them.

import path from 'node:path'

export type IdeDataKind = 'lsp' | 'dap' | 'extensions'

export interface DataRootInput {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
}

export interface RuntimeDirInput extends DataRootInput {
  kind: IdeDataKind
  name: string
  version?: string
  installRoots: string[]
}

export type RuntimeDirResult = { ok: true; dir: string; root: string } | { ok: false; reason: 'inside-install' | 'invalid-name' }

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,120}$/

function pathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix
}

/** %LOCALAPPDATA%\Hermes, or the platform folder that plays the same role. */
export function hermesIdeDataRoot({ platform, env, home }: DataRootInput): string {
  const paths = pathApi(platform)

  if (platform === 'win32') {
    const base = (env.LOCALAPPDATA || '').trim() || paths.join(home, 'AppData', 'Local')

    return paths.join(base, 'Hermes')
  }

  if (platform === 'darwin') {
    return paths.join(home, 'Library', 'Application Support', 'Hermes')
  }

  const xdg = (env.XDG_DATA_HOME || '').trim() || paths.join(home, '.local', 'share')

  return paths.join(xdg, 'Hermes')
}

export function isInsideDir(child: string, parent: string, platform: NodeJS.Platform): boolean {
  const paths = pathApi(platform)
  const left = normalizeAbs(child, platform)
  const right = normalizeAbs(parent, platform)

  if (!left || !right) {
    return false
  }

  if (left === right) {
    return true
  }

  const prefix = right.endsWith(paths.sep) ? right : right + paths.sep

  return left.startsWith(prefix)
}

export function isInsideAnyInstall(candidate: string, installRoots: string[], platform: NodeJS.Platform): boolean {
  return installRoots.some(root => root.trim() !== '' && isInsideDir(candidate, root, platform))
}

/**
 * Absolute directory for one downloaded runtime. Refuses names that escape the
 * data root and refuses a result that lands inside an install root (including
 * the case where the data root itself was pointed at the install tree).
 */
export function resolveRuntimeDir(input: RuntimeDirInput): RuntimeDirResult {
  const version = input.version ?? ''

  if (!NAME_RE.test(input.name) || (version !== '' && !NAME_RE.test(version))) {
    return { ok: false, reason: 'invalid-name' }
  }

  const root = hermesIdeDataRoot(input)
  const paths = pathApi(input.platform)
  const dir = version ? paths.join(root, input.kind, input.name, version) : paths.join(root, input.kind, input.name)

  if (isInsideAnyInstall(root, input.installRoots, input.platform) || isInsideAnyInstall(dir, input.installRoots, input.platform)) {
    return { ok: false, reason: 'inside-install' }
  }

  return { ok: true, dir, root }
}

function normalizeAbs(value: string, platform: NodeJS.Platform): string | null {
  const paths = pathApi(platform)
  const trimmed = value.trim()

  if (!trimmed || !paths.isAbsolute(trimmed)) {
    return null
  }

  const resolved = paths.normalize(paths.resolve(trimmed))

  return platform === 'win32' ? resolved.toLowerCase() : resolved
}
