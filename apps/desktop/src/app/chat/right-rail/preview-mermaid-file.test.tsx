import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The Mermaid file-preview adaptation: a whole `.mermaid`/`.mmd` file renders
// as a diagram through the same lazy renderer the transcript's ```mermaid
// fences use, with the source view as the loading / parse-failure fallback —
// and the preview-target language map routes those extensions to `mermaid`.
const { initialize, renderMermaid } = vi.hoisted(() => ({
  initialize: vi.fn(),
  renderMermaid: vi.fn(async () => ({
    svg: '<svg><title>Request flow</title><desc>A sends data to B</desc><path /></svg>'
  }))
}))

vi.mock('mermaid', () => ({
  default: {
    initialize,
    render: renderMermaid
  }
}))

vi.mock('@/components/assistant-ui/embeds/use-is-dark', () => ({ useIsDark: () => false }))

import { MermaidFilePreview } from './preview-file'
import { localPreviewTarget } from '@/lib/local-preview'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MermaidFilePreview', () => {
  it('renders the whole file as a diagram through the shared renderer', async () => {
    render(<MermaidFilePreview text={'graph TD; A-->B'} />)

    const image = await screen.findByAltText(/Request flow/)
    expect(image.getAttribute('src')).toContain('data:image/svg+xml')
  })

  it('falls back to the source text when the diagram does not parse', async () => {
    renderMermaid.mockRejectedValueOnce(new Error('bad syntax'))

    render(<MermaidFilePreview text={'not a diagram'} />)

    await waitFor(() => expect(screen.getByText('not a diagram')).toBeTruthy())
  })
})

describe('mermaid preview targets', () => {
  it('routes .mermaid and .mmd to the mermaid language and .md to markdown', () => {
    expect(localPreviewTarget('diagram.mermaid', 'C:/work')?.language).toBe('mermaid')
    expect(localPreviewTarget('diagram.mmd', 'C:/work')?.language).toBe('mermaid')
    expect(localPreviewTarget('doc.md', 'C:/work')?.language).toBe('markdown')
    expect(localPreviewTarget('notes.txt', 'C:/work')?.language).toBe('text')
  })
})
