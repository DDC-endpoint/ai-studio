// Project-briefing prompt injection (038: the section is headed "Project briefing") — the briefing must appear in every
// generation surface (captions, Path A, Path B, background decision) when present,
// and leave the prompts byte-identical when absent.

import { describe, it, expect } from 'vitest'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildCaptionPrompt } from '@/lib/agent/prompts/caption'
import { buildPathASystemPrompt } from '@/lib/agent/prompts/pathA'
import { buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { buildBackgroundDecisionPrompt } from '@/lib/agent/prompts/background'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { ctxFor } from '../helpers/postContext'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#0f2d4e'],
  fonts: [],
  logoUrl: null,
  logos: [],
  voicePrompt: 'Warm, confident, human.',
  source: 'team',
}

const BRIEFING = 'Q3 launch campaign: highlight the IRP programme, always mention the July webinar.'

describe('buildCaptionPrompt — project briefing', () => {
  const brief = {
    topic: 'Webinar reminder',
    description: 'One week to go',
    goal: 'Signups',
    tone: 'Friendly',
    channels: ['INSTAGRAM'],
  }
  const TARGETS = ['HEADLINE', 'INSTAGRAM', 'LINKEDIN'] as const

  it('injects the briefing into the system prompt after the voice section', () => {
    const { system } = buildCaptionPrompt({ ...brief, brandVoice: 'Bold.', projectBriefing: BRIEFING }, TARGETS)
    expect(system).toContain('Project briefing (applies to every post in this project):')
    expect(system).toContain(BRIEFING)
    expect(system.indexOf('Bold.')).toBeLessThan(system.indexOf(BRIEFING))
  })

  it('omits the section entirely when absent', () => {
    const { system } = buildCaptionPrompt(brief, TARGETS)
    expect(system).not.toContain('Project briefing')
  })
})

describe('buildPathASystemPrompt — project briefing', () => {
  const base = { kit, mode: 'cli' as const, width: 1080, height: 1080, hasInlineAssets: false }

  it('includes the project briefing section only when provided', () => {
    const withBriefing = buildPathASystemPrompt({ ...base, projectBriefing: BRIEFING })
    expect(withBriefing).toContain('Project briefing (applies to every post in this project):')
    expect(withBriefing).toContain(BRIEFING)

    const without = buildPathASystemPrompt(base)
    expect(without).not.toContain('Project briefing')
  })
})

describe('buildPathBUserMessage — project briefing', () => {
  const base = {
    topic: 'Webinar reminder',
    description: 'One week to go',
    goal: 'Signups',
    tone: 'Friendly',
    channels: ['INSTAGRAM'],
    headline: 'Join us!',
    mode: 'cli' as const,
    width: 1080,
    height: 1080,
  }

  it('renders the briefing block above the per-post brief', () => {
    const msg = buildPathBUserMessage({ ...base, projectBriefing: BRIEFING })
    expect(msg).toContain(BRIEFING)
    expect(msg.indexOf(BRIEFING)).toBeLessThan(msg.indexOf('Topic: Webinar reminder'))
  })

  it('is unchanged when the briefing is absent', () => {
    const msg = buildPathBUserMessage(base)
    expect(msg).not.toContain('Project briefing')
    expect(msg.startsWith('Create a social media post')).toBe(true)
  })
})

describe('buildBackgroundDecisionPrompt — project briefing', () => {
  const base = {
    kit,
    topic: 'Webinar reminder',
    description: null,
    goal: 'Signups',
    tone: 'Friendly',
    headline: 'Join us!',
  }

  it('includes the briefing in the user message only when provided', () => {
    const withBriefing = buildBackgroundDecisionPrompt({ ...base, projectBriefing: BRIEFING })
    expect(withBriefing.user).toContain(BRIEFING)
    expect(withBriefing.user.indexOf(BRIEFING)).toBeLessThan(withBriefing.user.indexOf('Brief:'))

    const without = buildBackgroundDecisionPrompt(base)
    expect(without.user).not.toContain('Project briefing')
    expect(without.user.startsWith('Brief:')).toBe(true)
  })
})

describe('buildBriefInput — project briefing param', () => {
  const brief = {
    topic: 'Webinar reminder',
    description: 'One week to go',
    goal: 'Signups',
    tone: 'Friendly',
    channels: ['INSTAGRAM'],
  } as unknown as Brief

  it('threads the briefing through and normalizes null to undefined', () => {
    expect(buildBriefInput(brief, ctxFor(kit, BRIEFING)).projectBriefing).toBe(BRIEFING)
    expect(buildBriefInput(brief, ctxFor(kit, null)).projectBriefing).toBeUndefined()
    expect(buildBriefInput(brief, ctxFor(null)).projectBriefing).toBeUndefined()
  })
})
