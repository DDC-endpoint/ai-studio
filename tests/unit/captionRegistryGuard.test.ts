// 039 AC-02 / FR-03: the caption registry and the Prisma enums must agree. Adding
// a platform is one checklist this test enforces: the enum migration, the
// registry entry and its rules. Each failing fixture below must fail the guard
// (038 L36): a guard that only passes on the real enums proves nothing.
import { describe, it, expect } from 'vitest'
import { CaptionKind, Channel } from '@prisma/client'
import { CAPTION_REGISTRY, RETIRED_CHANNELS, registryEnumMismatches, type CaptionSpec } from '@/lib/channels'

const CHANNELS = Object.values(Channel) as string[]
const KINDS = Object.values(CaptionKind) as string[]

const curatedEntry = (channel: string): CaptionSpec => ({
  target: channel as never,
  kind: 'CURATED',
  channel: channel as never,
  label: channel,
  jsonKey: channel.toLowerCase(),
  hardLimit: 100,
  brief: '',
  rules: { hashtags: { min: 0, max: 0 }, link: 'model-may-echo' },
  normalise: (t) => t,
})

describe('registryEnumMismatches (the registry guard)', () => {
  it('is empty for the real enums and the real registry', () => {
    expect(registryEnumMismatches(CHANNELS, CAPTION_REGISTRY, RETIRED_CHANNELS, KINDS)).toEqual([])
  })

  it('a Channel value with no entry and not retired fails: a fixture channel list with THREADS added', () => {
    expect(registryEnumMismatches([...CHANNELS, 'THREADS'], CAPTION_REGISTRY, RETIRED_CHANNELS, KINDS)).toEqual([
      'Channel:THREADS',
    ])
  })

  it('a curated entry whose channel is not a Channel value fails: a fixture registry with MASTODON', () => {
    expect(
      registryEnumMismatches(CHANNELS, [...CAPTION_REGISTRY, curatedEntry('MASTODON')], RETIRED_CHANNELS, KINDS),
    ).toEqual(['registry:MASTODON'])
  })

  it('a CaptionKind value with no entry fails: a fixture kind list with SUMMARY', () => {
    expect(registryEnumMismatches(CHANNELS, CAPTION_REGISTRY, RETIRED_CHANNELS, [...KINDS, 'SUMMARY'])).toEqual([
      'kind:SUMMARY',
    ])
  })

  it('a Channel value equal to a kind name fails (a kind is never a platform)', () => {
    expect(
      registryEnumMismatches([...CHANNELS, 'GENERAL'], CAPTION_REGISTRY, [...RETIRED_CHANNELS, 'GENERAL'], KINDS),
    ).toEqual(['collision:GENERAL'])
  })

  it('WHATSAPP is accepted only through RETIRED_CHANNELS', () => {
    expect(CHANNELS).toContain('WHATSAPP')
    expect(registryEnumMismatches(CHANNELS, CAPTION_REGISTRY, [], KINDS)).toEqual(['Channel:WHATSAPP'])
    expect(registryEnumMismatches(CHANNELS, CAPTION_REGISTRY, RETIRED_CHANNELS, KINDS)).toEqual([])
  })
})
