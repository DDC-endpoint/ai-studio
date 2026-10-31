// 037 FR-06, D10: GET /api/library lists EXPORTED drafts only, takes no status
// param, and filters by brandKitId and postStyle. An unknown postStyle is 400.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

const h = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), projectFind: vi.fn(), kitFindMany: vi.fn(), canEdit: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findMany: h.findMany, count: h.count },
    project: { findFirst: h.projectFind },
    brandKit: { findMany: h.kitFindMany },
  },
}))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: unknown, user: unknown) => unknown) =>
    (req: unknown) =>
      handler(req, {}, { userId: 'u1', teamId: 'team1', teamRole: 'ADMIN', isSuperAdmin: false }),
}))
vi.mock('@/lib/authz/visibility', () => ({
  draftVisibilityWhere: () => ({ VISIBILITY: true }),
  canEditPost: h.canEdit,
}))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async (k: string | null) => k }))

const { GET } = await import('@/app/api/library/route')
const { activeStyles } = await import('@/lib/postStyles')

async function call(query = '') {
  return (await GET(new Request(`http://test/api/library${query}`) as never, {} as never)) as Response
}

beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue([])
  h.count.mockReset().mockResolvedValue(0)
  h.projectFind.mockReset().mockResolvedValue({ id: 'proj1' })
  h.kitFindMany.mockReset().mockResolvedValue([])
  h.canEdit.mockReset().mockReturnValue(true)
})

describe('GET /api/library (037)', () => {
  it('always lists EXPORTED drafts and ignores a status param', async () => {
    const res = await call('?status=PUBLISHED')
    expect(res.status).toBe(200)
    const where = h.findMany.mock.calls[0][0].where
    expect(where.status).toBe('EXPORTED')
    expect(where.OR).toBeUndefined()
    expect(where.posts).toBeUndefined()
    expect(JSON.stringify(where)).not.toContain('PUBLISHED')
  })

  it('answers 400 for an unknown postStyle and queries nothing', async () => {
    const res = await call('?postStyle=not-a-style')
    expect(res.status).toBe(400)
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it('filters by a known postStyle', async () => {
    const key = activeStyles()[0].key
    expect((await call(`?postStyle=${key}`)).status).toBe(200)
    expect(h.findMany.mock.calls[0][0].where.AND).toContainEqual({ brief: { postStyle: key } })
  })

  it('filters by kit: the stamp kit, else the brief kit when the draft has no stamp (038 FR-13)', async () => {
    await call('?brandKitId=kit1')
    expect(h.findMany.mock.calls[0][0].where.AND).toContainEqual({
      OR: [
        { generationInputs: { path: ['kitId'], equals: 'kit1' } },
        { generationInputs: { equals: Prisma.DbNull }, brief: { brandKitId: 'kit1' } },
      ],
    })
  })

  it('keeps the D6 visibility clause ANDed with the filters', async () => {
    await call(`?brandKitId=kit1&postStyle=${activeStyles()[0].key}&search=x`)
    const and = h.findMany.mock.calls[0][0].where.AND
    expect(and).toContainEqual({ VISIBILITY: true })
    expect(and).toHaveLength(4)
    expect(h.count.mock.calls[0][0].where.AND).toEqual(and)
  })

  it('038: filters by a project of the caller team', async () => {
    expect((await call('?projectId=proj1')).status).toBe(200)
    expect(h.projectFind.mock.calls[0][0].where).toEqual({ id: 'proj1', teamId: 'team1', isDeleted: false })
    expect(h.findMany.mock.calls[0][0].where.AND).toContainEqual({ brief: { projectId: 'proj1' } })
  })

  it('038: projectId=none lists the posts with no project and reads no project', async () => {
    expect((await call('?projectId=none')).status).toBe(200)
    expect(h.projectFind).not.toHaveBeenCalled()
    expect(h.findMany.mock.calls[0][0].where.AND).toContainEqual({ brief: { projectId: null } })
  })

  it('038: a foreign, deleted or unknown project is 404 PROJECT_NOT_FOUND and queries no drafts', async () => {
    h.projectFind.mockResolvedValue(null)
    const res = await call('?projectId=other-team-project')
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('PROJECT_NOT_FOUND')
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it('adds no kit or style clause without the params', async () => {
    await call()
    expect(h.findMany.mock.calls[0][0].where.AND).toEqual([{ VISIBILITY: true }])
  })

  it('returns the kit name (the stamp kit first, then the brief kit for no stamp), the project and canEdit', async () => {
    const stamp = (kitId: string | null) => ({ v: 1, projectId: 'proj1', briefingId: null, briefingVersion: null, kitId, kitSource: 'project' })
    const base = { status: 'EXPORTED', exportUrl: 'k', createdAt: new Date(), teamId: 'team1', headline: null, renderedText: null }
    const brief = { topic: 'T', userId: 'u1', aspectRatio: 'SQUARE', brandKitId: 'briefKit' }
    h.kitFindMany.mockResolvedValue([
      { id: 'stampKit', name: 'Stamped' },
      { id: 'briefKit', name: 'Brief kit' },
    ])
    h.canEdit.mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(false)
    h.findMany.mockResolvedValue([
      { ...base, id: 'a', generationInputs: stamp('stampKit'), brief: { ...brief, postStyle: 'launch', project: { id: 'proj1', name: 'P1' } } },
      { ...base, id: 'b', generationInputs: null, brief: { ...brief, postStyle: null, project: null } },
      { ...base, id: 'c', generationInputs: stamp(null), brief: { ...brief, postStyle: null, project: null } },
    ])
    const body = (await (await call()).json()) as {
      drafts: Array<{ brief: Record<string, unknown>; project: unknown; canEdit: boolean }>
    }
    expect(h.kitFindMany.mock.calls[0][0].where).toEqual({ id: { in: ['stampKit', 'briefKit'] }, teamId: 'team1' })
    expect(body.drafts[0].brief).toMatchObject({ brandKitName: 'Stamped', postStyle: 'launch' })
    expect(body.drafts[0].project).toEqual({ id: 'proj1', name: 'P1' })
    expect(body.drafts[1].brief).toMatchObject({ brandKitName: 'Brief kit', postStyle: null })
    // A stamp with no kit is not the brief's kit.
    expect(body.drafts[2].brief).toMatchObject({ brandKitName: null })
    expect(body.drafts.map((d) => d.canEdit)).toEqual([true, false, false])
    expect(JSON.stringify(body)).not.toContain('generationInputs')
  })
})
