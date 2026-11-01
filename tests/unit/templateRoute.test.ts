// 040 FR-03 / AC-01: GET /api/templates/[id]. Prisma and auth are faked; the real route
// and wrapper run. Isolation lives in the `where` clause (the fake cannot filter), so the
// tests assert the clause and that a null result is the same 404.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  user: vi.fn(),
  team: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { brandKitTemplate: { findFirst: h.findFirst } } }))
vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { getCurrentUser: h.user, hasRole: roles.hasRole }
})
vi.mock('@/lib/authz/teamContext', () => ({
  ACTIVE_TEAM_COOKIE: 'bistec-active-team',
  resolveActiveTeam: h.team,
}))

import { GET } from '@/app/api/templates/[id]/route'

const call = (id: string) =>
  GET(new NextRequest(`http://localhost/api/templates/${id}`), {
    params: Promise.resolve({ id }),
  } as never)

const ROW = {
  id: 't1',
  name: 'Launch',
  aspectRatio: 'SQUARE',
  htmlTemplate: '<div>hi</div>',
}

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.user.mockResolvedValue({ userId: 'u1', role: 'editor' })
  h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'EDITOR' })
  h.findFirst.mockResolvedValue(ROW)
})

describe('GET /api/templates/[id]', () => {
  it('401 without a session', async () => {
    h.user.mockResolvedValue(null)
    expect((await call('t1')).status).toBe(401)
    expect(h.findFirst).not.toHaveBeenCalled()
  })

  it('returns exactly the four fields for the team\'s own template', async () => {
    const res = await call('t1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(ROW)
  })

  it('scopes the lookup by id, the caller\'s team and a non-deleted kit', async () => {
    await call('t1')
    expect(h.findFirst).toHaveBeenCalledTimes(1)
    expect(h.findFirst.mock.calls[0][0].where).toEqual({
      id: 't1',
      brandKit: { isDeleted: false, teamId: 'team1' },
    })
  })

  it('404 with one body when nothing matches (unknown id, other team, deleted kit)', async () => {
    h.findFirst.mockResolvedValue(null)
    const res = await call('nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})
