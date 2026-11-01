// 039 D16, AC-13: the per-user caption action limit, and the window limiter it
// is built on (analyticsRateLimit.test.ts covers the events instance, unchanged).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createWindowLimiter } from '@/lib/api/windowLimiter'

describe('createWindowLimiter', () => {
  it('admits `limit` calls, refuses the next inside the window, and admits again after it', () => {
    const l = createWindowLimiter(3, 1_000)
    for (let i = 0; i < 3; i++) expect(l.allow('u', 100 + i)).toBe(true)
    expect(l.allow('u', 500)).toBe(false)
    expect(l.allow('u', 1_099)).toBe(false)
    expect(l.allow('u', 1_100)).toBe(true)
  })

  it('keeps one window per key', () => {
    const l = createWindowLimiter(1, 1_000)
    expect(l.allow('a', 0)).toBe(true)
    expect(l.allow('a', 1)).toBe(false)
    expect(l.allow('b', 1)).toBe(true)
  })

  it('does not record a refused call, so refusals never extend the lockout', () => {
    const l = createWindowLimiter(1, 1_000)
    l.allow('u', 0)
    for (let i = 0; i < 50; i++) expect(l.allow('u', 999)).toBe(false)
    expect(l.allow('u', 1_000)).toBe(true)
  })

  it('retryAfterMs is the time until the oldest counted call ages out, and 0 with room', () => {
    const l = createWindowLimiter(2, 1_000)
    expect(l.retryAfterMs('u', 0)).toBe(0)
    l.allow('u', 100)
    l.allow('u', 400)
    expect(l.retryAfterMs('u', 500)).toBe(600)
    expect(l.retryAfterMs('u', 1_100)).toBe(0)
  })

  it('reset forgets every window', () => {
    const l = createWindowLimiter(1, 1_000)
    l.allow('u', 0)
    l.reset()
    expect(l.allow('u', 1)).toBe(true)
  })
})

describe('the caption action limit (production behaviour)', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.MOCK_AI
  })

  it('is 30 per 600 000 ms; the 31st inside the window is refused and the window passes', async () => {
    const { CAPTION_ACTIONS_PER_WINDOW, CAPTION_WINDOW_MS, admitCaptionAction, captionLimiter } = await import(
      '@/lib/captions/limits'
    )
    captionLimiter.reset()
    expect(CAPTION_ACTIONS_PER_WINDOW).toBe(30)
    expect(CAPTION_WINDOW_MS).toBe(600_000)
    for (let i = 0; i < 30; i++) expect(admitCaptionAction('u1', 1_000 + i).ok).toBe(true)
    const refused = admitCaptionAction('u1', 2_000)
    expect(refused.ok).toBe(false)
    expect(refused.ok === false && refused.retryAfterSec).toBeGreaterThanOrEqual(1)
    expect(admitCaptionAction('u1', 1_000 + CAPTION_WINDOW_MS).ok).toBe(true)
  })

  it('two users do not share a window', async () => {
    const { admitCaptionAction, captionLimiter } = await import('@/lib/captions/limits')
    captionLimiter.reset()
    for (let i = 0; i < 30; i++) admitCaptionAction('u1', 0)
    expect(admitCaptionAction('u1', 1).ok).toBe(false)
    expect(admitCaptionAction('u2', 1).ok).toBe(true)
  })
})

describe('the MOCK_AI seam override', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.MOCK_AI = 'true'
  })
  afterEach(() => {
    delete process.env.MOCK_AI
  })

  it('applies no limit without an override, and the override count with one; null clears it', async () => {
    const { admitCaptionAction, setCaptionLimitOverride } = await import('@/lib/captions/limits')
    for (let i = 0; i < 100; i++) expect(admitCaptionAction('u1', i).ok).toBe(true)
    setCaptionLimitOverride(2)
    expect(admitCaptionAction('u1', 0).ok).toBe(true)
    expect(admitCaptionAction('u1', 1).ok).toBe(true)
    expect(admitCaptionAction('u1', 2).ok).toBe(false)
    setCaptionLimitOverride(null)
    expect(admitCaptionAction('u1', 3).ok).toBe(true)
  })

  it('setting the override again starts a clean window', async () => {
    const { admitCaptionAction, setCaptionLimitOverride } = await import('@/lib/captions/limits')
    setCaptionLimitOverride(1)
    admitCaptionAction('u1', 0)
    expect(admitCaptionAction('u1', 1).ok).toBe(false)
    setCaptionLimitOverride(1)
    expect(admitCaptionAction('u1', 2).ok).toBe(true)
    setCaptionLimitOverride(null)
  })
})
