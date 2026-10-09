import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { hermesIdeDataRoot, isInsideAnyInstall, isInsideDir, resolveRuntimeDir } from './paths'

const PROGRAM_FILES = 'C:\\Program Files\\Hermes-IDE'
const EXEC_DIR = 'C:\\Program Files\\Hermes-IDE\\Hermes-IDE.exe'

describe('hermes ide data root', () => {
  it('uses %LOCALAPPDATA%\\Hermes on Windows', () => {
    const root = hermesIdeDataRoot({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' },
      home: 'C:\\Users\\ada'
    })

    expect(root).toBe('C:\\Users\\ada\\AppData\\Local\\Hermes')
  })

  it('falls back to the user AppData\\Local when LOCALAPPDATA is unset', () => {
    const root = hermesIdeDataRoot({ platform: 'win32', env: {}, home: 'C:\\Users\\ada' })

    expect(root).toBe(path.win32.join('C:\\Users\\ada', 'AppData', 'Local', 'Hermes'))
  })

  it('uses Application Support on macOS and XDG data home on Linux', () => {
    expect(hermesIdeDataRoot({ platform: 'darwin', env: {}, home: '/Users/ada' })).toBe(
      '/Users/ada/Library/Application Support/Hermes'
    )
    expect(
      hermesIdeDataRoot({ platform: 'linux', env: { XDG_DATA_HOME: '/home/ada/share' }, home: '/home/ada' })
    ).toBe('/home/ada/share/Hermes')
    expect(hermesIdeDataRoot({ platform: 'linux', env: {}, home: '/home/ada' })).toBe('/home/ada/.local/share/Hermes')
  })
})

describe('runtime download directories', () => {
  it('places a language server under the user data root, never the install directory', () => {
    const result = resolveRuntimeDir({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' },
      home: 'C:\\Users\\ada',
      kind: 'lsp',
      name: 'pyright',
      version: '1.1.414',
      installRoots: [PROGRAM_FILES, path.win32.dirname(EXEC_DIR)]
    })

    expect(result.ok).toBe(true)

    if (result.ok === false) {
      return
    }

    expect(result.dir).toBe('C:\\Users\\ada\\AppData\\Local\\Hermes\\lsp\\pyright\\1.1.414')
    expect(isInsideAnyInstall(result.dir, [PROGRAM_FILES], 'win32')).toBe(false)
    expect(isInsideDir(result.dir, 'C:\\Users\\ada\\AppData\\Local\\Hermes', 'win32')).toBe(true)
  })

  it('refuses a data root that itself sits inside the install directory', () => {
    const result = resolveRuntimeDir({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Program Files\\Hermes-IDE\\Local' },
      home: 'C:\\Users\\ada',
      kind: 'dap',
      name: 'debugpy',
      version: '1.8.22',
      installRoots: [PROGRAM_FILES]
    })

    expect(result).toEqual({ ok: false, reason: 'inside-install' })
  })

  it('refuses names that would escape the data root', () => {
    expect(
      resolveRuntimeDir({
        platform: 'linux',
        env: {},
        home: '/home/ada',
        kind: 'extensions',
        name: '..',
        installRoots: []
      }).ok
    ).toBe(false)
    expect(
      resolveRuntimeDir({
        platform: 'linux',
        env: {},
        home: '/home/ada',
        kind: 'lsp',
        name: 'pyright',
        version: '..',
        installRoots: []
      }).ok
    ).toBe(false)
  })

  it('treats a case-variant of Program Files as the same install directory', () => {
    expect(isInsideDir('c:\\program files\\hermes-ide\\app\\lsp', 'C:\\Program Files\\Hermes-IDE', 'win32')).toBe(true)
  })
})
