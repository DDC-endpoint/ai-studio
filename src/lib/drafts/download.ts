// Download (037 D4, FR-04): make sure the draft has a PNG that matches its
// current design, and hand back its object key. "Current" means the draft's
// exportUrl is set and equals the current committed revision's exportUrl; if
// not, the stored HTML is rendered once, uploaded, and written under a
// compare-and-set so a concurrent change never loses to a stale render.
// Returns a tagged result; the route maps it to a response and emits the event.
import { prisma } from '@/lib/prisma'
import { dimensionsFor } from '@/lib/aspectRatio'
import { CompositePlacementError } from '@/lib/composite/render'
import { committedRevisionWhere, draftCompositionStamp, renderDraftHtml } from '@/lib/drafts/revisions'
import type { DownloadFailure } from '@/lib/drafts/downloadVocab'
import { uploadObject, deleteObject, exportKey, BUCKET_EXPORTS } from '@/lib/storage/minio'


export type EnsureExportResult =
  | { ok: true; key: string; /** Whether a render ran for this call. */ rendered: boolean }
  | { ok: false; status: 409 | 422; code: DownloadFailure; message: string }

const fail = (status: 409 | 422, code: DownloadFailure, message: string): EnsureExportResult => ({
  ok: false,
  status,
  code,
  message,
})

export async function ensureCurrentExport(draftId: string): Promise<EnsureExportResult> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { brief: { select: { aspectRatio: true } } },
  })
  if (!draft || draft.status !== 'EXPORTED' || !draft.htmlContent) {
    return fail(409, 'not-ready', 'This post is not ready to download yet.')
  }

  // The current revision: the pointer when set, else the highest committed number.
  const revision = await prisma.draftRevision.findFirst({
    where: {
      ...committedRevisionWhere(draftId),
      ...(draft.currentRevisionNumber != null ? { revisionNumber: draft.currentRevisionNumber } : {}),
    },
    orderBy: { revisionNumber: 'desc' },
    select: { id: true, exportUrl: true },
  })
  // A draft with no revision rows (written before the chain) has nothing to compare against.
  const current = draft.exportUrl != null && (!revision || revision.exportUrl === draft.exportUrl)
  if (current) return { ok: true, key: draft.exportUrl as string, rendered: false }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  let buffer: Buffer
  try {
    // 025 FR-16: the draft's own stamp decides the screenshot.
    // 030 FR-04: a render here re-renders the same HTML and leaves renderedText alone.
    buffer = (await renderDraftHtml(draftId, draft.htmlContent, draftCompositionStamp(draft), width, height, null)).png
  } catch (err) {
    if (err instanceof CompositePlacementError) {
      return fail(422, 'composite-not-placed', err.message)
    }
    console.error(`[download] draft ${draftId}: render failed:`, err)
    return fail(422, 'render-failed', 'The image could not be rendered. Try again.')
  }

  const key = exportKey('export', draftId)
  await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')

  const won = await prisma.$transaction(async (tx) => {
    const claimed = await tx.draft.updateMany({
      where: {
        id: draftId,
        currentRevisionNumber: draft.currentRevisionNumber,
        exportUrl: draft.exportUrl,
        status: 'EXPORTED',
        pendingAction: null,
      },
      data: { exportUrl: key },
    })
    if (claimed.count === 0) return false
    // Draft and revision agree after a render, so the next download finds it current.
    if (revision && revision.exportUrl !== key) {
      await tx.draftRevision.updateMany({ where: { id: revision.id }, data: { exportUrl: key } })
    }
    return true
  })
  if (!won) {
    // The draft moved while we rendered: the upload belongs to nothing.
    await deleteObject(BUCKET_EXPORTS, key).catch(() => {})
    return fail(409, 'changed', 'The post changed while the image was being prepared. Try again.')
  }
  return { ok: true, key, rendered: true }
}
