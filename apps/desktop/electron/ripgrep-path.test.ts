import assert from 'node:assert/strict'

import { test } from 'vitest'

import { unpackAsarPath } from './ripgrep-path'

test('rewrites a packaged asar path to the unpacked mirror', () => {
  assert.equal(
    unpackAsarPath('/Applications/Hermes.app/Contents/Resources/app.asar/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg'),
    '/Applications/Hermes.app/Contents/Resources/app.asar.unpacked/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg'
  )
})

test('rewrites a Windows asar path', () => {
  assert.equal(
    unpackAsarPath('C:\\Program Files\\Hermes\\resources\\app.asar\\node_modules\\@vscode\\ripgrep-win32-x64\\bin\\rg.exe'),
    'C:\\Program Files\\Hermes\\resources\\app.asar.unpacked\\node_modules\\@vscode\\ripgrep-win32-x64\\bin\\rg.exe'
  )
})

test('leaves an already unpacked path and a dev path alone', () => {
  const unpacked = '/opt/Hermes/resources/app.asar.unpacked/node_modules/@vscode/ripgrep-linux-x64/bin/rg'
  const dev = '/workspace/node_modules/@vscode/ripgrep-linux-x64/bin/rg'

  assert.equal(unpackAsarPath(unpacked), unpacked)
  assert.equal(unpackAsarPath(dev), dev)
})
