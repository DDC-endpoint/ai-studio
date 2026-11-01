// 039 T3 (D14, D15, D16): the delete and undo routes. Each is edit tier: the
// body or query shape is checked first (400), then canView (404), then
// canEditPost (403 NOT_AUTHOR), and only then does the store write. The store,
// the draft loader and the auth wrapper are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  deleteCaption: vi.fn(),
  undoCaption: vi.fn(),
  loadDraft: vi.fn(),
  canView: vi.fn(),
  canEditPost: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findUnique: h.draftFindUnique } } }))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => {
    try {
      return { data: await req.json() }
    } catch {
      return { response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    }
  }
  return { parseBody, withTeamAuth: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({
  canView: h.canView,
  canEditPost: h.canEditPost,
  NOT_AUTHOR: { error: 'Only the author or a team admin can do this', code: 'not-author' },
}))
vi.mock('@/lib/captions/store', () => ({ deleteCaption: h.deleteCaption, undoCaption: h.undoCaption }))
vi.mock('@/lib/drafts/detail', () => ({ loadDraft: h.loadDraft }))

const { DELETE: remove } = await import('@/app/api/drafts/[id]/captions/route')
const { POST: undo } = await import('@/app/api/drafts/[id]/captions/undo/route')

const ctx = { params: { id: 'd1' } }
const del = (query = '?channel=INSTAGRAM') =>
  remove(new Request(`http://test/x${query}`, { method: 'DELETE' }) as never, ctx as never)
const post = (body: unknown) =>
  undo(
    new Request('http://test/x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) as never,
    ctx as never,
  )

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.draftFindUnique.mockResolvedValue({ teamId: 'team1', brief: { userId: 'u1' } })
  h.canView.mockReturnValue(true)
  h.canEditPost.mockReturnValue(true)
  h.deleteCaption.mockResolvedValue('deleted')
  h.undoCaption.mockResolvedValue('undone')
  h.loadDraft.mockResolvedValue({ data: { id: 'd1', captions: [] } })
})

describe('DELETE /api/drafts/[id]/captions (039 D14)', () => {
  it('deletes the named curated caption and answers the refreshed draft', async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'd1', captions: [], canEdit: true })
    expect(h.deleteCaption).toHaveBeenCalledWith('d1', 'INSTAGRAM')
  })

  it.each([['?channel=GENERAL'], ['?kind=GENERAL'], ['?kind=GENERAL&channel=INSTAGRAM']])(
    '%s is 400 general-not-deletable and touches nothing',
    async (query) => {
      const res = await del(query)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('general-not-deletable')
      expect(h.draftFindUnique).not.toHaveBeenCalled()
      expect(h.deleteCaption).not.toHaveBeenCalled()
    },
  )

  it.each([[''], ['?channel='], ['?channel=WHATSAPP'], ['?channel=THREADS']])('%s is 400 with the channel message', async (query) => {
    const res = await del(query)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/^channel must be /)
    expect(h.deleteCaption).not.toHaveBeenCalled()
  })

  it('is 404 for an unknown draft or one outside the caller team, before anything is written', async () => {
    h.draftFindUnique.mockResolvedValue(null)
    expect((await del()).status).toBe(404)
    h.draftFindUnique.mockResolvedValue({ teamId: 'other', brief: { userId: 'u2' } })
    h.canView.mockReturnValue(false)
    expect((await del()).status).toBe(404)
    expect(h.canEditPost).not.toHaveBeenCalled()
    expect(h.deleteCaption).not.toHaveBeenCalled()
  })

  it('is 403 not-author for a member who may not edit, before anything is written', async () => {
    h.canEditPost.mockReturnValue(false)
    const res = await del()
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('not-author')
    expect(h.deleteCaption).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', 404, 'caption-not-found'],
    ['pending', 409, undefined],
  ])('answers the store result %s as %i', async (result, status, code) => {
    h.deleteCaption.mockResolvedValue(result)
    const res = await del()
    expect(res.status).toBe(status)
    expect((await res.json()).code).toBe(code)
  })

  it('a removed row (no text) is a success too', async () => {
    h.deleteCaption.mockResolvedValue('removed')
    expect((await del('?channel=LINKEDIN')).status).toBe(200)
  })
})

describe('POST /api/drafts/[id]/captions/undo (039 D15)', () => {
  it('undoes the general caption and a curated one, and answers the refreshed draft', async () => {
    expect((await post({ kind: 'GENERAL' })).status).toBe(200)
    expect(h.undoCaption).toHaveBeenLastCalledWith('d1', { kind: 'GENERAL' })
    const res = await post({ channel: 'LINKEDIN' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'd1', captions: [], canEdit: true })
    expect(h.undoCaption).toHaveBeenLastCalledWith('d1', { kind: 'CURATED', channel: 'LINKEDIN' })
  })

  it.each([['{}'], ['{"kind":"CURATED"}'], ['{"channel":"WHATSAPP"}'], ['{"kind":"GENERAL","channel":"INSTAGRAM"}'], ['{"x":1}'], ['not json']])(
    'body %s is 400 and touches nothing',
    async (body) => {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(h.draftFindUnique).not.toHaveBeenCalled()
      expect(h.undoCaption).not.toHaveBeenCalled()
    },
  )

  it('is 404 outside the caller team and 403 not-author for a member who may not edit, before the write', async () => {
    h.canView.mockReturnValue(false)
    expect((await post({ kind: 'GENERAL' })).status).toBe(404)
    h.canView.mockReturnValue(true)
    h.canEditPost.mockReturnValue(false)
    const res = await post({ kind: 'GENERAL' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('not-author')
    expect(h.undoCaption).not.toHaveBeenCalled()
  })

  it.each([
    ['nothing', 409, 'nothing-to-undo'],
    ['pending', 409, undefined],
    ['changed', 409, 'changed'],
    ['missing', 404, 'caption-not-found'],
  ])('answers the store result %s as %i', async (result, status, code) => {
    h.undoCaption.mockResolvedValue(result)
    const res = await post({ kind: 'GENERAL' })
    expect(res.status).toBe(status)
    expect((await res.json()).code).toBe(code)
  })
})
