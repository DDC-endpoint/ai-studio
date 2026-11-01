// Single source of truth for captions: one registry (CAPTION_REGISTRY) from
// which labels, reply keys, hard limits, rules and the fact-check places are
// all derived, never written separately. An entry is the one general caption
// (kind GENERAL, no channel) or a curated caption for one platform (kind
// CURATED, an uppercase `Channel` enum member; see prisma/schema.prisma).
//
// The vocabulary rule (039 D1): `Channel` means "a platform". A new platform is
// a new `Channel` value; a new kind of caption that is not a platform is a new
// `CaptionKind` value, never a `Channel` value. registryEnumMismatches and
// captionRegistryGuard.test.ts enforce it. Older rows/inputs may still carry
// lowercase values (e.g. a draft's stored `brief.channels` predating the enum
// normalization): the label lookup tolerates any casing. Imports the Prisma
// enums as types only, so this module stays client-safe.
import type { CaptionKind, Channel } from '@prisma/client'

export interface CaptionRules {
  words?: { min: number; max: number }
  hashtags: { min: number; max: number }
  hashtagsAtEnd?: true
  /** kit-website: code inserts the brand kit's website and the model writes none. */
  link: 'model-may-echo' | 'kit-website'
}

export interface CaptionSpec {
  target: 'GENERAL' | Channel
  kind: CaptionKind
  channel: Channel | null
  label: string
  jsonKey: string
  /** In characters; a reply over it is refused. */
  hardLimit: number
  brief: string
  rules: CaptionRules
  normalise: (text: string) => string
}

// Neither feed renders Markdown, so model output loses every `**`. Each pass
// shortens the string, so both loops terminate.
const stripDoubleAsterisks = (text: string): string => {
  let t = text
  while (t.includes('**')) t = t.replaceAll('**', '')
  return t
}

const GENERAL = {
  target: 'GENERAL',
  kind: 'GENERAL',
  channel: null,
  label: 'General',
  jsonKey: 'general',
  // Instagram's limit, the smallest of the three, so the general caption fits every channel.
  hardLimit: 2200,
  brief: 'A platform-neutral caption that can be pasted into any channel unchanged. Plain text, no Markdown, no hashtags.',
  rules: { hashtags: { min: 0, max: 0 }, link: 'model-may-echo' },
  normalise: stripDoubleAsterisks,
} as const satisfies CaptionSpec

const INSTAGRAM = {
  target: 'INSTAGRAM',
  kind: 'CURATED',
  channel: 'INSTAGRAM',
  label: 'Instagram',
  jsonKey: 'instagram',
  hardLimit: 2200,
  brief: 'Hook in the first line. Hashtags only at the end. Plain text, no Markdown.',
  rules: { hashtags: { min: 0, max: 30 }, hashtagsAtEnd: true, link: 'model-may-echo' },
  normalise: stripDoubleAsterisks,
} as const satisfies CaptionSpec

const LINKEDIN = {
  target: 'LINKEDIN',
  kind: 'CURATED',
  channel: 'LINKEDIN',
  label: 'LinkedIn',
  jsonKey: 'linkedin',
  hardLimit: 3000,
  brief: 'Professional and longer-form. At most 3 hashtags, or none. Plain text, no Markdown.',
  rules: { hashtags: { min: 0, max: 3 }, link: 'model-may-echo' },
  normalise: stripDoubleAsterisks,
} as const satisfies CaptionSpec

// General first, then the curated channels. Facebook joins in 039 T4, together
// with its `Channel` value.
export const CAPTION_REGISTRY = [GENERAL, INSTAGRAM, LINKEDIN] as const satisfies readonly CaptionSpec[]
export const GENERAL_CAPTION = CAPTION_REGISTRY[0]

type CuratedSpec = Exclude<(typeof CAPTION_REGISTRY)[number], { kind: 'GENERAL' }>

// The channels a caption can be curated for (no longer "the publish channels").
export const CAPTION_CHANNELS: readonly CuratedSpec[] = CAPTION_REGISTRY.filter(
  (s): s is CuratedSpec => s.kind === 'CURATED',
)

// A channel with rows in the database but no entry here (010 was dropped on
// 2026-10-23): its rows are hidden by registry ordering and never deleted.
export const RETIRED_CHANNELS = ['WHATSAPP'] as const

export type CuratedChannel = CuratedSpec['channel']
export type CaptionTarget = 'HEADLINE' | (typeof CAPTION_REGISTRY)[number]['target']
export type CaptionKey = (typeof CAPTION_REGISTRY)[number]['jsonKey']

// Short human label used in the wizard, review step, cards, and history drawer.
// WHATSAPP has no registry entry, so its label stays here.
export const CHANNEL_LABELS = {
  ...(Object.fromEntries(CAPTION_CHANNELS.map((s) => [s.channel, s.label])) as Record<
    Exclude<Channel, 'WHATSAPP'>,
    string
  >),
  WHATSAPP: 'WhatsApp',
} as Record<Channel, string>

// Per-channel hard caption character limit.
export const CHANNEL_CAPTION_LIMITS: Partial<Record<Channel, number>> = Object.fromEntries(
  CAPTION_CHANNELS.map((s) => [s.channel, s.hardLimit]),
)

// Channels that have a publisher: every caption channel. Inputs (briefs, queue,
// posts, team channels, MCP/ACP) accept only these. 039 T2 deletes this name,
// CHANNEL_VALUES and isPublishableChannel with their last callers.
export const PUBLISHABLE_CHANNELS: Channel[] = CAPTION_CHANNELS.map((s) => s.channel)

// Kept name: every channel picker and default reads this, so pickers stay at
// the publishable channels.
export const CHANNEL_VALUES = PUBLISHABLE_CHANNELS

export function captionSpec(target: Exclude<CaptionTarget, 'HEADLINE'>): CaptionSpec {
  const spec = CAPTION_REGISTRY.find((s) => s.target === target)
  if (!spec) throw new Error(`No caption registry entry for ${target}`)
  return spec
}

// The registry target of a stored row; null when the row's channel is retired
// (or unknown), so a reader skips it.
export function targetOf(row: {
  kind: CaptionKind
  channel: Channel | null
}): Exclude<CaptionTarget, 'HEADLINE'> | null {
  const spec = CAPTION_REGISTRY.find((s) => s.kind === row.kind && s.channel === row.channel)
  return spec ? spec.target : null
}

// What registry and enums disagree on, as `Channel:X` (an enum value that is
// neither a curated entry nor retired), `registry:X` (a curated entry whose
// channel is not an enum value), `kind:X` (a kind with no entry) and
// `collision:X` (a Channel value equal to a kind name). Empty means in step.
export function registryEnumMismatches(
  channelValues: readonly string[],
  registry: readonly CaptionSpec[],
  retired: readonly string[],
  kindValues: readonly string[],
): string[] {
  const curated = registry.filter((s) => s.kind === 'CURATED')
  const out: string[] = []
  for (const c of channelValues) {
    if (!curated.some((s) => s.channel === c) && !retired.includes(c)) out.push(`Channel:${c}`)
  }
  for (const s of curated) {
    if (!channelValues.includes(s.channel as string)) out.push(`registry:${s.channel}`)
  }
  for (const k of kindValues) {
    if (!registry.some((s) => s.kind === k)) out.push(`kind:${k}`)
  }
  for (const c of channelValues) {
    if (kindValues.includes(c)) out.push(`collision:${c}`)
  }
  return out
}

// Exact (uppercase) match only, so the type guard never lies: callers that
// tolerate legacy casing uppercase first.
export function isPublishableChannel(v: unknown): v is Channel {
  return typeof v === 'string' && PUBLISHABLE_CHANNELS.includes(v as Channel)
}

// UTF-16 code units — the one count the counter, extractor and resolver share.
export const captionLength = (t: string) => t.length

// Normalizes any-case input before lookup; falls back to the raw string for
// unrecognized values so unexpected data still renders instead of throwing.
export function channelLabel(value: string): string {
  const normalized = value.toUpperCase() as Channel
  return CHANNEL_LABELS[normalized] ?? value
}
