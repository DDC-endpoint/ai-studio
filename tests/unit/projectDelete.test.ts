// 038 D9, AC-14: deleting a project soft-deletes it and unassigns its posts in
// one transaction, and never deletes a briefing, a document or an object.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  briefUpdateMany: vi.fn(),
  projectUpdate: vi.fn(),
  tx: vi.fn(),
  deleteObject: vi.fn(),
  briefingDelete: vi.fn(),
  briefingDeleteMany: vi.fn(),
  docDelete: vi.fn(),
  docDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = { brief: { updateMany: h.briefUpdateMany }, project: { update: h.projectUpdate } }
  return {
    prisma: {
      project: { findUnique: h.findUnique },
      $transaction: async (fn: (t: typeof tx) => unknown) => {
        h.tx()
        return fn(tx)
      },
      projectBriefing: { delete: h.briefingDelete, deleteMany: h.briefingDeleteMany },
      projectDocument: { delete: h.docDelete, deleteMany: h.docDeleteMany },
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
vi.mock('@/lib/storage/minio', () => ({ BUCKET_DOCS: 'docs', deleteObject: h.deleteObject }))

const { DELETE } = await import('@/app/api/projects/[id]/route')

type Handler = (req: NextRequest, ctx: unknown) => Promise<Response>
const del = (id = 'p1') =>
  (DELETE as unknown as Handler)(new NextRequest('http://test/api/projects/' + id, { method: 'DELETE' }), {
    params: { id },
  })

beforeEach(() => {
  h.findUnique.mockReset().mockResolvedValue({ id: 'p1', teamId: 'team1', isDeleted: false })
  h.briefUpdateMany.mockReset().mockResolvedValue({ count: 2 })
  h.projectUpdate.mockReset().mockResolvedValue({})
  h.tx.mockReset()
  h.deleteObject.mockReset()
  h.briefingDelete.mockReset()
  h.briefingDeleteMany.mockReset()
  h.docDelete.mockReset()
  h.docDeleteMany.mockReset()
})

describe('DELETE /api/projects/[id] (038 D9)', () => {
  it('soft-deletes and unassigns in one transaction and returns { unassigned }', async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ unassigned: 2 })
    expect(h.tx).toHaveBeenCalledTimes(1)
    expect(h.briefUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', teamId: 'team1' },
      data: { projectId: null },
    })
    const update = h.projectUpdate.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'p1' })
    expect(update.data.isDeleted).toBe(true)
    expect(update.data.deletedAt).toBeInstanceOf(Date)
  })

  it('never deletes a briefing, a document or a stored object', async () => {
    await del()
    expect(h.briefingDelete).not.toHaveBeenCalled()
    expect(h.briefingDeleteMany).not.toHaveBeenCalled()
    expect(h.docDelete).not.toHaveBeenCalled()
    expect(h.docDeleteMany).not.toHaveBeenCalled()
    expect(h.deleteObject).not.toHaveBeenCalled()
  })

  it('is 404 for a foreign-team, deleted or unknown project and changes nothing', async () => {
    for (const row of [
      null,
      { id: 'p1', teamId: 'team2', isDeleted: false },
      { id: 'p1', teamId: 'team1', isDeleted: true },
    ]) {
      h.findUnique.mockResolvedValue(row)
      const res = await del()
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' })
    }
    expect(h.tx).not.toHaveBeenCalled()
  })
})
