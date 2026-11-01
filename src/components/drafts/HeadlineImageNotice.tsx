'use client'

import { Type } from 'lucide-react'
import type { HeadlineImage } from '@/lib/api-types'
import { headlineNoticeText } from '@/lib/renderedText/noticeText'
import { APPLY_TEXT_BETA } from '@/lib/applyText'
import { Notice } from '@/components/ui/Notice'
import { Button } from '@/components/ui/Button'
import { ICON, SMALL_CAPS } from '@/components/ui/atoms'

export interface HeadlineImageNoticeProps {
  image: HeadlineImage
  canEditInline: boolean
  canRegenerate: boolean
  // 031 FR-44: Apply to image, offered only while the image is stale.
  canApply?: boolean
  /** 038 D11: a view-only member sees the line but no action buttons. */
  readOnly?: boolean
  disabled: boolean
  onEditInline: () => void
  onRegenerateDesign: () => void
  onApply?: () => void
  // The "Beta" chip; defaults to the measured constant (031 FR-35).
  beta?: boolean
}

// 030 FR-13: the image does not show the current headline. Amber and
// `role="status"`, like CompositionNotice: a heads-up, never a blocker. The text
// comes only from `headlineNoticeText`; nothing renders for fresh or unknown.
export function HeadlineImageNotice({
  image,
  canEditInline,
  canRegenerate,
  canApply = false,
  readOnly = false,
  disabled,
  onEditInline,
  onRegenerateDesign,
  onApply,
  beta = APPLY_TEXT_BETA,
}: HeadlineImageNoticeProps) {
  const text = headlineNoticeText(image)
  if (!text) return null
  return (
    <Notice
      tone="warning"
      role="status"
      data-testid="headline-image-notice"
      data-state={image.state}
      data-reason={image.reason ?? undefined}
      icon={<Type {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden="true" />}
      className="mt-4"
    >
      <p className="font-semibold">Headline</p>
      <p className="mt-1 text-ui-xs text-fg">{text.headline}</p>
      {text.reasonLine && <p className="mt-1 text-ui-xs text-fg">{text.reasonLine}</p>}
      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onEditInline}
            disabled={disabled || !canEditInline}
            aria-label="Edit inline to fix the headline"
          >
            Edit inline
          </Button>
          {canRegenerate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRegenerateDesign}
              disabled={disabled}
              aria-label="Regenerate design to fix the headline"
            >
              Regenerate design
            </Button>
          )}
          {canApply && image.state === 'stale' && onApply && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onApply}
              disabled={disabled}
              aria-label="Apply the new headline to the image"
            >
              Apply to image
              {beta && (
                <span
                  data-testid="apply-beta-chip"
                  className={`ml-1.5 text-fg-muted ${SMALL_CAPS}`}
                >
                  Beta
                </span>
              )}
            </Button>
          )}
        </div>
      )}
    </Notice>
  )
}
