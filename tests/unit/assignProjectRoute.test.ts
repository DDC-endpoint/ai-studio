// 038 D8, D22, FR-10, AC-13: PUT /api/drafts/[id]/project. The view tier: any
// member of the post's team may assign, move or unassign. It writes
// Brief.projectId only, emits draft.project_changed once per change and nothing
// for a no-op, and re-checks the target is live inside the write.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  projectFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  briefFindUnique: vi.fn(),
  briefUpdate: vi.fn(),
  draftUpdate: vi.fn(),
  canView: vi.fn(() => true),
  track: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    $queryRaw: h.queryRaw,
    brief: { findUnique: h.briefFindUnique, update: h.briefUpdate },
    draft: { update: h.draftUpdate },
  }
  return {
    prisma: {
      draft: { findUnique: h.draftFindUnique },
      project: { findFirst: h.projectFindFirst },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1', teamRole: 'EDITOR', isSuperAdmin: false })
  const parseBody = async (req: Request) => {
    const raw = await req.json()
    const ok = raw && typeof raw === 'object' && 'projectId' in raw && (raw.projectId === null || typeof raw.projectId === 'string')
    return ok ? { data: raw } : { response: new Response(JSON.stringify({ error: 'bad' }), { status: 400 }) }
  }
  return { parseBody, withTeamAuth: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canView: h.canView }))
vi.mock('@/lib/analytics/track', () => ({ track: h.track }))

const { PUT } = await import('@/app/api/drafts/[id]/project/route')

const put = (body: unknown) =>
  PUT(new Request('http://test/x', { method: 'PUT', body: JSON.stringify(body) }) as never, { params: { id: 'd1' } } as never) as Promise<Response>

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.canView.mockReturnValue(true)
  h.draftFindUnique.mockResolvedValue({ id: 'd1', teamId: 'team1', briefId: 'b1' })
  h.projectFindFirst.mockResolvedValue({ id: 'pA', name: 'Alpha' })
  h.queryRaw.mockResolvedValue([{ id: 'pA' }])
  h.briefFindUnique.mockResolvedValue({ projectId: null })
  h.briefUpdate.mockResolvedValue({})
  h.track.mockResolvedValue(undefined)
})

describe('PUT /api/drafts/[id]/project (038 FR-10)', () => {
  it('assigns: writes Brief.projectId only and emits one assign event', async () => {
    const res = await put({ projectId: 'pA' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ project: { id: 'pA', name: 'Alpha' } })
    expect(h.briefUpdate).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { projectId: 'pA' } })
    expect(h.draftUpdate).not.toHaveBeenCalled()
    expect(h.track).toHaveBeenCalledTimes(1)
    expect(h.track).toHaveBeenCalledWith(
      'draft.project_changed',
      expect.objectContaining({ source: 'web', teamId: 'team1', draftId: 'd1', payload: { change: 'assign', fromProjectId: null, toProjectId: 'pA' } }),
    )
  })

  it('moves and unassigns, naming each change', async () => {
    h.briefFindUnique.mockResolvedValue({ projectId: 'pB' })
    await put({ projectId: 'pA' })
    expect(h.track.mock.calls[0][1].payload).toEqual({ change: 'move', fromProjectId: 'pB', toProjectId: 'pA' })
    h.track.mockClear()
    const res = await put({ projectId: null })
    expect(await res.json()).toEqual({ project: null })
    expect(h.track.mock.calls[0][1].payload).toEqual({ change: 'unassign', fromProjectId: 'pB', toProjectId: null })
  })

  it('a repeat of the current assignment is 200 and writes and emits nothing', async () => {
    h.briefFindUnique.mockResolvedValue({ projectId: 'pA' })
    expect((await put({ projectId: 'pA' })).status).toBe(200)
    h.briefFindUnique.mockResolvedValue({ projectId: null })
    expect((await put({ projectId: null })).status).toBe(200)
    expect(h.briefUpdate).not.toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a foreign, deleted or unknown project is 404 PROJECT_NOT_FOUND and writes nothing', async () => {
    h.projectFindFirst.mockResolvedValue(null)
    const res = await put({ projectId: 'other' })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('PROJECT_NOT_FOUND')
    expect(h.projectFindFirst.mock.calls[0][0].where).toEqual({ id: 'other', teamId: 'team1', isDeleted: false })
    expect(h.briefUpdate).not.toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a project deleted between the check and the write is 404 and leaves the post unassigned', async () => {
    h.queryRaw.mockResolvedValue([])
    const res = await put({ projectId: 'pA' })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('PROJECT_NOT_FOUND')
    expect(h.briefUpdate).not.toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a draft the caller cannot view is 404 and reads no project', async () => {
    h.canView.mockReturnValue(false)
    expect((await put({ projectId: 'pA' })).status).toBe(404)
    expect(h.projectFindFirst).not.toHaveBeenCalled()
    h.draftFindUnique.mockResolvedValue(null)
    h.canView.mockReturnValue(true)
    expect((await put({ projectId: null })).status).toBe(404)
  })

  it('a malformed body is 400', async () => {
    expect((await put({})).status).toBe(400)
  })
})
