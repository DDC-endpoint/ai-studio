// 038 D8, FR-11, AC-12: POST /api/drafts/[id]/apply-project. The edit tier. 409
// busy while an action runs, 409 no-change when the inputs are current, 409
// changed when the compare-and-set loses a race. On success it writes the new
// stamp, recomputes the facts check and emits draft.inputs_applied once.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  draftUpdateMany: vi.fn(),
  canView: vi.fn(() => true),
  canEditPost: vi.fn(() => true),
  postContext: vi.fn(),
  resolveInputsFor: vi.fn(),
  refresh: vi.fn(),
  track: vi.fn(),
  getDraft: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findUnique: h.draftFindUnique, updateMany: h.draftUpdateMany } } }))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1', teamRole: 'EDITOR', isSuperAdmin: false }),
}))
vi.mock('@/lib/authz/visibility', () => ({
  canView: h.canView,
  canEditPost: h.canEditPost,
  NOT_AUTHOR: { error: 'not author', code: 'not-author' },
}))
vi.mock('@/lib/projects/context', () => ({ postContext: h.postContext, resolveInputsFor: h.resolveInputsFor }))
vi.mock('@/lib/factsCheck/refresh', () => ({ refreshFactsCheck: h.refresh }))
vi.mock('@/lib/analytics/track', () => ({ track: h.track }))
vi.mock('@/app/api/drafts/[id]/route', () => ({ GET: h.getDraft }))

const { POST } = await import('@/app/api/drafts/[id]/apply-project/route')

const inputs = (projectId: string | null, briefingId: string | null, kitId: string | null) => ({
  v: 1,
  projectId,
  briefingId,
  briefingVersion: briefingId ? 1 : null,
  kitId,
  kitSource: kitId ? 'team' : null,
})
const recorded = inputs('pB', 'bB', 'k1')
const next = inputs('pA', null, 'k2')

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    status: 'EXPORTED',
    pendingAction: null,
    generationInputs: recorded,
    brief: { userId: 'u1', teamId: 'team1', projectId: 'pA', brandKitId: null },
    ...over,
  }
}
const post = () => POST(new Request('http://test/x', { method: 'POST' }) as never, { params: { id: 'd1' } } as never) as Promise<Response>

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.canView.mockReturnValue(true)
  h.canEditPost.mockReturnValue(true)
  h.draftFindUnique.mockImplementation(async (args: { select?: unknown }) =>
    args.select ? { factsCheck: { v: 1, status: 'flagged', checkedAt: 'now', flagged: [] } } : draft(),
  )
  h.draftUpdateMany.mockResolvedValue({ count: 1 })
  h.postContext.mockResolvedValue({ inputs: recorded })
  h.resolveInputsFor.mockResolvedValue({ inputs: next })
  h.refresh.mockResolvedValue(undefined)
  h.track.mockResolvedValue(undefined)
  h.getDraft.mockResolvedValue(new Response(JSON.stringify({ id: 'd1', inputsCurrent: true }), { status: 200 }))
})

describe('POST /api/drafts/[id]/apply-project (038 FR-11)', () => {
  it('writes the new stamp with a compare-and-set on the old one, recomputes the facts check and emits once', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'd1', inputsCurrent: true })
    const call = h.draftUpdateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'd1', pendingAction: null, status: { not: 'IN_PROGRESS' }, generationInputs: { equals: recorded } })
    expect(call.data).toEqual({ generationInputs: next })
    expect(h.refresh).toHaveBeenCalledWith('d1')
    expect(h.refresh.mock.invocationCallOrder[0]).toBeGreaterThan(h.draftUpdateMany.mock.invocationCallOrder[0])
    expect(h.track).toHaveBeenCalledTimes(1)
    expect(h.track).toHaveBeenCalledWith(
      'draft.inputs_applied',
      expect.objectContaining({
        source: 'web',
        outcome: 'ok',
        payload: { fromProjectId: 'pB', toProjectId: 'pA', kitChanged: true, briefingChanged: true, factsStatus: 'flagged' },
      }),
    )
  })

  it('a null stamp is compared as a database null', async () => {
    h.draftFindUnique.mockImplementation(async (args: { select?: unknown }) => (args.select ? { factsCheck: null } : draft({ generationInputs: null })))
    h.postContext.mockResolvedValue({ inputs: inputs(null, null, 'k1') })
    await post()
    expect(h.draftUpdateMany.mock.calls[0][0].where.generationInputs).toEqual({ equals: Prisma.DbNull })
  })

  it('409 busy while an action runs or the draft is generating, and writes nothing', async () => {
    h.draftFindUnique.mockResolvedValue(draft({ pendingAction: 'REFINE' }))
    let res = await post()
    expect([res.status, (await res.json()).code]).toEqual([409, 'busy'])
    h.draftFindUnique.mockResolvedValue(draft({ status: 'IN_PROGRESS' }))
    res = await post()
    expect([res.status, (await res.json()).code]).toEqual([409, 'busy'])
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('409 no-change when the recorded inputs already match', async () => {
    h.resolveInputsFor.mockResolvedValue({ inputs: recorded })
    const res = await post()
    expect([res.status, (await res.json()).code]).toEqual([409, 'no-change'])
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('409 changed when the compare-and-set loses a race: no facts check, no event', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    const res = await post()
    expect([res.status, (await res.json()).code]).toEqual([409, 'changed'])
    expect(h.refresh).not.toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('403 not-author for a member who is not the author or an admin; 404 for another team', async () => {
    h.canEditPost.mockReturnValue(false)
    let res = await post()
    expect([res.status, (await res.json()).code]).toEqual([403, 'not-author'])
    h.canView.mockReturnValue(false)
    res = await post()
    expect(res.status).toBe(404)
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })
})
