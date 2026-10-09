import type { DapResponseMessage } from '../contract'
import { ContentLengthParser, encodeContentLength } from '../frame'
import type { StdioPeer } from '../stdio-rpc'

interface DapIncoming {
  seq?: number
  type?: string
  command?: string
  event?: string
  request_seq?: number
  success?: boolean
  message?: string
  body?: unknown
  arguments?: unknown
}

interface Pending {
  resolve: (message: DapResponseMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class DapConnection {
  private readonly parser = new ContentLengthParser()
  private seq = 1
  private pending = new Map<number, Pending>()
  private closed = false

  constructor(
    private readonly peer: StdioPeer,
    private readonly onEvent: (event: { type: 'event'; event: string; seq?: number; body?: unknown }) => void
  ) {
    peer.onData(chunk => this.push(chunk))
    peer.onExit(() => this.failAll(new Error('dap closed')))
  }

  request(command: string, args: unknown, timeoutMs = 30_000): Promise<DapResponseMessage> {
    const seq = this.seq
    this.seq += 1

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq)
        reject(new Error(`timed out waiting for ${command}`))
      }, timeoutMs)

      this.pending.set(seq, { resolve, reject, timer })
      this.send({ seq, type: 'request', command, arguments: args ?? {} })
    })
  }

  dispose(): void {
    this.closed = true
    this.failAll(new Error('dap disposed'))
    this.peer.kill()
  }

  private send(message: unknown): void {
    if (!this.closed) {
      this.peer.write(encodeContentLength(message))
    }
  }

  private push(chunk: Buffer): void {
    let messages: unknown[]

    try {
      messages = this.parser.push(chunk)
    } catch {
      this.failAll(new Error('dap buffer exceeded the size limit'))
      this.peer.kill()

      return
    }

    for (const message of messages) {
      this.accept(message as DapIncoming)
    }
  }

  private accept(message: DapIncoming): void {
    if (message.type === 'event' && message.event) {
      this.onEvent({ type: 'event', event: message.event, seq: message.seq, body: message.body })

      return
    }

    if (message.type === 'response' && message.request_seq !== undefined) {
      this.settle(message)

      return
    }

    if (message.type === 'request' && message.command) {
      this.send({
        seq: this.seq,
        type: 'response',
        request_seq: message.seq,
        success: false,
        command: message.command,
        message: 'not-supported'
      })
      this.seq += 1
    }
  }

  private settle(message: DapIncoming): void {
    const pending = this.pending.get(message.request_seq as number)

    if (!pending) {
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(message.request_seq as number)
    pending.resolve({
      type: 'response',
      request_seq: message.request_seq as number,
      success: message.success === true,
      command: message.command || '',
      ...(message.message ? { message: message.message } : {}),
      ...(message.body !== undefined ? { body: message.body } : {})
    })
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
