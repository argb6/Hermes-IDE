// Install npm packages by downloading registry tarballs. No install scripts run:
// pyright and typescript-language-server are plain JavaScript, and a postinstall
// would be an arbitrary download executing on first editor use.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { extractTar, gunzip } from './archive'
import { errorReason, fetchBytes, fetchJson } from './net'

export interface NpmSpec {
  name: string
  version: string
}

interface Packument {
  'dist-tags'?: { latest?: string }
  versions?: Record<string, PackageMeta>
}

interface PackageMeta {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  os?: string[]
  cpu?: string[]
  dist?: { tarball?: string; shasum?: string }
}

export interface NpmInstallDeps {
  fetchImpl?: typeof fetch
  platform?: NodeJS.Platform
  arch?: string
}

const MAX_PACKAGES = 60
const TARBALL_BYTES = 80 * 1024 * 1024

export async function installNpmPackages(
  specs: NpmSpec[],
  destDir: string,
  deps: NpmInstallDeps = {}
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const platform = deps.platform ?? process.platform
  const arch = deps.arch ?? process.arch
  const nodeModules = path.join(destDir, 'node_modules')
  const queue: NpmSpec[] = [...specs]
  const seen = new Set<string>()
  let installed = 0

  try {
    fs.mkdirSync(nodeModules, { recursive: true })

    while (queue.length > 0) {
      const spec = queue.shift()

      if (!spec) {
        break
      }

      const key = `${spec.name}@${spec.version}`

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      installed += 1

      if (installed > MAX_PACKAGES) {
        return { ok: false, reason: 'dependency-limit' }
      }

      const meta = await loadExact(spec, fetchImpl)

      if (!platformAccepts(meta, platform, arch)) {
        continue
      }

      await extractPackage(spec.name, meta, nodeModules, fetchImpl)
      await enqueueDeps(meta, queue, fetchImpl, platform, arch)
    }

    fs.writeFileSync(
      path.join(destDir, '.hermes-installed.json'),
      JSON.stringify({ packages: Object.fromEntries(specs.map(spec => [spec.name, spec.version])) }, null, 2)
    )

    return { ok: true }
  } catch (error) {
    return { ok: false, reason: errorReason(error) }
  }
}

export function installedMarkerMatches(destDir: string, specs: NpmSpec[]): boolean {
  try {
    const raw = fs.readFileSync(path.join(destDir, '.hermes-installed.json'), 'utf8')
    const parsed = JSON.parse(raw) as { packages?: Record<string, string> }
    const packages = parsed.packages ?? {}

    return specs.every(spec => packages[spec.name] === spec.version)
  } catch {
    return false
  }
}

async function enqueueDeps(
  meta: PackageMeta,
  queue: NpmSpec[],
  fetchImpl: typeof fetch,
  platform: NodeJS.Platform,
  arch: string
): Promise<void> {
  const deps = { ...meta.dependencies }

  for (const [name, range] of Object.entries(deps)) {
    const resolved = await resolveRange(name, range, fetchImpl, platform, arch)

    if (resolved) {
      queue.push(resolved)
    }
  }
}

async function loadExact(spec: NpmSpec, fetchImpl: typeof fetch): Promise<PackageMeta> {
  const url = `https://registry.npmjs.org/${registryName(spec.name)}/${encodeURIComponent(spec.version)}`

  return fetchJson<PackageMeta>(url, 20_000, fetchImpl)
}

async function resolveRange(
  name: string,
  range: string,
  fetchImpl: typeof fetch,
  platform: NodeJS.Platform,
  arch: string
): Promise<NpmSpec | null> {
  const exact = /^(\d+\.\d+\.\d+)$/.exec(range.trim())

  if (exact) {
    return { name, version: exact[1] }
  }

  const packument = await fetchJson<Packument>(`https://registry.npmjs.org/${registryName(name)}`, 20_000, fetchImpl)
  const versions = Object.keys(packument.versions ?? {})
  const version = bestVersion(versions, range)

  if (!version) {
    throw new Error(`could not resolve ${name}@${range}`)
  }

  const meta = packument.versions?.[version]

  if (meta && !platformAccepts(meta, platform, arch)) {
    return null
  }

  return { name, version }
}

async function extractPackage(name: string, meta: PackageMeta, nodeModules: string, fetchImpl: typeof fetch): Promise<void> {
  const tarball = meta.dist?.tarball

  if (!tarball) {
    throw new Error(`npm package ${name} has no tarball`)
  }

  const bytes = await fetchBytes(tarball, TARBALL_BYTES, 60_000, fetchImpl)

  if (meta.dist?.shasum) {
    const digest = createHash('sha1').update(bytes).digest('hex')

    if (digest !== meta.dist.shasum) {
      throw new Error(`checksum mismatch for ${name}`)
    }
  }

  const dest = packageDir(nodeModules, name)

  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  extractTar(gunzip(bytes), { dest, strip: 1 })
}

function packageDir(nodeModules: string, name: string): string {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.split('/')

    return path.join(nodeModules, scope, pkg)
  }

  return path.join(nodeModules, name)
}

function registryName(name: string): string {
  return name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)
}

function platformAccepts(meta: PackageMeta, platform: NodeJS.Platform, arch: string): boolean {
  if (meta.os && meta.os.length > 0 && !meta.os.includes(platform)) {
    return false
  }

  if (meta.cpu && meta.cpu.length > 0 && !meta.cpu.includes(arch)) {
    return false
  }

  return true
}

function bestVersion(versions: string[], range: string): string | null {
  const stable = versions.filter(version => /^\d+\.\d+\.\d+$/.test(version) && satisfies(version, range))

  stable.sort((left, right) => compare(parseVer(right), parseVer(left)))

  return stable[0] ?? null
}

function satisfies(version: string, range: string): boolean {
  return range
    .split('||')
    .map(part => part.trim())
    .filter(Boolean)
    .some(part => part.split(/\s+/).every(comparator => matchComparator(version, comparator)))
}

function matchComparator(version: string, comparator: string): boolean {
  if (comparator === '*' || comparator === 'x') {
    return true
  }

  const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(comparator)
  const tilde = /^~(\d+)\.(\d+)\.(\d+)$/.exec(comparator)
  const got = parseVer(version)

  if (!got) {
    return false
  }

  if (caret) {
    return caretMatches(got, [Number(caret[1]), Number(caret[2]), Number(caret[3])])
  }

  if (tilde) {
    const want: Triple = [Number(tilde[1]), Number(tilde[2]), Number(tilde[3])]

    return got[0] === want[0] && got[1] === want[1] && compare(got, want) >= 0
  }

  const cmp = /^(>=|<=|>|<|=)?(\d+)\.(\d+)\.(\d+)$/.exec(comparator)

  if (!cmp) {
    return false
  }

  const op = cmp[1] || '='
  const want: Triple = [Number(cmp[2]), Number(cmp[3]), Number(cmp[4])]
  const order = compare(got, want)

  if (op === '=') return order === 0
  if (op === '>=') return order >= 0
  if (op === '<=') return order <= 0
  if (op === '>') return order > 0

  return order < 0
}

type Triple = [number, number, number]

function caretMatches(got: Triple, want: Triple): boolean {
  if (compare(got, want) < 0) {
    return false
  }

  if (want[0] > 0) {
    return got[0] === want[0]
  }

  if (want[1] > 0) {
    return got[0] === 0 && got[1] === want[1]
  }

  return got[0] === 0 && got[1] === 0 && got[2] === want[2]
}

function parseVer(version: string): Triple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)

  if (!match) {
    return null
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compare(left: Triple | null, right: Triple | null): number {
  if (!left || !right) {
    return 0
  }

  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index]
    }
  }

  return 0
}
