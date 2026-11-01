import { describe, it, expect } from 'vitest'
import type { Channel } from '@prisma/client'
import { CAPTION_CHANNELS } from '@/lib/channels'
import { parseRegenerateBody } from '@/lib/captions/requests'
import { decideModel, regenerateStampTier } from '@/lib/models/resolve'

// 008 FR-09 / AC-06, 039. The targets are what parseRegenerateBody returns (as `targets`):
// { kind: 'GENERAL' } → ['GENERAL'], { channel } → [channel], { headline: true } → ['HEADLINE'].
// "Regenerate all" ({}) is retired (039 Q2), but the rule still holds for several caption
// targets, so those cases pass the list directly.

const S = 'claude-sonnet-5-5'
const O = 'claude-opus-5-5'
const H = 'claude-haiku-4-5'

const ALL_CHANNELS: Channel[] = CAPTION_CHANNELS.map((s) => s.channel)

// The real request parser, so the rule is tested on the targets a route will pass.
const targets = (body: unknown) => {
  const parsed = parseRegenerateBody(body)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.value.targets
}
const draft = (stamps: (string | null)[], headlineModel: string | null = null) => ({
  captions: ALL_CHANNELS.map((target, i) => ({ target, model: stamps[i] ?? null })),
  headlineModel,
})

describe('regenerateStampTier — AC-06', () => {
  it('there are two caption channels (the rule is “both rows”)', () => {
    expect(ALL_CHANNELS).toHaveLength(2)
  })

  it('several targets with [S, S] → S', () => {
    expect(regenerateStampTier(ALL_CHANNELS, draft([S, S]))).toBe(S)
  })

  it('several targets with [S, O] → no stamp tier; resolution starts at the team default with no substitution', () => {
    const stamp = regenerateStampTier(ALL_CHANNELS, draft([S, O]))
    expect(stamp).toBeNull()
    const r = decideModel('CAPTION', {
      stamp,
      policy: {
        allowed: ['HAIKU', 'SONNET', 'OPUS'],
        defaults: { CAPTION: 'HAIKU' },
        gateOn: false,
      },
      credential: 'personal',
      mode: 'api',
    })
    expect(r.ok && [r.resolved.key, r.resolved.source, r.resolved.substitutedFrom]).toEqual([
      'HAIKU',
      'team',
      null,
    ])
  })

  it('several targets with [S, null] → no stamp tier', () => {
    expect(regenerateStampTier(ALL_CHANNELS, draft([S, null]))).toBeNull()
  })

  it('several targets with a missing row → no stamp tier', () => {
    const d = draft([S, S])
    expect(regenerateStampTier(ALL_CHANNELS, { ...d, captions: d.captions.slice(0, 1) })).toBeNull()
  })

  it('{ channel: LINKEDIN } uses the LinkedIn row’s stamp only', () => {
    const d = {
      ...draft([]),
      captions: [
        { target: 'INSTAGRAM' as Channel, model: H },
        { target: 'LINKEDIN' as Channel, model: O },
      ],
    }
    expect(regenerateStampTier(targets({ channel: 'LINKEDIN' }), d)).toBe(O)
    expect(regenerateStampTier(targets({ channel: 'INSTAGRAM' }), d)).toBe(H)
  })

  it("{ kind: 'GENERAL' } uses the general row's stamp only, and none when the post has no general row", () => {
    const d = {
      ...draft([]),
      captions: [
        { target: 'GENERAL' as const, model: S },
        { target: 'INSTAGRAM' as const, model: O },
      ],
    }
    expect(regenerateStampTier(targets({ kind: 'GENERAL' }), d)).toBe(S)
    expect(regenerateStampTier(targets({ kind: 'GENERAL' }), { ...d, captions: d.captions.slice(1) })).toBeNull()
  })

  it('{ headline: true } uses headlineModel, never a caption row', () => {
    expect(regenerateStampTier(targets({ headline: true }), draft([S, S], O))).toBe(O)
    expect(regenerateStampTier(targets({ headline: true }), draft([S, S], null))).toBeNull()
  })

  it('no targets → no stamp tier', () => {
    expect(regenerateStampTier([], draft([S, S], S))).toBeNull()
  })
})
