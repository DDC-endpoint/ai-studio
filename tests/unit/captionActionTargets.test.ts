// 012 T6 — the pure caption-action rules (FR-11, FR-19, design §5, AC-07):
// which panels a draft is busy writing, and what a write leaves in a row.

import { describe, it, expect } from 'vitest'
import type { Channel } from '@prisma/client'
import {
  captionActionTargets,
  failedCaptionFields,
  settleCaptionRow,
  type CaptionActionDraft,
  type CaptionRowStatus,
} from '@/lib/captions/actionTargets'

// A stored caption row as the settle rule reads it (039: kind, deletedAt, the
// stamp and the source hash come with the text).
const rowOf = (text: string) => ({
  kind: 'CURATED' as const,
  text,
  deletedAt: null,
  model: null,
  modelSubstitutedFrom: null,
  route: null,
  generalHash: null,
})

function draft(
  rows: Partial<Record<Channel, CaptionRowStatus>> = {},
  over: Partial<CaptionActionDraft> = {},
): CaptionActionDraft {
  return {
    status: 'EXPORTED',
    pendingAction: null,
    headline: 'Applications are open',
    captions: (['INSTAGRAM', 'LINKEDIN'] as Channel[]).map((channel) => ({
      channel,
      status: rows[channel] ?? 'READY',
    })),
    ...over,
  }
}

describe('captionActionTargets', () => {
  it('is empty on a settled draft', () => {
    expect(captionActionTargets(draft())).toEqual([])
  })

  it('REGENERATE_COPY with PENDING rows → those rows, in registry order', () => {
    expect(
      captionActionTargets(draft({ LINKEDIN: 'PENDING', INSTAGRAM: 'PENDING' }, { pendingAction: 'REGENERATE_COPY' })),
    ).toEqual(['INSTAGRAM', 'LINKEDIN'])
  })

  it('AC-07: REGENERATE_COPY with no PENDING row → the headline', () => {
    expect(captionActionTargets(draft({}, { pendingAction: 'REGENERATE_COPY' }))).toEqual(['HEADLINE'])
  })

  it('another action (design, refine) never makes a caption panel busy', () => {
    expect(captionActionTargets(draft({}, { pendingAction: 'REGENERATE_DESIGN' }))).toEqual([])
    expect(captionActionTargets(draft({}, { pendingAction: 'REFINE' }))).toEqual([])
  })

  it('a generation (IN_PROGRESS) → its PENDING rows, plus the headline while it is null', () => {
    const pending = { INSTAGRAM: 'PENDING', LINKEDIN: 'PENDING' } as const
    expect(captionActionTargets(draft(pending, { status: 'IN_PROGRESS', headline: null }))).toEqual([
      'HEADLINE',
      'INSTAGRAM',
      'LINKEDIN',
    ])
    // Retry over a draft that already has a headline: the headline is not busy.
    expect(captionActionTargets(draft(pending, { status: 'IN_PROGRESS' }))).toEqual([
      'INSTAGRAM',
      'LINKEDIN',
    ])
  })

  it('a generation past the caption step (design rendering) has nothing busy', () => {
    expect(captionActionTargets(draft({}, { status: 'IN_PROGRESS' }))).toEqual([])
    expect(captionActionTargets(draft({}, { status: 'IN_PROGRESS', headline: null }))).toEqual([])
  })
})

describe('settleCaptionRow (design §5 table, A7)', () => {
  it('ok → READY with the new text and the reason cleared, whatever was there', () => {
    expect(settleCaptionRow(rowOf('old'), { ok: true, text: 'new' })).toEqual({
      status: 'READY',
      text: 'new',
      failureReason: null,
      // 039 D15: the text it replaced, for one-step Undo
      previous: { v: 1, text: 'old', deleted: false, model: null, modelSubstitutedFrom: null, route: null, generalHash: null },
      deletedAt: null,
      generalHash: null,
    })
    // an empty live row has nothing to go back to
    expect(settleCaptionRow(rowOf(''), { ok: true, text: 'new' })).not.toHaveProperty('previous')
    expect(settleCaptionRow(rowOf(''), { ok: true, text: 'new' }).status).toBe('READY')
  })

  it('a Facebook caption gets the kit website from code, after the body and before the hashtag line (039 D17)', () => {
    const fb = { ...rowOf(''), channel: 'FACEBOOK' as const }
    const settled = settleCaptionRow(fb, { ok: true, text: 'Body.'+String.fromCharCode(10)+'#a #b' }, null, { website: 'https://acme.example' })
    expect(settled).toMatchObject({ status: 'READY', text: 'Body.'+String.fromCharCode(10)+'https://acme.example'+String.fromCharCode(10,10)+'#a #b' })
    // no website: the body as validated; other channels never get one
    expect(settleCaptionRow(fb, { ok: true, text: 'Body.' }, null, {})).toMatchObject({ text: 'Body.' })
    expect(settleCaptionRow({ ...rowOf(''), channel: 'LINKEDIN' as const }, { ok: true, text: 'Body.' }, null, { website: 'https://acme.example' })).toMatchObject({ text: 'Body.' })
  })

  it('a regenerate that composes the same text as before records no previous (039 D15)', () => {
    const fb = { ...rowOf('Body.'+String.fromCharCode(10)+'https://acme.example'), channel: 'FACEBOOK' as const }
    expect(settleCaptionRow(fb, { ok: true, text: 'Body.' }, null, { website: 'https://acme.example' })).not.toHaveProperty('previous')
  })

  it('AC-07: failed on a row with text → READY, text unchanged, "Regenerate failed: <reason>"', () => {
    expect(settleCaptionRow(rowOf('good text'), { ok: false, reason: 'missing' })).toEqual({
      status: 'READY',
      text: 'good text',
      failureReason: 'Regenerate failed: missing',
    })
  })

  it('AC-07: failed on an empty row → FAILED with no text (the CHECK FAILED ⇒ text = "")', () => {
    expect(settleCaptionRow(rowOf(''), { ok: false, reason: 'over-limit (2,201 / 2,200)' })).toEqual({
      status: 'FAILED',
      text: '',
      failureReason: 'over-limit (2,201 / 2,200)',
    })
  })

  it('whitespace-only is not usable text → FAILED', () => {
    expect(settleCaptionRow(rowOf(' \n '), { ok: false, reason: 'empty' })).toMatchObject({
      status: 'FAILED',
      text: '',
    })
  })
})

describe('failedCaptionFields', () => {
  it('fails every target with the one reason', () => {
    expect(failedCaptionFields(['HEADLINE', 'LINKEDIN'], 'timeout')).toEqual({
      HEADLINE: { ok: false, reason: 'timeout' },
      LINKEDIN: { ok: false, reason: 'timeout' },
    })
  })
})

// ── 039 T3: the source hash and previous on a settle (D4, D15) ───────────────

describe('settleCaptionRow — generalHash and previous (039)', () => {
  const CURATED_ROW = { ...rowOf('old'), kind: 'CURATED' as const }
  const GENERAL_ROW = { ...rowOf('old'), kind: 'GENERAL' as const }

  it('a validated curated field stores the hash it was given, or null', () => {
    expect(settleCaptionRow(CURATED_ROW, { ok: true, text: 'new' }, null, { generalHash: 'abcd1234abcd1234' }).generalHash).toBe(
      'abcd1234abcd1234',
    )
    expect(settleCaptionRow(CURATED_ROW, { ok: true, text: 'new' }).generalHash).toBeNull()
    expect(settleCaptionRow(CURATED_ROW, { ok: true, text: 'new' }, null, { generalHash: null }).generalHash).toBeNull()
  })

  it('a general row never carries a hash', () => {
    expect(settleCaptionRow(GENERAL_ROW, { ok: true, text: 'new' }, null, { generalHash: 'abcd1234abcd1234' })).not.toHaveProperty(
      'generalHash',
    )
  })

  it('a failed field writes neither previous nor generalHash, with or without text', () => {
    for (const row of [CURATED_ROW, { ...CURATED_ROW, text: '' }]) {
      const out = settleCaptionRow(row, { ok: false, reason: 'missing' }, null, { generalHash: 'abcd1234abcd1234' })
      expect(out).not.toHaveProperty('previous')
      expect(out).not.toHaveProperty('generalHash')
    }
  })

  it('the same text again changes nothing visible, so it writes no previous (the earlier snapshot stays)', () => {
    expect(settleCaptionRow(CURATED_ROW, { ok: true, text: 'old' })).not.toHaveProperty('previous')
    // ...but a deleted row brought back by the same text is a visible change.
    expect(settleCaptionRow({ ...CURATED_ROW, deletedAt: new Date() }, { ok: true, text: 'old' })).toHaveProperty('previous')
  })

  it('previous is written only over text or over a deleted row', () => {
    expect(settleCaptionRow(CURATED_ROW, { ok: true, text: 'new' })).toHaveProperty('previous')
    expect(settleCaptionRow({ ...CURATED_ROW, text: '' }, { ok: true, text: 'new' })).not.toHaveProperty('previous')
    const deleted = settleCaptionRow({ ...CURATED_ROW, text: '', deletedAt: new Date() }, { ok: true, text: 'new' })
    expect(deleted).toMatchObject({ deletedAt: null, previous: { deleted: true } })
  })
})
