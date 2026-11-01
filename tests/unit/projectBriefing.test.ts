// 038 FR-06: the project briefing routes. The version is allocated inside the
// project, the previous active row is deactivated, and a project outside the
// caller's team is the same 404 as an unknown one.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  projectFind: vi.fn(),
  latest: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  findBriefing: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = { projectBriefing: { findFirst: h.latest, updateMany: h.updateMany, create: h.create } }
  return {
    prisma: {
      project: { findFirst: h.projectFind },
      projectBriefing: { findMany: h.list, findFirst: h.findBriefing, updateMany: h.updateMany, update: h.update },
      $transaction: async (arg: unknown) =>
        typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
    },
  }
})
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn(), hasRole: () => true }))
vi.mock('@/lib/authz/teamContext', () => ({ ACTIVE_TEAM_COOKIE: 'c', resolveActiveTeam: vi.fn() }))
vi.mock('@/lib/api/handler', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/handler')>()
  const wrap =
    (handler: (req: unknown, ctx: unknown, user: unknown) => unknown) =>
    (req: unknown, ctx?: { params?: unknown }) =>
      handler(req, { params: ctx?.params ?? {} }, { userId: 'u1', teamId: 'team1', teamRole: 'ADMIN', isSuperAdmin: false })
  return { ...real, withTeamAuth: wrap, withTeamAdmin: wrap }
})

const { GET, POST } = await import('@/app/api/projects/[id]/briefing/route')
const { POST: activate } = await import('@/app/api/projects/[id]/briefing/[vid]/activate/route')

type Handler = (r: NextRequest, c: unknown) => Promise<Response>
const req = (body?: unknown) =>
  new NextRequest('http://test/api', {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  })

beforeEach(() => {
  h.projectFind.mockReset().mockResolvedValue({ id: 'p1', teamId: 'team1' })
  h.latest.mockReset().mockResolvedValue({ version: 2 })
  h.updateMany.mockReset().mockResolvedValue({ count: 1 })
  h.create.mockReset().mockImplementation(async ({ data }: { data: object }) => ({ id: 'b3', ...data }))
  h.list.mockReset().mockResolvedValue([])
  h.findBriefing.mockReset().mockResolvedValue({ id: 'b1' })
  h.update.mockReset().mockResolvedValue({})
})

describe('project briefing routes (038 FR-06)', () => {
  it('POST allocates the next version, deactivates the active one and creates the new active row', async () => {
    const res = await (POST as unknown as Handler)(req({ content: 'New briefing' }), { params: { id: 'p1' } })
    expect(res.status).toBe(201)
    expect(h.updateMany).toHaveBeenCalledWith({ where: { projectId: 'p1', isActive: true }, data: { isActive: false } })
    expect(h.create.mock.calls[0][0].data).toMatchObject({
      projectId: 'p1',
      content: 'New briefing',
      version: 3,
      isActive: true,
      createdBy: 'u1',
    })
  })

  it('GET scopes the project lookup by team and answers 404 when it finds none', async () => {
    h.projectFind.mockResolvedValue(null)
    expect((await (GET as unknown as Handler)(req(), { params: { id: 'p1' } })).status).toBe(404)
    expect(h.projectFind.mock.calls[0][0].where).toMatchObject({ id: 'p1', teamId: 'team1', isDeleted: false })
    expect(h.list).not.toHaveBeenCalled()
  })

  it('writes answer 404 for an unknown or foreign-team project, and touch nothing', async () => {
    for (const row of [null, { id: 'p1', teamId: 'team2' }]) {
      h.projectFind.mockResolvedValue(row)
      expect((await (POST as unknown as Handler)(req({ content: 'x' }), { params: { id: 'p1' } })).status).toBe(404)
      expect(
        (await (activate as unknown as Handler)(req({}), { params: { id: 'p1', vid: 'b1' } })).status,
      ).toBe(404)
    }
    expect(h.create).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  it('activate re-activates only a version of this project', async () => {
    h.findBriefing.mockResolvedValue(null)
    const res = await (activate as unknown as Handler)(req({}), { params: { id: 'p1', vid: 'other' } })
    expect(res.status).toBe(404)
    expect(h.findBriefing.mock.calls[0][0].where).toEqual({ id: 'other', projectId: 'p1' })
    expect(h.update).not.toHaveBeenCalled()
  })
})
