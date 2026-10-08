#!/usr/bin/env node
/**
 * Pull VS Code Material Icon Theme SVGs + name/extension maps into
 * src/assets/file-icons (offline, no CDN at runtime).
 *
 * Source: https://www.npmjs.com/package/material-icon-theme (MIT)
 * Usage: node scripts/sync-file-icons.mjs [path-to-unpacked-package]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = join(root, 'src', 'assets', 'file-icons')
const packArg = process.argv[2]

async function downloadPack() {
  const tgz = join(tmpdir(), 'material-icon-theme-sync.tgz')
  const unpack = join(tmpdir(), 'material-icon-theme-sync')

  execFileSync('npm', ['pack', 'material-icon-theme', '--pack-destination', tmpdir()], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  const packed = readdirSync(tmpdir())
    .filter(name => name.startsWith('material-icon-theme-') && name.endsWith('.tgz'))
    .map(name => join(tmpdir(), name))
    .sort((a, b) => (existsSync(b) ? 1 : 0) - (existsSync(a) ? 1 : 0))
    .at(-1)

  const source = packed || tgz

  if (existsSync(unpack)) {
    rmSync(unpack, { force: true, recursive: true })
  }

  mkdirSync(unpack, { recursive: true })
  execFileSync('tar', ['-xzf', source, '-C', unpack], { stdio: 'inherit', shell: process.platform === 'win32' })

  return join(unpack, 'package')
}

const packRoot = packArg ? resolve(packArg) : await downloadPack()
const iconsSrc = join(packRoot, 'icons')
const manifestSrc = join(packRoot, 'dist', 'material-icons.json')
const licenseSrc = join(packRoot, 'LICENSE')

if (!existsSync(iconsSrc) || !existsSync(manifestSrc)) {
  console.error('material-icon-theme package not found at', packRoot)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'))
const slim = {
  file: manifest.file,
  folder: manifest.folder,
  folderExpanded: manifest.folderExpanded,
  fileExtensions: manifest.fileExtensions,
  fileNames: manifest.fileNames,
  folderNames: manifest.folderNames,
  folderNamesExpanded: manifest.folderNamesExpanded
}

mkdirSync(outDir, { recursive: true })

for (const name of readdirSync(outDir)) {
  if (name.endsWith('.svg') || name === 'manifest.json') {
    rmSync(join(outDir, name), { force: true })
  }
}

let copied = 0

for (const name of readdirSync(iconsSrc)) {
  if (!name.endsWith('.svg')) {
    continue
  }

  writeFileSync(join(outDir, name), readFileSync(join(iconsSrc, name)))
  copied += 1
}

writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(slim)}\n`)
writeFileSync(join(outDir, 'LICENSE'), readFileSync(licenseSrc, 'utf8'))

const pkg = JSON.parse(readFileSync(join(packRoot, 'package.json'), 'utf8'))

writeFileSync(
  join(outDir, 'SOURCE.txt'),
  [
    'VS Code Material Icon Theme',
    `npm: material-icon-theme@${pkg.version}`,
    'https://github.com/material-extensions/vscode-material-icon-theme',
    'License: MIT (see LICENSE)',
    'Synced offline into Hermes Desktop; runtime does not fetch icons from the network.',
    ''
  ].join('\n')
)

console.log(`Synced ${copied} SVGs + manifest from material-icon-theme@${pkg.version} → ${outDir}`)
