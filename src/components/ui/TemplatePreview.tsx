'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { AspectRatio } from '@prisma/client'
import { dimensionsFor } from '@/lib/aspectRatio'
import { cn } from '@/lib/utils'

interface TemplatePreviewProps {
  html: string
  aspectRatio: AspectRatio
  title: string
  className?: string
}

// A read-only, scaled preview of a brand template's HTML. The frame is a
// sandboxed iframe with NO permissions (empty `sandbox`: no scripts, no
// same-origin), drawn at the canvas size and scaled to the container's width.
export function TemplatePreview({ html, aspectRatio, title, className }: TemplatePreviewProps) {
  const { width, height } = dimensionsFor(aspectRatio)
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  return (
    <div
      ref={boxRef}
      className={cn('relative w-full overflow-hidden rounded-ui-sm border border-line-subtle bg-surface', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <iframe
        srcDoc={html}
        sandbox=""
        title={title}
        aria-hidden="true"
        tabIndex={-1}
        width={width}
        height={height}
        style={{
          border: 0,
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          visibility: scale > 0 ? 'visible' : 'hidden',
        }}
      />
    </div>
  )
}
