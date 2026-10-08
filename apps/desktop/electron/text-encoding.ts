import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ALIASES: Record<string, string> = {
  big5: 'big5',
  gb2312: 'gb2312',
  gbk: 'gbk',
  'utf-16le': 'utf-16le',
  'utf-8': 'utf-8',
  utf16le: 'utf-16le',
  utf8: 'utf-8'
}

const CODE_PAGES: Record<string, number> = {
  big5: 950,
  gb2312: 936,
  gbk: 936
}

export function normalizeFileEncoding(value: unknown): string {
  const name = String(value || 'utf-8')
    .trim()
    .toLowerCase()

  return ALIASES[name] || 'utf-8'
}

export function decodeFileBytes(buffer: Buffer, encoding: string): string {
  const name = normalizeFileEncoding(encoding)

  if (name === 'utf-8') {
    return buffer.toString('utf8')
  }

  if (name === 'utf-16le') {
    return buffer.toString('utf16le')
  }

  return new TextDecoder(name === 'gb2312' ? 'gbk' : name).decode(buffer)
}

function powershellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

export async function encodeFileText(text: string, encoding: string): Promise<Buffer> {
  const name = normalizeFileEncoding(encoding)

  if (name === 'utf-8') {
    return Buffer.from(text, 'utf8')
  }

  if (name === 'utf-16le') {
    return Buffer.from(text, 'utf16le')
  }

  const page = CODE_PAGES[name]

  if (!page) {
    throw new Error(`Unsupported encoding: ${name}`)
  }

  if (process.platform !== 'win32') {
    throw new Error(`${name} can only be saved on Windows`)
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-enc-'))
  const src = path.join(dir, 'in.txt')
  const dst = path.join(dir, 'out.bin')

  try {
    await fs.writeFile(src, text, 'utf16le')
    const script = [
      `$src = ${powershellString(src)}`,
      `$dst = ${powershellString(dst)}`,
      '$text = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::Unicode)',
      `$bytes = [System.Text.Encoding]::GetEncoding(${page}).GetBytes($text)`,
      '[System.IO.File]::WriteAllBytes($dst, $bytes)'
    ].join('; ')

    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true
    })

    return await fs.readFile(dst)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
