import React from 'react'
import { cn } from '@/lib/utils'
import { SMALL_CAPS } from './atoms'

type PostStatus =
  | 'draft'
  | 'exported'
  | 'scheduled'
  | 'published'
  | 'failed'
  // Scheduled-generation queue states (reuse the existing status-* tokens):
  | 'queued'
  | 'generating'
  | 'generated'
  | 'cancelled'
  // Unfinished (autosaved) brief-wizard sessions on the dashboard:
  | 'unfinished'

// The tones a free-text chip can take, for states with no `status` entry
// (Connected, Invalid, Active, Deactivated, Revoked): each reuses a status's
// colours.
type StatusChipTone = 'published' | 'draft' | 'scheduled' | 'failed' | 'exported'

// Either a known `status` (its label comes from statusConfig), or a `tone` with
// the label as children. The label is always visible text either way.
type StatusChipStatusProps = {
  status: PostStatus
  tone?: never
  children?: never
  className?: string
}
type StatusChipToneProps = {
  tone: StatusChipTone
  children: React.ReactNode
  status?: never
  className?: string
}
type StatusChipProps = StatusChipStatusProps | StatusChipToneProps

// Folio status chip (DESIGN_SYSTEM.md §8.5): text in the status colour, a fill
// of the same colour at 0.10 (in both themes — the --status-* vars switch, and
// tests/unit/contrast.test.ts measures the text at 0.10), and a 1 px inset ring
// in currentColor. The label is always present: status is never colour alone.
// Tailwind can't build class names from template strings, so each status
// spells its utilities out.
const statusConfig: Record<PostStatus, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-status-draft/10 text-status-draft' },
  exported: { label: 'Ready', classes: 'bg-status-exported/10 text-status-exported' },
  scheduled: { label: 'Scheduled', classes: 'bg-status-scheduled/10 text-status-scheduled' },
  published: { label: 'Published', classes: 'bg-status-published/10 text-status-published' },
  failed: { label: 'Failed', classes: 'bg-status-failed/10 text-status-failed' },
  queued: { label: 'Queued', classes: 'bg-status-scheduled/10 text-status-scheduled' },
  generating: { label: 'Generating', classes: 'bg-status-exported/10 text-status-exported' },
  generated: { label: 'Generated', classes: 'bg-status-published/10 text-status-published' },
  cancelled: { label: 'Cancelled', classes: 'bg-status-draft/10 text-status-draft' },
  unfinished: { label: 'Unfinished', classes: 'bg-status-scheduled/10 text-status-scheduled' },
}

// Two overloads rather than one union parameter, with the `status` one last:
// React.ComponentProps reads the last signature, so
// ComponentProps<typeof StatusChip>['status'] stays PostStatus (not
// PostStatus | undefined) for callers that type a status map with it.
export function StatusChip(props: StatusChipToneProps): React.JSX.Element
export function StatusChip(props: StatusChipStatusProps): React.JSX.Element
export function StatusChip(props: StatusChipProps) {
  const config = props.status !== undefined ? statusConfig[props.status] : statusConfig[props.tone]

  return (
    <span
      className={cn(
        'inline-flex items-center h-[22px] px-2 rounded-ui-sm flex-shrink-0 whitespace-nowrap',
        `font-text ${SMALL_CAPS}`,
        'shadow-[inset_0_0_0_1px_currentColor]',
        config.classes,
        props.className,
      )}
    >
      {props.status !== undefined ? config.label : props.children}
    </span>
  )
}
