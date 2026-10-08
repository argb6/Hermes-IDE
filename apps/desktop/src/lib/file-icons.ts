/**
 * File-tree icons from the VS Code Material Icon Theme.
 *
 * Source: github.com/material-extensions/vscode-material-icon-theme via the
 * npm package `material-icon-theme` (MIT — see assets/file-icons/LICENSE).
 * SVGs and the name/extension map are bundled offline (`import.meta.glob` +
 * manifest.json); nothing is fetched at runtime. Re-sync with
 * `node scripts/sync-file-icons.mjs`.
 */

import manifest from '../assets/file-icons/manifest.json'

const ICONS = import.meta.glob('../assets/file-icons/*.svg', {
  eager: true,
  import: 'default',
  query: '?raw'
}) as Record<string, string>

interface IconManifest {
  file: string
  fileExtensions: Record<string, string>
  fileNames: Record<string, string>
  folder: string
  folderExpanded: string
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
}

const MAP = manifest as IconManifest

function svgFor(iconId: string | undefined): string | null {
  if (!iconId) {
    return null
  }

  return ICONS[`../assets/file-icons/${iconId}.svg`] ?? null
}

function baseName(path: string): string {
  return (path.split(/[/\\]/).pop() ?? '').toLowerCase()
}

/** Longest matching file extension (handles `.d.ts`, `.spec.ts`, …). */
function extensionIcon(name: string): string | null {
  const parts = name.split('.')

  if (parts.length < 2) {
    return null
  }

  for (let i = 1; i < parts.length; i += 1) {
    const ext = parts.slice(i).join('.')
    const icon = MAP.fileExtensions[ext]

    if (icon) {
      return svgFor(icon)
    }
  }

  return null
}

/** Raw SVG markup for a file path, or null when the theme has no icon and the
 *  caller should fall back to a codicon. */
export function materialIconForPath(path: string): string | null {
  const name = baseName(path)
  const byName = MAP.fileNames[name]

  if (byName) {
    return svgFor(byName)
  }

  return extensionIcon(name) ?? svgFor(MAP.file)
}

/** Raw SVG for a folder path. Pass `open` when the row is expanded. */
export function materialIconForFolder(path: string, open = false): string | null {
  const name = baseName(path)
  const map = open ? MAP.folderNamesExpanded : MAP.folderNames
  const byName = map[name]

  if (byName) {
    return svgFor(byName)
  }

  return svgFor(open ? MAP.folderExpanded : MAP.folder)
}
