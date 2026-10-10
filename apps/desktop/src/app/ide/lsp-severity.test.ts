import { describe, expect, it } from 'vitest'

import { diagnosticKind, problemSeverity } from './lsp-severity'

describe('diagnosticKind', () => {
  it('reads the LSP severity scale, not a passthrough', () => {
    expect(diagnosticKind(1)).toBe('error')
    expect(diagnosticKind(2)).toBe('warning')
    expect(diagnosticKind(3)).toBe('info')
    expect(diagnosticKind(4)).toBe('hint')
  })

  it('treats a missing severity as an error, like LSP clients do', () => {
    expect(diagnosticKind(undefined)).toBe('error')
  })
})

describe('problemSeverity', () => {
  it('keeps errors, warnings and info in their own lanes', () => {
    expect(problemSeverity(1)).toBe(1)
    expect(problemSeverity(2)).toBe(2)
    expect(problemSeverity(3)).toBe(3)
    expect(problemSeverity(4)).toBe(3)
    expect(problemSeverity(undefined)).toBe(1)
  })
})
