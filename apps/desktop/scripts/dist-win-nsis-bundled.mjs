#!/usr/bin/env node
/**
 * Windows self-contained NSIS: stage agent-payload at a short path (avoids
 * cargo/maturin MAX_PATH failures under Desktop\...\build\agent-payload),
 * junction it to build/agent-payload, then package with bundled + NSIS.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const desktop = join(scriptsDir, '..')
const root = join(desktop, '..', '..')
const link = join(desktop, 'build', 'agent-payload')
const shortOut = process.env.HERMES_PAYLOAD_OUT || 'D:\\hp'
const shortUv = process.env.UV_CACHE_DIR || 'D:\\uvc'
const shortCargo = process.env.CARGO_HOME || 'D:\\ch'
const shortRustup = process.env.RUSTUP_HOME || 'D:\\rh'
// Optional: copy a complete PM tools store so stage skips flaky network downloads.
const toolsSeed = process.env.HERMES_TOOLS_SEED || ''

function run(command, args, env = process.env) {
  console.log(`+ ${command} ${args.join(' ')}`)
  // Do not use shell:true for the Python stage — it masks real exit codes on Windows.
  const useShell = command === 'npm' || command.endsWith('npm.cmd') || command.endsWith('npm.exe')
  execFileSync(command, args, { stdio: 'inherit', cwd: desktop, env, shell: useShell })
}

if (process.platform !== 'win32') {
  console.error('dist-win-nsis-bundled.mjs is Windows-only')
  process.exit(1)
}
if (!process.env.HERMES_PYTHON) {
  console.error('Set HERMES_PYTHON to the prepared build interpreter')
  process.exit(1)
}

for (const dir of [shortOut, shortUv, shortCargo, shortRustup, join(desktop, 'build')]) {
  mkdirSync(dir, { recursive: true })
}
if (existsSync(link)) {
  const unlinked = spawnSync('cmd.exe', ['/d', '/c', `rmdir "${link}"`], { encoding: 'utf8' })
  if (unlinked.status !== 0 && existsSync(link)) {
    rmSync(link, { recursive: true, force: true })
  }
}
if (existsSync(shortOut)) {
  rmSync(shortOut, { recursive: true, force: true })
  mkdirSync(shortOut, { recursive: true })
}
if (toolsSeed && existsSync(join(toolsSeed, 'facts.json'))) {
  const seeded = join(shortOut, 'tools')
  console.log(`+ seed tools ${toolsSeed} -> ${seeded}`)
  cpSync(toolsSeed, seeded, { recursive: true })
}

const env = {
  ...process.env,
  UV_CACHE_DIR: shortUv,
  CARGO_HOME: shortCargo,
  RUSTUP_HOME: shortRustup,
  HERMES_DESKTOP_VARIANT: 'bundled',
  HERMES_DESKTOP_WIN_TARGET: 'nsis'
}

run(process.env.HERMES_PYTHON, [
  join(root, 'scripts', 'bundles', 'stage.py'),
  '--out',
  shortOut
], env)

const junction = spawnSync('cmd.exe', ['/d', '/c', `mklink /J "${link}" "${shortOut}"`], {
  encoding: 'utf8'
})
if (junction.status !== 0) {
  console.error(junction.stdout || '')
  console.error(junction.stderr || '')
  console.error(`failed to junction ${link} -> ${shortOut}`)
  process.exit(junction.status || 1)
}

run('npm', ['run', 'dist', '--', '--win', 'nsis', '--x64', '--publish', 'never'], env)
