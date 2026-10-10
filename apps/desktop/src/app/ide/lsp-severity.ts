// LSP DiagnosticSeverity (1 error … 4 hint) and Monaco's MarkerSeverity
// (1 hint … 8 error) are different scales. Bridging them numerically — what a
// plain passthrough does — paints every server error as a hint and every hint
// as a warning. The severity is named once here so the editor squiggles and
// the Problems list agree on what the server actually said.

export type DiagnosticKind = 'error' | 'hint' | 'info' | 'warning'

export function diagnosticKind(lspSeverity: number | undefined): DiagnosticKind {
  switch (lspSeverity) {
    case 2:
      return 'warning'

    case 3:
      return 'info'

    case 4:
      return 'hint'

    default:
      return 'error'
  }
}

/** Problems-panel lane: 1 error, 2 warning, 3 info/hint. */
export function problemSeverity(lspSeverity: number | undefined): number {
  const kind = diagnosticKind(lspSeverity)

  return kind === 'error' ? 1 : kind === 'warning' ? 2 : 3
}
