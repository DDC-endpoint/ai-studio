// The caption list MCP and ACP return (039 D20): one shape for `get_draft` and
// `generate_post`. Pure. The list is open: later kinds, a language field or the
// route stamps are additive fields per entry. An absent GENERAL entry means the
// post has none (it was made before 039).

import type { CaptionKind, CaptionStatus, Channel } from '@prisma/client'
import type { DraftCaptions } from '@/lib/captions/store'
import { captionRulesFor, type RuleMiss } from '@/lib/captions/rules'
import { captionFactsFor, type CaptionFacts } from '@/lib/drafts/factsCheckNotice'
import type { FactsCheck } from '@/lib/factsCheck/types'

export interface ExternalCaption {
  kind: CaptionKind
  channel: Channel | null
  text: string
  status: CaptionStatus
  facts: CaptionFacts | null
  rules: { met: boolean; unmet: RuleMiss[] }
}

// The general caption first, then the curated ones in registry order. Deleted
// captions and retired channels are left out (the loader already drops the
// retired ones).
export function externalCaptions(
  loaded: DraftCaptions | null,
  check: FactsCheck | null,
  website: string | null,
): ExternalCaption[] {
  if (!loaded) return []
  return [...(loaded.general ? [loaded.general] : []), ...loaded.curated]
    .filter((row) => !row.deleted)
    .map((row) => ({
      kind: row.kind,
      channel: row.channel,
      text: row.text,
      status: row.status,
      facts: captionFactsFor(check, row.target),
      rules: captionRulesFor(row, website),
    }))
}
