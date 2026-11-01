// The caption request bodies (012 FR-11, FR-12): what PATCH /api/drafts/[id]
// and POST /api/drafts/[id]/regenerate-copy accept, with their 400 messages.
// Pure, and outside the route files because a Next route module may export
// only its handlers.

import { z } from 'zod'
import { CAPTION_CHANNELS, type CaptionTarget, type CuratedChannel } from '@/lib/channels'
import type { ModelKey } from '@/lib/models/catalogue'
import { MODEL_NOT_ALLOWED, modelKeySchema } from '@/lib/models/requests'

// A caption the user types is stored as typed, up to this length. Over a
// channel's hard limit is allowed (the counter shows it; publish refuses it).
export const CAPTION_TEXT_MAX = 10_000

const CHANNELS = CAPTION_CHANNELS.map((s) => s.channel) as [CuratedChannel, ...CuratedChannel[]]

const orList = (values: readonly string[]) =>
  values.length > 1 ? `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}` : values[0]

export const CHANNEL_MESSAGE = `channel must be ${orList(CHANNELS)}`
export const PATCH_SHAPE_MESSAGE = "Send { kind: 'GENERAL', text }, { channel, text } or { headline }"
export const REGENERATE_SHAPE_MESSAGE = "Send { kind: 'GENERAL' }, { channel } or { headline: true }"
export const REGENERATE_BOTH_MESSAGE = "Send one of { kind: 'GENERAL' }, { channel } or { headline: true }, not several"

const kindSchema = z.literal('GENERAL', { errorMap: () => ({ message: "kind must be 'GENERAL'" }) })
const channelSchema = z.enum(CHANNELS, { errorMap: () => ({ message: CHANNEL_MESSAGE }) })

// A non-object body (null, an array, a string) reads as the wrong shape.
const shapeErrorMap =
  (message: string): z.ZodErrorMap =>
  (issue, ctx) =>
    issue.code === 'invalid_type' ? { message } : { message: ctx.defaultError }

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function firstIssue<T>(parsed: z.SafeParseReturnType<unknown, T>): ParseResult<T> {
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues[0].message }
}

// ── PATCH /api/drafts/[id] ──────────────────────────────────────────────────

export type CaptionPatch = { kind: 'GENERAL'; text: string } | { channel: CuratedChannel; text: string } | { headline: string }

const patchSchema = z
  .object(
    {
      kind: kindSchema.optional(),
      channel: channelSchema.optional(),
      text: z
        .string({ errorMap: () => ({ message: 'text must be a string' }) })
        .max(CAPTION_TEXT_MAX, `text must be at most ${CAPTION_TEXT_MAX.toLocaleString('en-US')} characters`)
        .optional(),
      headline: z.string({ errorMap: () => ({ message: 'headline must be a string' }) }).optional(),
    },
    { errorMap: shapeErrorMap(PATCH_SHAPE_MESSAGE) },
  )
  .strict(PATCH_SHAPE_MESSAGE)
  .transform((b, ctx): CaptionPatch => {
    if (b.headline !== undefined && b.kind === undefined && b.channel === undefined && b.text === undefined) {
      return { headline: b.headline }
    }
    if (b.headline === undefined && b.text !== undefined) {
      if (b.kind !== undefined && b.channel === undefined) return { kind: b.kind, text: b.text }
      if (b.kind === undefined && b.channel !== undefined) return { channel: b.channel, text: b.text }
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PATCH_SHAPE_MESSAGE })
    return z.NEVER
  })

// Exactly one of { kind: 'GENERAL', text }, { channel, text } or { headline }. A legacy { copyText } body
// is the wrong shape.
export function parseCaptionPatch(raw: unknown): ParseResult<CaptionPatch> {
  return firstIssue(patchSchema.safeParse(raw))
}

// ── POST /api/drafts/[id]/regenerate-copy ───────────────────────────────────

/** The action's targets, plus the explicit model pick when one was sent (008 FR-17). */
export interface RegenerateRequest {
  targets: CaptionTarget[]
  model?: ModelKey
}

// AC-27: a regenerate body that names no curatable target (an unknown kind or
// channel, WhatsApp included) gets the shape message.
const regenerateKindSchema = z.literal('GENERAL', { errorMap: () => ({ message: REGENERATE_SHAPE_MESSAGE }) })
const regenerateChannelSchema = z.enum(CHANNELS, { errorMap: () => ({ message: REGENERATE_SHAPE_MESSAGE }) })

const regenerateSchema = z
  .object(
    {
      kind: regenerateKindSchema.optional(),
      channel: regenerateChannelSchema.optional(),
      headline: z.literal(true, { errorMap: () => ({ message: 'headline must be true' }) }).optional(),
      model: modelKeySchema.optional(),
    },
    { errorMap: shapeErrorMap(REGENERATE_SHAPE_MESSAGE) },
  )
  .strict(REGENERATE_SHAPE_MESSAGE)
  .transform((b, ctx): RegenerateRequest => {
    const named = [b.kind, b.channel, b.headline].filter((v) => v !== undefined).length
    if (named !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: named === 0 ? REGENERATE_SHAPE_MESSAGE : REGENERATE_BOTH_MESSAGE,
      })
      return z.NEVER
    }
    const model = b.model === undefined ? {} : { model: b.model }
    if (b.headline) return { targets: ['HEADLINE'], ...model }
    if (b.kind !== undefined) return { targets: ['GENERAL'], ...model }
    return { targets: [b.channel as CuratedChannel], ...model }
  })

// { kind: 'GENERAL' } → the general caption (created on a post that has none);
// { channel } → that curated caption; { headline: true } → the headline — each
// with an optional `model` (008 FR-17). Strict: any other key is a 400, so is {}
// ("Regenerate all" is retired, 039 Q2), and so is more than one of the three.
// A bad `model` carries FR-17's code, so the client can tell a refused pick from
// a bad shape.
export function parseRegenerateBody(
  raw: unknown,
): ParseResult<RegenerateRequest> | { ok: false; error: string; code: typeof MODEL_NOT_ALLOWED } {
  const parsed = regenerateSchema.safeParse(raw)
  if (!parsed.success && parsed.error.issues[0].path[0] === 'model') {
    return { ok: false, error: parsed.error.issues[0].message, code: MODEL_NOT_ALLOWED }
  }
  return firstIssue(parsed)
}
