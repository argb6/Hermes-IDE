// Content-Length JSON-RPC over a byte stream. LSP and DAP share this framing.
// Server-initiated requests are answered inline so a language server that asks
// `workspace/configuration` during `initialize` cannot stall the session.

import { EventEmitter } from 'node:events'

import { ContentLengthParser, encodeContentLength } from './frame'

export interface StdioPeer {
  write(data: string): void
  onData(listener: (chunk: Buffer) => void): void
  onExit(listener: (code: number | null) => void): void
  kill(): void
}

interface Pending {
  resolve: (message: JsonRpcMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface JsonRpcMessage {
  jsonrpc?: string
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string }
}

export type ServerRequestHandler = (method: string, params: unknown) => unknown

export class StdioRpc {
  private readonly parser = new ContentLengthParser()
  private nextId = 1
  private pending = new Map<number, Pending>()
  private notifications = new EventEmitter()
  private closed = false

  constructor(
    private readonly peer: StdioPeer,
    private readonly onServerRequest: ServerRequestHandler
  ) {
    peer.onData(chunk => this.push(chunk))
    peer.onExit(() => this.failAll(new Error('stdio closed')))
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  request(method: string, params: unknown, timeoutMs = 30_000): Promise<JsonRpcMessage> {
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`timed out waiting for ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  onNotification(listener: (method: string, params: unknown) => void): void {
    this.notifications.on('notify', listener)
  }

  dispose(): void {
    this.closed = true
    this.failAll(new Error('stdio disposed'))
    this.peer.kill()
  }

  private send(message: JsonRpcMessage): void {
    if (this.closed) {
      return
    }

    this.peer.write(encodeContentLength(message))
  }

  private push(chunk: Buffer): void {
    let messages: unknown[]

    try {
      messages = this.parser.push(chunk)
    } catch (error) {
      this.failAll(error instanceof Error ? error : new Error('stdio buffer exceeded the size limit'))
      this.peer.kill()

      return
    }

    for (const message of messages) {
      this.accept(message as JsonRpcMessage)
    }
  }

  private accept(message: JsonRpcMessage): void {

    if (message.id !== undefined && message.method) {
      this.replyToServer(message)

      return
    }

    if (message.id !== undefined) {
      this.settle(message)

      return
    }

    if (message.method) {
      this.notifications.emit('notify', message.method, message.params)
    }
  }

  private replyToServer(message: JsonRpcMessage): void {
    let result: unknown = null

    try {
      result = this.onServerRequest(message.method || '', message.params)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'server request failed'

      this.send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: text } })

      return
    }

    this.send({ jsonrpc: '2.0', id: message.id, result: result ?? null })
  }

  private settle(message: JsonRpcMessage): void {
    const pending = this.pending.get(message.id as number)

    if (!pending) {
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(message.id as number)
    pending.resolve(message)
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }

    this.pending.clear()
    this.closed = true
  }
}

export function answerServerRequest(method: string, params: unknown): unknown {
  if (method === 'workspace/configuration') {
    const items = params && typeof params === 'object' && 'items' in params && Array.isArray(params.items) ? params.items : []

    return items.map(() => ({}))
  }

  if (method === 'workspace/workspaceFolders') {
    return null
  }

  return null
}
