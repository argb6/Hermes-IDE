// Minimal ustar reader plus zip entry listing. Language-server tarballs and
// Open VSX packages are extracted only under a caller-supplied directory.
// Entry names that climb out of that directory are skipped, and a zip that
// tries to is rejected by the caller when `safeZipEntries` reports it.

import fs from 'node:fs'
import path from 'node:path'

import { gunzipSync, unzipSync } from 'fflate'

import { isInsideDir } from './paths'

const BLOCK = 512
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024

export function gunzip(bytes: Uint8Array): Uint8Array {
  return gunzipSync(bytes)
}

export function unzipEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes)
}

/** True when every entry is a relative path with no `..` segment. */
export function zipEntryEscapes(name: string): boolean {
  const normalized = name.replace(/\\/g, '/')

  if (normalized.startsWith('/') || normalized.includes('\0')) {
    return true
  }

  return normalized.split('/').some(part => part === '..')
}

export interface TarExtractOptions {
  strip: number
  dest: string
  platform?: NodeJS.Platform
  maxBytes?: number
}

/** Extract a ustar archive (already decompressed) into `dest`. */
export function extractTar(bytes: Uint8Array, options: TarExtractOptions): void {
  const platform = options.platform ?? process.platform
  const maxBytes = options.maxBytes ?? MAX_ARCHIVE_BYTES
  let offset = 0
  let written = 0
  let longName: string | null = null
  let paxName: string | null = null

  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK)

    if (isZeroBlock(header)) {
      break
    }

    const size = parseOctal(header, 124, 12)
    const typeflag = header[156] ?? 0
    const name = entryName(header, longName, paxName)

    longName = null
    paxName = null
    offset += BLOCK

    const dataEnd = offset + size

    if (dataEnd > bytes.length) {
      throw new Error('truncated tar entry')
    }

    const data = bytes.subarray(offset, dataEnd)

    offset += Math.ceil(size / BLOCK) * BLOCK
    const special = takeSpecialName(typeflag, data)

    if (special.kind === 'long') {
      longName = special.name
      continue
    }

    if (special.kind === 'pax') {
      paxName = special.name
      continue
    }

    if (typeflag !== 0 && typeflag !== 48 && typeflag !== 53) {
      continue
    }

    written += writeEntry(name, typeflag, data, options.dest, options.strip, platform, written, maxBytes)
  }
}

function writeEntry(
  name: string,
  typeflag: number,
  data: Uint8Array,
  dest: string,
  strip: number,
  platform: NodeJS.Platform,
  written: number,
  maxBytes: number
): number {
  const relative = stripLeading(name, strip)

  if (!relative || zipEntryEscapes(relative)) {
    return 0
  }

  const target = path.join(dest, relative)

  if (!isInsideDir(target, dest, platform) && path.resolve(target) !== path.resolve(dest)) {
    return 0
  }

  if (written + data.byteLength > maxBytes) {
    throw new Error('archive exceeded the size limit')
  }

  if (typeflag === 53) {
    fs.mkdirSync(target, { recursive: true })

    return 0
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)

  return data.byteLength
}

function takeSpecialName(typeflag: number, data: Uint8Array): { kind: 'long' | 'pax'; name: string } | { kind: 'none' } {
  if (typeflag === 76) {
    return { kind: 'long', name: Buffer.from(data).toString('utf8').replace(/\0+$/, '') }
  }

  if (typeflag === 120 || typeflag === 103) {
    return { kind: 'pax', name: paxPath(data) ?? '' }
  }

  return { kind: 'none' }
}

function stripLeading(name: string, strip: number): string {
  const parts = name.replace(/\\/g, '/').split('/').filter(part => part !== '' && part !== '.')

  return parts.slice(strip).join('/')
}

function entryName(header: Uint8Array, longName: string | null, paxName: string | null): string {
  if (paxName) {
    return paxName
  }

  if (longName) {
    return longName
  }

  const name = cstr(header, 0, 100)
  const prefix = cstr(header, 345, 155)

  return prefix ? `${prefix}/${name}` : name
}

function paxPath(data: Uint8Array): string | null {
  const text = Buffer.from(data).toString('utf8')
  const match = /(?:^|\n)\d+ path=([^\n]+)/.exec(text)

  return match ? match[1].trim() : null
}

function cstr(header: Uint8Array, start: number, length: number): string {
  let end = start
  const stop = Math.min(header.length, start + length)

  while (end < stop && header[end] !== 0) {
    end += 1
  }

  return Buffer.from(header.subarray(start, end)).toString('utf8')
}

function parseOctal(header: Uint8Array, start: number, length: number): number {
  const text = cstr(header, start, length).trim()

  if (!text) {
    return 0
  }

  const value = Number.parseInt(text, 8)

  return Number.isFinite(value) ? value : 0
}

function isZeroBlock(header: Uint8Array): boolean {
  for (const byte of header) {
    if (byte !== 0) {
      return false
    }
  }

  return true
}
