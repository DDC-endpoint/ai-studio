// 038 D15, AC-25: at most 200 live projects per team (409 project-limit; a
// soft-deleted project does not count) and at most 5 documents per project.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  count: vi.fn(),
  create: vi.fn(),
  projectFind: vi.fn(),
  docCount: vi.fn(),
  docCreate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { count: h.count, create: h.create, findFirst: h.projectFind },
    projectDocument: { count: h.docCount, create: h.docCreate },
    brandKit: { findFirst: vi.fn() },
  },
}))
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
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_DOCS: 'docs',
  uploadObject: vi.fn(),
  validateUpload: () => null,
}))

const { MAX_PROJECTS_PER_TEAM } = await import('@/lib/projects/limits')
const { MAX_DOCS_PER_PROJECT } = await import('@/lib/projects/documents')
const { POST: createProject } = await import('@/app/api/projects/route')
const { POST: uploadDoc } = await import('@/app/api/projects/[id]/documents/route')

type Handler = (req: NextRequest, ctx?: unknown) => Promise<Response>
const json = (body: unknown) =>
  new NextRequest('http://test/api/projects', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  h.count.mockReset().mockResolvedValue(0)
  h.create
    .mockReset()
    .mockImplementation(async ({ data }: { data: object }) => ({ id: 'p1', ...data, _count: { briefs: 0 } }))
  h.projectFind.mockReset().mockResolvedValue({ id: 'p1', teamId: 'team1' })
  h.docCount.mockReset().mockResolvedValue(0)
  h.docCreate.mockReset()
})

describe('project cap (D15)', () => {
  it('the cap is 200 and a create under it succeeds', async () => {
    expect(MAX_PROJECTS_PER_TEAM).toBe(200)
    h.count.mockResolvedValue(199)
    const res = await (createProject as unknown as Handler)(json({ name: 'P' }))
    expect(res.status).toBe(201)
  })

  it('a create with 200 live projects is 409 project-limit and writes nothing', async () => {
    h.count.mockResolvedValue(200)
    const res = await (createProject as unknown as Handler)(json({ name: 'P' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('project-limit')
    expect(h.create).not.toHaveBeenCalled()
  })

  it('counts live projects of the caller team only (a soft-deleted one does not count)', async () => {
    await (createProject as unknown as Handler)(json({ name: 'P' }))
    expect(h.count.mock.calls[0][0].where).toEqual({ teamId: 'team1', isDeleted: false })
  })
})

describe('document cap (D15)', () => {
  it('a sixth document is 400', async () => {
    expect(MAX_DOCS_PER_PROJECT).toBe(5)
    h.docCount.mockResolvedValue(5)
    const fd = new FormData()
    fd.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    const req = new NextRequest('http://test/api/projects/p1/documents', { method: 'POST', body: fd })
    const res = await (uploadDoc as unknown as Handler)(req, { params: { id: 'p1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('at most 5 documents')
    expect(h.docCreate).not.toHaveBeenCalled()
  })
})
