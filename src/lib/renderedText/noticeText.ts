// The sentences of the headline badge and the download line (030 FR-13, 037 FR-05),
// in one place so the page, the dialog and the tests share them. Pure and
// client-safe; structured lines, not JSX.
import type { HeadlineImage } from './state'
import type { HeadlineState, UnverifiedReason } from './vocab'

export interface HeadlineNotice {
  // The first sentence, by state.
  headline: string
  // The per-reason sentence, for `unconfirmed` only.
  reasonLine: string | null
}

const REASON_LINE: Record<UnverifiedReason, string> = {
  'not-found': 'The design does not contain it as one piece of text.',
  ambiguous: 'The design shows it more than once.',
  'not-visible': 'It is in the design but hidden, clipped or covered.',
  'not-checked': 'The check could not run.',
}

// Null for `fresh` and `unknown`: the badge renders only for `stale` and `unconfirmed`.
export function headlineNoticeText(image: HeadlineImage): HeadlineNotice | null {
  if (image.state !== 'stale' && image.state !== 'unconfirmed') return null
  const headline =
    image.state === 'stale'
      ? `The image still shows the previous headline “${image.renderedHeadline ?? ''}”.`
      : "We couldn't confirm that the image shows the current headline."
  const reasonLine =
    image.state === 'unconfirmed' && image.reason ? REASON_LINE[image.reason] : null
  return { headline, reasonLine }
}

// The one non-blocking line under the Download button; null for `fresh` and `unknown`.
export function downloadLineFor(state: HeadlineState): string | null {
  if (state === 'stale') return 'The image shows an older headline.'
  if (state === 'unconfirmed') return "We couldn't confirm the image shows the current headline."
  return null
}
