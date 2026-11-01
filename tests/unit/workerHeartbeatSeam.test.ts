// 037 AC-14 / D12: the worker-heartbeat test seam keeps its gates (404 in
// production, 404 without MOCK_AI, 403 for a non-admin, 200 for an admin) and
// accepts only the `retention` loop (400 for anything else).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

const h = vi.hoisted(() => ({ requireRole: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }))

vi.mock('@/lib/auth', () => ({ requireRole: h.requireRole }))
vi.mock('@/lib/prisma', () => ({ prisma: { workerHeartbeat: { upsert: h.upsert, deleteMany: h.deleteMany } } }))

const env = process.env as Record<string, string | undefined>
const saved = { NODE_ENV: env.NODE_ENV, MOCK_AI: env.MOCK_AI }

// MOCK_AI is read at import time by testHooks, so each case imports a fresh route.
async function load() {
  vi.resetModules()
  return import('@/app/api/test/worker-heartbeat/route')
}
const post = (route: Awaited<ReturnType<typeof load>>, body: unknown) =>
  route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))
const seed = { loop: 'retention', startedAgoMs: 1000, endedAgoMs: 500 }

beforeEach(() => {
  h.requireRole.mockReset()
  h.upsert.mockReset()
  h.deleteMany.mockReset()
  env.MOCK_AI = 'true'
  env.NODE_ENV = 'test'
})
afterEach(() => {
  env.NODE_ENV = saved.NODE_ENV
  env.MOCK_AI = saved.MOCK_AI
  vi.resetModules()
})

describe('worker-heartbeat seam gates (AC-14)', () => {
  it('is a 404 in production, even with MOCK_AI', async () => {
    env.NODE_ENV = 'production'
    const route = await load()
    expect((await post(route, seed)).status).toBe(404)
    expect(h.requireRole).not.toHaveBeenCalled()
  })

  it('is a 404 without MOCK_AI', async () => {
    env.MOCK_AI = 'false'
    const route = await load()
    expect((await post(route, seed)).status).toBe(404)
    expect(h.requireRole).not.toHaveBeenCalled()
  })

  it('is a 403 for a non-admin and writes nothing', async () => {
    h.requireRole.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const route = await load()
    expect((await post(route, seed)).status).toBe(403)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('is a 200 for an admin and upserts the retention row', async () => {
    h.requireRole.mockResolvedValue({ userId: 'u1' })
    const route = await load()
    expect((await post(route, seed)).status).toBe(200)
    expect(h.upsert).toHaveBeenCalledTimes(1)
    expect(h.upsert.mock.calls[0][0].where).toEqual({ loop: 'retention' })
  })

  it('clear deletes every heartbeat row', async () => {
    h.requireRole.mockResolvedValue({ userId: 'u1' })
    const route = await load()
    expect((await post(route, { clear: true })).status).toBe(200)
    expect(h.deleteMany).toHaveBeenCalledWith({})
  })
})

describe('worker-heartbeat seam loop (D12)', () => {
  it('refuses any loop other than retention with 400 and writes nothing', async () => {
    h.requireRole.mockResolvedValue({ userId: 'u1' })
    const route = await load()
    for (const loop of ['scheduler', 'generation', 'other']) {
      expect((await post(route, { ...seed, loop })).status).toBe(400)
    }
    expect(h.upsert).not.toHaveBeenCalled()
  })
})
