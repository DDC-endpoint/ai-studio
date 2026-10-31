'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ImageIcon, Trash2, Maximize2 } from 'lucide-react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { AspectRatio } from '@prisma/client'
import { FOCUS } from '@/components/ui/atoms'
import { aspectClassFor } from '@/lib/aspectRatio'
import { postStyleLabel } from '@/components/projects/postStyleOptions'
import { formatDateTime } from '@/lib/format'

interface LibraryCardDraft {
  id: string
  exportUrl: string | null
  createdAt: string
  brief: {
    topic: string
    aspectRatio?: AspectRatio
    postStyle: string | null
    brandKitName: string | null
  }
}

interface LibraryCardProps {
  draft: LibraryCardDraft
  isTeamAdmin: boolean
  // Admin-only hard delete (button hidden when omitted).
  onDelete?: (draftId: string) => void
}

// The expand button sits on the post image, which can be any colour, so it
// uses fixed ink-on-paper values that read in both themes (DESIGN_SYSTEM.md
// §8.12): 30 × 30, inset 10 px. Shown on hover or keyboard focus, as before.
const EXPAND_BUTTON =
  'absolute top-2.5 right-2.5 inline-flex h-control-sm w-control-sm items-center justify-center rounded-ui-sm border border-[#211c18] bg-[#fffefb] text-[#211c18] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus' // ui-exception: drawn on the post image, fixed ink-on-paper per DESIGN_SYSTEM.md §8.12

export function LibraryCard({ draft, isTeamAdmin, onDelete }: LibraryCardProps) {
  const styleLabel = postStyleLabel(draft.brief.postStyle)
  const metaLine = [draft.brief.brandKitName, styleLabel].filter(Boolean).join(' · ')
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="flex flex-col min-w-0">
      {/* The thumbnail, framed like a contact-sheet frame (DESIGN_SYSTEM.md
          §8.12): a 1 px --line-subtle outline 3 px out (--line on hover), no
          box, no rounding. The post image itself is shown as rendered — no
          filter, tint, crop change or hover scale. */}
      <Link
        href={`/drafts/${draft.id}`}
        className={`relative ${aspectClassFor(draft.brief.aspectRatio)} w-full block group overflow-hidden bg-surface outline outline-1 outline-offset-[3px] outline-line-subtle hover:outline-line transition-[outline-color] duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {draft.exportUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO signed URL, not a next/image source */}
            <img
              src={draft.exportUrl}
              alt={draft.brief.topic}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            {/* Expand-to-full-screen — the tile itself still navigates to the draft. */}
            <button
              aria-label={`View ${draft.brief.topic} full screen`}
              title="View full screen"
              className={EXPAND_BUTTON}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowPreview(true)
              }}
            >
              <Maximize2 size={15} strokeWidth={1.4} />
            </button>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={36} strokeWidth={1.4} className="text-fg-muted opacity-40" />
          </div>
        )}
      </Link>

      {/* Title, then a muted meta line with the status on the right */}
      <div className="flex flex-col gap-1.5 pt-4">
        <p
          className="font-display text-ui-lg font-medium leading-snug text-fg line-clamp-2"
          title={draft.brief.topic}
        >
          {draft.brief.topic}
        </p>

        <p className="min-w-0 truncate text-ui-xs text-fg-muted" title={metaLine}>
          {metaLine || 'No kit'}
        </p>
        <p className="text-ui-xs text-fg-muted">{formatDateTime(draft.createdAt)}</p>

        {/* Actions. The floating Create post button is the view's one
            primary (§8.2), so Open is Outline here. */}
        <div className="flex items-center gap-2 pt-2">
          <Link
            href={`/drafts/${draft.id}`}
            className={`inline-flex h-control-sm items-center rounded-ui-md border border-line px-3 text-ui-sm font-semibold text-fg transition-[border-color] duration-fast ease-standard hover:border-fg ${FOCUS}`}
          >
            Open
          </Link>
          {isTeamAdmin && onDelete && (
            <button
              type="button"
              aria-label={`Delete ${draft.brief.topic}`}
              title="Delete post"
              className="ml-auto inline-flex h-control-sm w-control-sm items-center justify-center rounded-ui-md text-fg-muted transition-colors duration-fast ease-standard hover:text-status-failed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              onClick={() => onDelete(draft.id)}
            >
              <Trash2 size={15} strokeWidth={1.4} />
            </button>
          )}
        </div>
      </div>

      {draft.exportUrl && (
        <ImageLightbox
          open={showPreview}
          onClose={() => setShowPreview(false)}
          src={draft.exportUrl}
          topic={draft.brief.topic}
          aspectRatio={draft.brief.aspectRatio}
        />
      )}
    </div>
  )
}
