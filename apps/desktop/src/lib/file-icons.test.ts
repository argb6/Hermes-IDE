import { describe, expect, it } from 'vitest'

import { materialIconForFolder, materialIconForPath } from './file-icons'

describe('materialIconForPath', () => {
  it('maps whole names before extensions', () => {
    expect(materialIconForPath('repo/package.json')).toContain('<svg')
    expect(materialIconForPath('/repo/Dockerfile')).toContain('<svg')
    expect(materialIconForPath('repo/pyproject.toml')).toContain('<svg')
    expect(materialIconForPath('repo/.gitignore')).toContain('<svg')
    expect(materialIconForPath('repo/README.md')).toContain('<svg')
    expect(materialIconForPath('repo/LICENSE')).toContain('<svg')
  })

  it('maps common extensions to their language icon', () => {
    expect(materialIconForPath('src/main.py')).toContain('<svg')
    expect(materialIconForPath('src/app.tsx')).toContain('<svg')
    expect(materialIconForPath('src/app.ts')).toContain('<svg')
    expect(materialIconForPath('config.yaml')).toContain('<svg')
    expect(materialIconForPath('setup.ps1')).toContain('<svg')
    expect(materialIconForPath('shot.png')).toContain('<svg')
    expect(materialIconForPath('lib/foo.d.ts')).toContain('<svg')
  })

  it('falls back to the generic file icon for unknown types', () => {
    expect(materialIconForPath('LICENSE-unknown-ext.quirk')).toContain('<svg')
    expect(materialIconForPath('no-extension')).toContain('<svg')
  })
})

describe('materialIconForFolder', () => {
  it('uses themed folder glyphs when the name is known', () => {
    expect(materialIconForFolder('repo/src', false)).toContain('<svg')
    expect(materialIconForFolder('repo/src', true)).toContain('<svg')
    expect(materialIconForFolder('repo/node_modules', false)).toContain('<svg')
  })

  it('falls back to the generic folder icon', () => {
    expect(materialIconForFolder('repo/some-odd-folder', false)).toContain('<svg')
    expect(materialIconForFolder('repo/some-odd-folder', true)).toContain('<svg')
  })
})
