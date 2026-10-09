/**
 * Stage @vscode/ripgrep (+ platform binary package) into dist/node_modules.
 *
 * In this npm workspace the packages are hoisted to the repo root, so
 * electron-builder's `node_modules/@vscode/ripgrep/**` (relative to
 * apps/desktop) finds nothing. Staging under dist/node_modules lets the
 * existing dist/node_modules files entry ships them next to electron-main.mjs,
 * where createRequire(import.meta.url) resolves them.
 */
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * @param {string} source repo root
 * @param {string} id package name
 * @returns {string} package root directory
 */
export function resolveWorkspacePackageRoot(source, id) {
  const manifestCandidates = [
    path.join(source, 'apps/desktop/package.json'),
    path.join(source, 'package.json')
  ]

  for (const manifest of manifestCandidates) {
    if (!existsSync(manifest)) {
      continue
    }

    try {
      return path.dirname(createRequire(manifest).resolve(`${id}/package.json`))
    } catch {
      // try next
    }
  }

  const direct = path.join(source, 'node_modules', ...id.split('/'), 'package.json')
  if (existsSync(direct)) {
    return path.dirname(direct)
  }

  throw new Error(`[stage-ripgrep] cannot resolve ${id} from ${source}`)
}

/**
 * @param {{ source: string, out: string, platform: string, arch: string }} opts
 *   out = product's node_modules directory (e.g. apps/desktop/dist/node_modules)
 */
export function stageRipgrep({ source, out, platform, arch }) {
  const metaId = '@vscode/ripgrep'
  const platformId = `@vscode/ripgrep-${platform}-${arch}`
  const metaRoot = resolveWorkspacePackageRoot(source, metaId)
  const platformRoot = resolveWorkspacePackageRoot(source, platformId)

  const scopeDir = path.join(out, '@vscode')
  const destMeta = path.join(scopeDir, 'ripgrep')
  const destPlatform = path.join(scopeDir, `ripgrep-${platform}-${arch}`)

  mkdirSync(scopeDir, { recursive: true })
  rmSync(destMeta, { recursive: true, force: true })
  rmSync(destPlatform, { recursive: true, force: true })
  cpSync(metaRoot, destMeta, { recursive: true, dereference: true })
  cpSync(platformRoot, destPlatform, { recursive: true, dereference: true })

  const binaryName = platform === 'win32' ? 'rg.exe' : 'rg'
  const binary = path.join(destPlatform, 'bin', binaryName)
  if (!existsSync(binary)) {
    throw new Error(`[stage-ripgrep] missing ${binary} after staging ${platformId}`)
  }

  console.log(`[stage-ripgrep] staged ${metaId} + ${platformId} -> ${scopeDir}`)
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
  stageRipgrep({
    source,
    out: path.join(source, 'apps/desktop/dist/node_modules'),
    platform: process.platform,
    arch: process.arch
  })
}
