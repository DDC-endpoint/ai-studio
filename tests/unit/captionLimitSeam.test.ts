// 039 D16, FR-21: the caption-limit test seam keeps its gates (404 in production,
// 404 without MOCK_AI, 403 for a non-admin, 200 for an admin) and sets or clears
// the override that admitCaptionAction reads.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

const h = vi.hoisted(() => ({ requireRole: vi.fn() }))

vi.mock('@/lib/auth', () => ({ requireRole: h.requireRole }))

const env = process.env as Record<string, string | undefined>
const saved = { NODE_ENV: env.NODE_ENV, MOCK_AI: env.MOCK_AI }

// MOCK_AI is read at import time by testHooks, so each case imports fresh modules.
async function load() {
  vi.resetModules()
  const route = await import('@/app/api/test/caption-limit/route')
  const limits = await import('@/lib/captions/limits')
  return { route, limits }
}
const post = (route: Awaited<ReturnType<typeof load>>['route'], body: unknown) =>
  route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  h.requireRole.mockReset()
  env.MOCK_AI = 'true'
  env.NODE_ENV = 'test'
})
afterEach(() => {
  env.NODE_ENV = saved.NODE_ENV
  env.MOCK_AI = saved.MOCK_AI
  vi.resetModules()
})

describe('caption-limit seam gates', () => {
  it('is a 404 in production, even with MOCK_AI', async () => {
    env.NODE_ENV = 'production'
    const { route } = await load()
    expect((await post(route, { limit: 1 })).status).toBe(404)
    expect(h.requireRole).not.toHaveBeenCalled()
  })

  it('is a 404 without MOCK_AI, and sets nothing', async () => {
    env.MOCK_AI = 'false'
    const { route, limits } = await load()
    expect((await post(route, { limit: 1 })).status).toBe(404)
    expect(h.requireRole).not.toHaveBeenCalled()
    // Without MOCK_AI the real limit applies, so 30 calls pass and the 31st does not.
    for (let i = 0; i < 30; i++) expect(limits.admitCaptionAction('u', i).ok).toBe(true)
    expect(limits.admitCaptionAction('u', 31).ok).toBe(false)
  })

  it('is a 403 for a non-admin and sets nothing', async () => {
    h.requireRole.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const { route, limits } = await load()
    expect((await post(route, { limit: 1 })).status).toBe(403)
    for (let i = 0; i < 5; i++) expect(limits.admitCaptionAction('u', i).ok).toBe(true)
  })
})

describe('caption-limit seam body', () => {
  it('an admin sets the limit, and null clears it', async () => {
    h.requireRole.mockResolvedValue({ userId: 'u1' })
    const { route, limits } = await load()
    expect((await post(route, { limit: 1 })).status).toBe(200)
    expect(limits.admitCaptionAction('u', 0).ok).toBe(true)
    expect(limits.admitCaptionAction('u', 1).ok).toBe(false)
    expect((await post(route, { limit: null })).status).toBe(200)
    expect(limits.admitCaptionAction('u', 2).ok).toBe(true)
  })

  it.each([[{}], [{ limit: 0 }], [{ limit: 1.5 }], [{ limit: '2' }]])('refuses %j with 400', async (body) => {
    h.requireRole.mockResolvedValue({ userId: 'u1' })
    const { route } = await load()
    expect((await post(route, body)).status).toBe(400)
  })

  it('refuses malformed JSON with 400', async () => {
    h.requireRole.mockResolvedValue({ userId: 'u1' })
    const { route } = await load()
    expect((await route.POST(new Request('http://x', { method: 'POST', body: 'not json' }))).status).toBe(400)
  })
})
