import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TemplatePreview } from '@/components/ui/TemplatePreview'
import { ASPECT_VALUES, dimensionsFor } from '@/lib/aspectRatio'

const MARKER = 'MARKER-xyz-123'
const HTML = `<!DOCTYPE html><html><body><p class="x">${MARKER} &amp; 'q' < ></p></body></html>`

// React escapes attribute values; undo it to compare srcDoc with the input exactly.
const unescape = (v: string) =>
  v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

describe('TemplatePreview', () => {
  for (const ratio of ASPECT_VALUES) {
    it(`renders a sandboxed iframe at the ${ratio} canvas size`, () => {
      const markup = renderToStaticMarkup(
        React.createElement(TemplatePreview, { html: HTML, aspectRatio: ratio, title: 'Preview of T' }),
      )
      const { width, height } = dimensionsFor(ratio)
      expect(markup).toContain('sandbox=""')
      expect(markup).not.toContain('allow-')
      expect(markup).toContain(`width="${width}"`)
      expect(markup).toContain(`height="${height}"`)
      const srcDoc = markup.match(/srcDoc="([^"]*)"/)?.[1]
      expect(srcDoc && unescape(srcDoc)).toBe(HTML)
      expect(markup).toContain('aria-hidden="true"')
      expect(markup).toContain('tabindex="-1"')
      expect(markup).toContain('pointer-events:none')
    })
  }
})
