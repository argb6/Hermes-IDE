// Shared Content-Length framing used by LSP (JSON-RPC) and DAP.

const MAX_BUFFER = 32 * 1024 * 1024

export function encodeContentLength(payload: unknown): string {
  const json = JSON.stringify(payload)

  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`
}

export class ContentLengthParser {
  private buffer: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk])

    if (this.buffer.length > MAX_BUFFER) {
      throw new Error('stdio buffer exceeded the size limit')
    }

    const messages: unknown[] = []

    for (;;) {
      const message = this.readOne()

      if (message === undefined) {
        return messages
      }

      messages.push(message)
    }
  }

  private readOne(): unknown | undefined {
    const headerEnd = this.buffer.indexOf('\r\n\r\n')

    if (headerEnd < 0) {
      return undefined
    }

    const header = this.buffer.subarray(0, headerEnd).toString('utf8')
    const match = /Content-Length:\s*(\d+)/i.exec(header)

    if (!match) {
      this.buffer = this.buffer.subarray(headerEnd + 4)

      return this.readOne()
    }

    const length = Number(match[1])
    const start = headerEnd + 4

    if (this.buffer.length < start + length) {
      return undefined
    }

    const body = this.buffer.subarray(start, start + length).toString('utf8')

    this.buffer = this.buffer.subarray(start + length)

    try {
      return JSON.parse(body) as unknown
    } catch {
      return this.readOne()
    }
  }
}
