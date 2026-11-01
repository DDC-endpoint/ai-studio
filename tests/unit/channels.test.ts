import { describe, it, expect } from 'vitest'
import { Channel } from '@prisma/client'
import { captionMaxTokens } from '@/lib/agent/prompts/caption'
import { FACT_WHERE, parseFactsCheck } from '@/lib/factsCheck/types'
import {
  CAPTION_CHANNELS,
  CAPTION_REGISTRY,
  GENERAL_CAPTION,
  targetOf,
  CHANNEL_CAPTION_LIMITS,
  CHANNEL_LABELS,
  CHANNEL_VALUES,
  PUBLISHABLE_CHANNELS,
  captionLength,
  captionSpec,
  channelLabel,
  isPublishableChannel,
} from '@/lib/channels'

describe('channelLabel', () => {
  it('maps enum values to human labels', () => {
    expect(channelLabel('INSTAGRAM')).toBe('Instagram')
    expect(channelLabel('LINKEDIN')).toBe('LinkedIn')
  })

  it('tolerates lowercase / mixed-case input (legacy rows)', () => {
    expect(channelLabel('instagram')).toBe('Instagram')
    expect(channelLabel('LinkedIn')).toBe('LinkedIn')
    expect(channelLabel('linkedin')).toBe('LinkedIn')
  })

  it('falls back to the raw string for unknown values', () => {
    expect(channelLabel('tiktok')).toBe('tiktok')
    expect(channelLabel('')).toBe('')
  })
})

// --- 012 FR-01 / AC-01: the per-channel registry ---
describe('CAPTION_CHANNELS registry', () => {
  it('covers every Channel enum value except WHATSAPP exactly once (026: the WhatsApp caption was dropped)', () => {
    const registered = CAPTION_CHANNELS.map((s) => s.channel)
    // Sorted equality fails on a missing value and on a duplicate alike.
    expect([...registered].sort()).toEqual([...Object.values(Channel)].filter((c) => c !== 'WHATSAPP').sort())
    expect(new Set(registered).size).toBe(registered.length)
  })

  it('is ordered Instagram, LinkedIn with unique JSON keys (026 AC-01)', () => {
    expect(CAPTION_CHANNELS.map((s) => s.channel)).toEqual(['INSTAGRAM', 'LINKEDIN'])
    expect(CAPTION_CHANNELS.map((s) => s.jsonKey)).toEqual(['instagram', 'linkedin'])
  })

  it('has no WhatsApp entry, so a lookup throws', () => {
    expect(() => captionSpec('WHATSAPP' as never)).toThrow(/No caption registry entry/)
  })

  it('IG hard limit 2200, LI 3000', () => {
    expect(captionSpec('INSTAGRAM')).toMatchObject({ hardLimit: 2200 })
    expect(captionSpec('LINKEDIN')).toMatchObject({ hardLimit: 3000 })
    expect(CHANNEL_CAPTION_LIMITS).toEqual({ INSTAGRAM: 2200, LINKEDIN: 3000 })
  })

  it('derives the labels, and keeps WhatsApp for old Post rows (026 AC-01)', () => {
    expect(CHANNEL_LABELS).toEqual({ INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn', WHATSAPP: 'WhatsApp' })
    expect(channelLabel('whatsapp')).toBe('WhatsApp')
  })

  it('only IG and LI are publishable, and CHANNEL_VALUES equals them', () => {
    expect(PUBLISHABLE_CHANNELS).toEqual(['INSTAGRAM', 'LINKEDIN'])
    expect(CHANNEL_VALUES).toEqual(['INSTAGRAM', 'LINKEDIN'])
  })

  it('normalises model output: IG/LI drop every **', () => {
    expect(captionSpec('INSTAGRAM').normalise('**Big** news ****x')).toBe('Big news x')
    expect(captionSpec('LINKEDIN').normalise('a ***b*** c')).toBe('a *b* c')
  })

  it('captionLength counts UTF-16 code units', () => {
    expect(captionLength('abc')).toBe(3)
    expect(captionLength('😀')).toBe(2)
  })
})

describe('isPublishableChannel', () => {
  it('accepts the publishable enum values', () => {
    expect(PUBLISHABLE_CHANNELS.every(isPublishableChannel)).toBe(true)
  })

  it('rejects WhatsApp, other casings, non-channels and non-strings', () => {
    expect(isPublishableChannel('WHATSAPP')).toBe(false)
    expect(isPublishableChannel('instagram')).toBe(false)
    expect(isPublishableChannel('facebook')).toBe(false)
    expect(isPublishableChannel(null)).toBe(false)
    expect(isPublishableChannel(42)).toBe(false)
  })
})

// --- 039 AC-03: the vocabulary is derived from the one registry ---
describe('CAPTION_REGISTRY (039)', () => {
  // T4 adds Facebook last (the spec's order is General, Instagram, LinkedIn, Facebook).
  it('is ordered General, Instagram, LinkedIn, with unique JSON keys', () => {
    expect(CAPTION_REGISTRY.map((s) => s.target)).toEqual(['GENERAL', 'INSTAGRAM', 'LINKEDIN'])
    const keys = CAPTION_REGISTRY.map((s) => s.jsonKey)
    expect(keys).toEqual(['general', 'instagram', 'linkedin'])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('the general entry has no channel; the curated ones are CAPTION_CHANNELS', () => {
    expect(GENERAL_CAPTION).toMatchObject({ kind: 'GENERAL', channel: null, hardLimit: 2200 })
    expect(CAPTION_CHANNELS.every((s) => s.kind === 'CURATED' && s.channel !== null)).toBe(true)
    expect(CAPTION_CHANNELS.map((s) => s.target)).toEqual(['INSTAGRAM', 'LINKEDIN'])
  })

  it('FACT_WHERE deep-equals [headline, ...registry targets], so it cannot drift', () => {
    expect([...FACT_WHERE]).toEqual(['headline', ...CAPTION_REGISTRY.map((e) => e.target)])
  })

  it('a stored flag with where INSTAGRAM still parses', () => {
    const stored = {
      v: 1,
      status: 'flagged',
      checkedAt: '2026-10-24T00:00:00.000Z',
      flagged: [{ kind: 'cur', value: '$49', where: 'INSTAGRAM' }],
    }
    expect(parseFactsCheck(stored)).toEqual(stored)
  })

  it('captionMaxTokens is 512 plus the headline cap and each hard limit', () => {
    expect(captionMaxTokens(['HEADLINE', 'GENERAL'])).toBe(2812)
    expect(captionMaxTokens(['LINKEDIN'])).toBe(512 + 3000)
    expect(captionMaxTokens([])).toBe(512)
  })

  it('targetOf maps a stored row to its target, and a retired channel to null', () => {
    expect(targetOf({ kind: 'GENERAL', channel: null })).toBe('GENERAL')
    expect(targetOf({ kind: 'CURATED', channel: 'LINKEDIN' })).toBe('LINKEDIN')
    expect(targetOf({ kind: 'CURATED', channel: 'WHATSAPP' })).toBeNull()
  })

  it('the general caption normalises like the others (no **)', () => {
    expect(GENERAL_CAPTION.normalise('**Big** news')).toBe('Big news')
  })
})
