// 037 AC-07, AC-08: ensureCurrentExport. A current draft is not rendered; a
// draft whose exportUrl is missing or differs from the current revision's is
// rendered once, uploaded, and written under a compare-and-set. A failed render
// uploads and writes nothing; a lost compare-and-set deletes the upload.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CompositePlacementError } from '@/lib/composite/render'

const h = vi.hoisted(() => ({
  draft: null as null | Record<string, unknown>,
  revision: null as null | { id: string; exportUrl: string | null },
  render: vi.fn(),
  upload: vi.fn(),
  del: vi.fn(),
  draftUpdateMany: vi.fn(),
  revUpdateMany: vi.fn(),
  revFindFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    draft: { updateMany: h.draftUpdateMany },
    draftRevision: { updateMany: h.revUpdateMany },
  }
  return {
    prisma: {
      draft: { findUnique: async () => h.draft },
      draftRevision: { findFirst: h.revFindFirst },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock('@/lib/drafts/revisions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/revisions')>()
  return { ...actual, renderDraftHtml: h.render }
})
vi.mock('@/lib/storage/minio', () => ({
  uploadObject: h.upload,
  deleteObject: h.del,
  exportKey: (kind: string, id: string) => `exports/${kind}-${id}.png`,
  BUCKET_EXPORTS: 'exports',
}))

const { ensureCurrentExport } = await import('@/lib/drafts/download')

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    status: 'EXPORTED',
    htmlContent: '<html></html>',
    exportUrl: null,
    composition: null,
    currentRevisionNumber: 2,
    pendingAction: null,
    brief: { aspectRatio: 'SQUARE' },
    ...over,
  }
}

beforeEach(() => {
  h.draft = draft()
  h.revision = { id: 'r2', exportUrl: null }
  for (const fn of [h.render, h.upload, h.del, h.draftUpdateMany, h.revUpdateMany, h.revFindFirst]) fn.mockReset()
  h.render.mockResolvedValue({ png: Buffer.from('png'), headlineCheck: null })
  h.draftUpdateMany.mockResolvedValue({ count: 1 })
  h.revUpdateMany.mockResolvedValue({ count: 1 })
  h.del.mockResolvedValue(undefined)
  h.revFindFirst.mockImplementation(async () => h.revision)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ensureCurrentExport (037 AC-07)', () => {
  it('returns the stored key without rendering when the draft and its revision agree', async () => {
    h.draft = draft({ exportUrl: 'exports/a.png' })
    h.revision = { id: 'r2', exportUrl: 'exports/a.png' }
    expect(await ensureCurrentExport('d1')).toEqual({ ok: true, key: 'exports/a.png', rendered: false })
    expect(h.render).not.toHaveBeenCalled()
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('renders once when exportUrl is cleared, writes the key under the compare-and-set, and does not render again', async () => {
    const first = await ensureCurrentExport('d1')
    expect(first).toEqual({ ok: true, key: 'exports/export-d1.png', rendered: true })
    expect(h.render).toHaveBeenCalledTimes(1)
    // 030 FR-04: no headline is checked.
    expect(h.render.mock.calls[0][5]).toBeNull()
    expect(h.upload).toHaveBeenCalledWith(expect.any(Buffer), 'exports', 'exports/export-d1.png', 'image/png')
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', currentRevisionNumber: 2, exportUrl: null, status: 'EXPORTED', pendingAction: null },
      data: { exportUrl: 'exports/export-d1.png' },
    })
    expect((h.draftUpdateMany.mock.calls[0][0] as { data: object }).data).not.toHaveProperty('renderedText')
    // The revision takes the key in the same transaction.
    expect(h.revUpdateMany).toHaveBeenCalledWith({
      where: { id: 'r2' },
      data: { exportUrl: 'exports/export-d1.png' },
    })

    // The state the first call wrote: the next call finds it current.
    h.draft = draft({ exportUrl: 'exports/export-d1.png' })
    h.revision = { id: 'r2', exportUrl: 'exports/export-d1.png' }
    expect(await ensureCurrentExport('d1')).toMatchObject({ ok: true, rendered: false })
    expect(h.render).toHaveBeenCalledTimes(1)
  })

  it('renders when the draft exportUrl differs from the current revision, then both agree', async () => {
    h.draft = draft({ exportUrl: 'exports/old.png' })
    h.revision = { id: 'r2', exportUrl: 'exports/new.png' }
    expect(await ensureCurrentExport('d1')).toMatchObject({ ok: true, rendered: true })
    expect(h.render).toHaveBeenCalledTimes(1)
    expect((h.draftUpdateMany.mock.calls[0][0] as { where: { exportUrl: string } }).where.exportUrl).toBe('exports/old.png')
    // The revision takes the new key in the same transaction, so a second call is current.
    expect(h.revUpdateMany).toHaveBeenCalledWith({
      where: { id: 'r2' },
      data: { exportUrl: 'exports/export-d1.png' },
    })
    h.draft = draft({ exportUrl: 'exports/export-d1.png' })
    h.revision = { id: 'r2', exportUrl: 'exports/export-d1.png' }
    expect(await ensureCurrentExport('d1')).toMatchObject({ ok: true, rendered: false })
    expect(h.render).toHaveBeenCalledTimes(1)
  })

  it('treats a draft with an exportUrl and no revision rows as current', async () => {
    h.draft = draft({ exportUrl: 'exports/a.png', currentRevisionNumber: null })
    h.revision = null
    expect(await ensureCurrentExport('d1')).toMatchObject({ ok: true, rendered: false })
  })

  it('looks for the highest committed revision when the pointer is null', async () => {
    h.draft = draft({ currentRevisionNumber: null })
    await ensureCurrentExport('d1')
    const args = h.revFindFirst.mock.calls[0][0] as { where: Record<string, unknown>; orderBy: unknown }
    expect(args.where).not.toHaveProperty('revisionNumber', 2)
    expect(args.orderBy).toEqual({ revisionNumber: 'desc' })
  })
})

describe('ensureCurrentExport fails closed (037 AC-08)', () => {
  it('a render that throws: 422 render-failed, no upload, no write', async () => {
    h.render.mockRejectedValue(new Error('chromium died'))
    const r = await ensureCurrentExport('d1')
    expect(r).toMatchObject({ ok: false, status: 422, code: 'render-failed' })
    expect(h.upload).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })

  it('a placement failure: 422 composite-not-placed, no upload, no write', async () => {
    h.render.mockRejectedValue(new CompositePlacementError(new Error('gone')))
    const r = await ensureCurrentExport('d1')
    expect(r).toMatchObject({ ok: false, status: 422, code: 'composite-not-placed' })
    expect(h.upload).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })

  it('a lost compare-and-set: 409 changed, the uploaded object is deleted, the revision is untouched', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    const r = await ensureCurrentExport('d1')
    expect(r).toMatchObject({ ok: false, status: 409, code: 'changed' })
    expect(h.upload).toHaveBeenCalledTimes(1)
    expect(h.del).toHaveBeenCalledWith('exports', 'exports/export-d1.png')
    expect(h.revUpdateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['a draft that is not EXPORTED', { status: 'IN_PROGRESS' }],
    ['a draft with no HTML', { htmlContent: null }],
  ])('%s: 409 not-ready, nothing rendered', async (_name, over) => {
    h.draft = draft(over)
    expect(await ensureCurrentExport('d1')).toMatchObject({ ok: false, status: 409, code: 'not-ready' })
    expect(h.render).not.toHaveBeenCalled()
    expect(h.upload).not.toHaveBeenCalled()
  })
})
