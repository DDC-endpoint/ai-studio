// 012 T6 — the caption request bodies (FR-11, FR-12): the PATCH union and the
// regenerate-copy body, with their 400 messages.

import { describe, it, expect } from 'vitest'
import {
  CAPTION_TEXT_MAX,
  CHANNEL_MESSAGE,
  PATCH_SHAPE_MESSAGE,
  REGENERATE_BOTH_MESSAGE,
  REGENERATE_SHAPE_MESSAGE,
  GENERAL_NOT_DELETABLE_MESSAGE,
  UNDO_SHAPE_MESSAGE,
  parseCaptionPatch,
  parseDeleteQuery,
  parseRegenerateBody,
  parseUndoBody,
} from '@/lib/captions/requests'
import { modelKeyMessage } from '@/lib/models/requests'

describe('parseCaptionPatch (FR-12)', () => {
  it('accepts { channel, text } for every registry channel, text as typed', () => {
    for (const channel of ['INSTAGRAM', 'LINKEDIN'] as const) {
      expect(parseCaptionPatch({ channel, text: '  **kept** ' })).toEqual({
        ok: true,
        value: { channel, text: '  **kept** ' },
      })
    }
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: '' })).toEqual({
      ok: true,
      value: { channel: 'INSTAGRAM', text: '' },
    })
  })

  it("accepts { kind: 'GENERAL', text } for the general caption, text as typed (039 D13)", () => {
    expect(parseCaptionPatch({ kind: 'GENERAL', text: '  **kept** ' })).toEqual({
      ok: true,
      value: { kind: 'GENERAL', text: '  **kept** ' },
    })
  })

  it("refuses { kind: 'CURATED', text }, a kind with a channel, and a kind with a headline", () => {
    for (const body of [
      { kind: 'CURATED', text: 'x' },
      { kind: 'GENERAL', channel: 'INSTAGRAM', text: 'x' },
      { kind: 'GENERAL', headline: 'h' },
      { kind: 'GENERAL' },
    ]) {
      expect(parseCaptionPatch(body).ok, JSON.stringify(body)).toBe(false)
    }
  })

  it('accepts { headline } (validated later by validateHeadline)', () => {
    expect(parseCaptionPatch({ headline: 'Applications are open' })).toEqual({
      ok: true,
      value: { headline: 'Applications are open' },
    })
  })

  it('caps text at 10,000 characters; over a channel hard limit is allowed', () => {
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 'x'.repeat(CAPTION_TEXT_MAX) }).ok).toBe(true)
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 'x'.repeat(CAPTION_TEXT_MAX + 1) })).toEqual({
      ok: false,
      error: 'text must be at most 10,000 characters',
    })
  })

  it('a legacy { copyText } body → the shape message', () => {
    expect(parseCaptionPatch({ copyText: 'old' })).toEqual({ ok: false, error: PATCH_SHAPE_MESSAGE })
    expect(PATCH_SHAPE_MESSAGE).toBe("Send { kind: 'GENERAL', text }, { channel, text } or { headline }")
  })

  it.each([
    ['empty object', {}],
    ['channel without text', { channel: 'INSTAGRAM' }],
    ['text without channel', { text: 'x' }],
    ['both forms', { channel: 'INSTAGRAM', text: 'x', headline: 'h' }],
    ['null', null],
    ['an array', [1]],
    ['a string', 'text'],
  ])('the wrong shape (%s) → the shape message', (_name, body) => {
    expect(parseCaptionPatch(body)).toEqual({ ok: false, error: PATCH_SHAPE_MESSAGE })
  })

  it('an unknown channel names the registry channels', () => {
    expect(parseCaptionPatch({ channel: 'TIKTOK', text: 'x' })).toEqual({ ok: false, error: CHANNEL_MESSAGE })
    expect(CHANNEL_MESSAGE).toBe('channel must be INSTAGRAM, LINKEDIN or FACEBOOK')
  })

  it('WHATSAPP is refused on PATCH (026 AC-03) and on regenerate (039 AC-27: the shape message)', () => {
    expect(parseCaptionPatch({ channel: 'WHATSAPP', text: 'x' })).toEqual({ ok: false, error: CHANNEL_MESSAGE })
    expect(parseRegenerateBody({ channel: 'WHATSAPP' })).toMatchObject({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
  })

  it('non-string values get their own message', () => {
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 5 })).toEqual({ ok: false, error: 'text must be a string' })
    expect(parseCaptionPatch({ headline: 5 })).toEqual({ ok: false, error: 'headline must be a string' })
  })
})

describe('parseRegenerateBody (FR-11, 039 D12)', () => {
  it("{ kind: 'GENERAL' } → the general caption only", () => {
    expect(parseRegenerateBody({ kind: 'GENERAL' })).toStrictEqual({ ok: true, value: { targets: ['GENERAL'] } })
  })

  it('{ channel } → that caption only', () => {
    expect(parseRegenerateBody({ channel: 'LINKEDIN' })).toStrictEqual({ ok: true, value: { targets: ['LINKEDIN'] } })
  })

  it('{ headline: true } → the headline only', () => {
    expect(parseRegenerateBody({ headline: true })).toStrictEqual({ ok: true, value: { targets: ['HEADLINE'] } })
  })

  // 039 Q2, AC-27: "Regenerate all" is retired.
  it.each([
    ['{}', {}],
    ['{ kind: CURATED }', { kind: 'CURATED' }],
    ['{ channel: WHATSAPP }', { channel: 'WHATSAPP' }],
    ['{ channel: TIKTOK }', { channel: 'TIKTOK' }],
    ['{ model } alone', { model: 'OPUS' }],
  ])('%s gets the shape message', (_name, body) => {
    expect(parseRegenerateBody(body)).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
    expect(REGENERATE_SHAPE_MESSAGE).toBe("Send { kind: 'GENERAL' }, { channel } or { headline: true }")
  })

  it('more than one of kind, channel and headline → 400', () => {
    for (const body of [
      { channel: 'LINKEDIN', headline: true },
      { kind: 'GENERAL', channel: 'LINKEDIN' },
      { kind: 'GENERAL', headline: true },
    ]) {
      expect(parseRegenerateBody(body)).toEqual({ ok: false, error: REGENERATE_BOTH_MESSAGE })
    }
  })

  it('headline other than true, an unknown key, or a non-object → 400', () => {
    expect(parseRegenerateBody({ headline: false })).toEqual({ ok: false, error: 'headline must be true' })
    expect(parseRegenerateBody({ copy: true })).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
    expect(parseRegenerateBody(null)).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
  })

  // 008 FR-17: `model` is optional on all three forms; the body stays strict.
  it('each form takes an optional model, returned beside the targets', () => {
    expect(parseRegenerateBody({ kind: 'GENERAL', model: 'OPUS' })).toStrictEqual({
      ok: true,
      value: { targets: ['GENERAL'], model: 'OPUS' },
    })
    expect(parseRegenerateBody({ channel: 'LINKEDIN', model: 'HAIKU' })).toStrictEqual({
      ok: true,
      value: { targets: ['LINKEDIN'], model: 'HAIKU' },
    })
    expect(parseRegenerateBody({ headline: true, model: 'SONNET' })).toStrictEqual({
      ok: true,
      value: { targets: ['HEADLINE'], model: 'SONNET' },
    })
  })

  it('{ channel, headline, model } is still a 400, and so is an unknown extra key beside model', () => {
    expect(parseRegenerateBody({ channel: 'LINKEDIN', headline: true, model: 'HAIKU' })).toEqual({
      ok: false,
      error: REGENERATE_BOTH_MESSAGE,
    })
    expect(parseRegenerateBody({ model: 'HAIKU', copy: true })).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
  })

  it('a model outside the closed keys is a 400 carrying MODEL_NOT_ALLOWED', () => {
    for (const model of ['gpt-4o', 'opus', null, 3]) {
      expect(parseRegenerateBody({ channel: 'LINKEDIN', model })).toEqual({
        ok: false,
        error: modelKeyMessage(),
        code: 'MODEL_NOT_ALLOWED',
      })
    }
  })
})

// ── 039 T3: the undo body and the delete query (D14, D15) ────────────────────

describe('parseUndoBody (039 D15)', () => {
  it('takes { kind: "GENERAL" } or { channel }', () => {
    expect(parseUndoBody({ kind: 'GENERAL' })).toEqual({ ok: true, value: { kind: 'GENERAL' } })
    expect(parseUndoBody({ channel: 'LINKEDIN' })).toEqual({ ok: true, value: { kind: 'CURATED', channel: 'LINKEDIN' } })
  })

  it.each([
    ['empty', {}],
    ['both', { kind: 'GENERAL', channel: 'INSTAGRAM' }],
    ['a wrong kind', { kind: 'CURATED' }],
    ['WhatsApp', { channel: 'WHATSAPP' }],
    ['an extra key', { channel: 'INSTAGRAM', text: 'x' }],
    ['null', null],
    ['a string', 'x'],
  ])('%s is the shape error', (_n, raw) => {
    const r = parseUndoBody(raw)
    expect(r.ok).toBe(false)
    if (!r.ok) expect([UNDO_SHAPE_MESSAGE, CHANNEL_MESSAGE, "kind must be 'GENERAL'"]).toContain(r.error)
  })
})

describe('parseDeleteQuery (039 D14)', () => {
  const q = (s: string) => parseDeleteQuery(new URLSearchParams(s))

  it('takes a curatable channel', () => {
    expect(q('channel=INSTAGRAM')).toEqual({ ok: true, channel: 'INSTAGRAM' })
    expect(q('channel=LINKEDIN')).toEqual({ ok: true, channel: 'LINKEDIN' })
  })

  it('refuses the general caption with its own code', () => {
    for (const s of ['channel=GENERAL', 'kind=GENERAL', 'kind=GENERAL&channel=INSTAGRAM']) {
      expect(q(s)).toEqual({ ok: false, error: GENERAL_NOT_DELETABLE_MESSAGE, code: 'general-not-deletable' })
    }
  })

  it('anything else is the channel message', () => {
    for (const s of ['', 'channel=', 'channel=WHATSAPP', 'channel=instagram', 'kind=CURATED']) {
      expect(q(s)).toEqual({ ok: false, error: CHANNEL_MESSAGE })
    }
  })
})
