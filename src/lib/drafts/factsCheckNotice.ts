import { CAPTION_REGISTRY } from '@/lib/channels'
import type { FactsCheck, FactWhere } from '@/lib/factsCheck/types'

// 027 FR-13: the draft page's facts-check notice, as a pure function of the
// stored check, so the wording is unit-testable. Client-safe. `clear` and a
// missing check give nothing; the notice is a heads-up, never a blocker.

export type FactsNotice =
  | { status: 'flagged'; items: { value: string; where: string }[]; message: string }
  | { status: 'error'; items: []; message: string }

// Built from the registry, so a new caption gets its label with its entry; the
// Record type makes the table total over FactWhere.
const WHERE_LABEL: Record<FactWhere, string> = {
  headline: 'headline',
  ...(Object.fromEntries(
    CAPTION_REGISTRY.map((s) => [s.target, s.kind === 'GENERAL' ? 'general caption' : `${s.label} caption`]),
  ) as Record<Exclude<FactWhere, 'headline'>, string>),
}

export const FLAGGED_ADVICE = 'These are not in your brief, project or brand voice. Check them before you download it.'
export const ERROR_MESSAGE =
  'The facts check could not run for this post. Check the numbers and dates yourself before you download it.'

export function factsNoticeFor(check: FactsCheck | null | undefined): FactsNotice | null {
  if (!check) return null
  if (check.status === 'error') return { status: 'error', items: [], message: ERROR_MESSAGE }
  if (check.status !== 'flagged' || check.flagged.length === 0) return null
  const items = check.flagged.map(f => ({ value: f.value, where: WHERE_LABEL[f.where] ?? String(f.where) }))
  return {
    status: 'flagged',
    items,
    message: `${items.map(i => `${i.value} (${i.where})`).join(', ')}. ${FLAGGED_ADVICE}`,
  }
}
