import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'vitest'

import { resolveWorkspacePackageRoot, stageRipgrep } from './stage-ripgrep.mjs'

const source = path.resolve(import.meta.dirname, '../../..')

test('resolveWorkspacePackageRoot finds hoisted @vscode/ripgrep', () => {
  const root = resolveWorkspacePackageRoot(source, '@vscode/ripgrep')
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name, '@vscode/ripgrep')
})

test('stageRipgrep copies meta + platform package with rg binary', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'hermes-rg-'))
  try {
    stageRipgrep({ source, out, platform: process.platform, arch: process.arch })
    const meta = path.join(out, '@vscode', 'ripgrep', 'package.json')
    const platformDir = path.join(out, '@vscode', `ripgrep-${process.platform}-${process.arch}`)
    const binary = path.join(platformDir, 'bin', process.platform === 'win32' ? 'rg.exe' : 'rg')
    assert.equal(existsSync(meta), true)
    assert.equal(existsSync(binary), true)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('resolveWorkspacePackageRoot fails clearly for missing packages', () => {
  const fake = mkdtempSync(path.join(tmpdir(), 'hermes-rg-miss-'))
  try {
    mkdirSync(path.join(fake, 'apps/desktop'), { recursive: true })
    writeFileSync(path.join(fake, 'package.json'), '{"name":"root"}')
    writeFileSync(path.join(fake, 'apps/desktop/package.json'), '{"name":"desktop"}')
    assert.throws(() => resolveWorkspacePackageRoot(fake, '@vscode/nope'), /cannot resolve/)
  } finally {
    rmSync(fake, { recursive: true, force: true })
  }
})
