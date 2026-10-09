import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { rgPath } from '@vscode/ripgrep'
import { ipcMain, type WebContents } from 'electron'

import { unpackAsarPath } from './ripgrep-path'
import { buildRgArgs, parseRgMatch, replaceInText, type RgQuery } from './ripgrep-query'

interface SearchRequest extends RgQuery {
  cwd: string
  id: string
  path?: string
  replace?: string
}

const running = new Map<string, ReturnType<typeof spawn>>()

function binary(): string {
  return unpackAsarPath(rgPath)
}

function insideRoot(root: string, file: string): boolean {
  const base = path.resolve(root)
  const target = path.resolve(file)
  const rel = path.relative(base, target)

  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function send(sender: WebContents, payload: unknown) {
  if (!sender.isDestroyed()) {
    sender.send('hermes:search:event', payload)
  }
}

function startSearch(sender: WebContents, request: SearchRequest) {
  const cwd = path.resolve(request.cwd || '')

  if (!request.id || !request.query || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    send(sender, { id: request.id, message: 'Search folder is not available.', type: 'error' })

    return
  }

  const previous = running.get(request.id)

  if (previous) {
    previous.kill()
    running.delete(request.id)
  }

  let child: ReturnType<typeof spawn>

  try {
    child = spawn(binary(), buildRgArgs(request), { cwd, windowsHide: true })
  } catch (error) {
    send(sender, { id: request.id, message: error instanceof Error ? error.message : 'ripgrep failed to start', type: 'error' })

    return
  }

  running.set(request.id, child)
  let buffer = ''
  let matches = 0

  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')

    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const match = parseRgMatch(line)

      if (!match || !insideRoot(cwd, path.resolve(cwd, match.path))) {
        continue
      }

      matches += 1
      send(sender, { id: request.id, match: { ...match, path: path.resolve(cwd, match.path) }, type: 'match' })
    }
  })

  const finish = (message?: string) => {
    if (running.get(request.id) === child) {
      running.delete(request.id)
    }

    if (buffer) {
      const match = parseRgMatch(buffer)

      if (match && insideRoot(cwd, path.resolve(cwd, match.path))) {
        matches += 1
        send(sender, {
          id: request.id,
          match: { ...match, path: path.resolve(cwd, match.path) },
          type: 'match'
        })
      }
    }

    send(sender, message ? { id: request.id, message, type: 'error' } : { id: request.id, matches, type: 'done' })
  }

  let spawnError = ''

  child.on('error', error => {
    spawnError = error.message
  })
  child.on('close', code => {
    if (spawnError) {
      finish(spawnError)

      return
    }

    if (code && code !== 0 && code !== 1 && matches === 0) {
      finish(`ripgrep exited ${code}`)

      return
    }

    finish()
  })
}

async function replaceAll(request: SearchRequest) {
  const cwd = path.resolve(request.cwd || '')
  const replacement = request.replace ?? ''

  if (!request.query || !fs.existsSync(cwd)) {
    return { error: 'Search folder is not available.', files: 0, replacements: 0 }
  }

  const files = request.path ? [path.resolve(request.path)] : await collectFiles(cwd, request)
  let fileCount = 0
  let replacements = 0

  for (const file of files) {
    if (!insideRoot(cwd, file)) {
      continue
    }

    const raw = fs.readFileSync(file)

    if (raw.includes(0)) {
      continue
    }

    let next: { count: number; text: string }

    try {
      next = replaceInText(raw.toString('utf8'), request, replacement)
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Invalid pattern', files: 0, replacements: 0 }
    }

    if (next.count === 0) {
      continue
    }

    fs.writeFileSync(file, next.text)
    fileCount += 1
    replacements += next.count
  }

  return { files: fileCount, replacements }
}

function collectFiles(cwd: string, query: RgQuery): Promise<string[]> {
  return new Promise(resolve => {
    let child: ReturnType<typeof spawn>

    try {
      child = spawn(binary(), buildRgArgs(query), { cwd, windowsHide: true })
    } catch {
      resolve([])

      return
    }

    const files = new Set<string>()
    let buffer = ''

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')

      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const match = parseRgMatch(line)

        if (match) {
          files.add(path.resolve(cwd, match.path))
        }
      }
    })
    child.on('error', () => resolve([...files]))
    child.on('close', () => {
      const match = parseRgMatch(buffer)

      if (match) {
        files.add(path.resolve(cwd, match.path))
      }

      resolve([...files])
    })
  })
}

export function registerRipgrepIpc() {
  ipcMain.handle('hermes:search:start', async (event, request: SearchRequest) => {
    startSearch(event.sender, request)

    return { ok: true }
  })

  ipcMain.handle('hermes:search:cancel', async (_event, id: string) => {
    running.get(id)?.kill()
    running.delete(id)

    return { ok: true }
  })

  ipcMain.handle('hermes:search:replace', async (_event, request: SearchRequest) => replaceAll(request))
}
