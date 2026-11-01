import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canView, canEditPost, NOT_AUTHOR } from '@/lib/authz/visibility'
import { BUCKET_DOCS, deleteObject } from '@/lib/storage/minio'
import { parseCompositeSource } from '@/lib/brief/compositeSource'
import { parseCaptionPatch } from '@/lib/captions/requests'
import { validateHeadline } from '@/lib/captions/headline'
import { saveCaptionEdit, saveHeadlineEdit } from '@/lib/captions/store'
import { loadDraft } from '@/lib/drafts/detail'
import { trackHeadlineEdited } from '@/lib/renderedText/track'

type Params = { id: string }

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const result = await loadDraft(params.id)
  if (!result || !canView(user, { teamId: result.teamId })) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...result.data,
    canEdit: canEditPost(user, { teamId: result.teamId, ownerId: result.ownerId }),
  })
})

// Team tenancy fix: this handler used to run under plain withAuth + the
// old ownership helper (a platform-role-only check with no team dimension —
// it let any admin/super-admin bypass ownership entirely), so an admin of
// ANY team could edit ANY other team's draft copy. Task 8/9's sweeps
// covered this file's GET and DELETE but missed PATCH. Now withTeamAuth +
// canView + canEditPost, matching the GET handler above (the old helper,
// forbiddenIfNotOwner, has since been deleted from src/lib/auth.ts — this
// was its last real caller).
//
// 012 FR-12: the body is exactly one of { channel, text } (one caption,
// stored as typed) or { headline } (validated). A legacy { copyText } is 400.
export const PATCH = withTeamAuth<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, z.unknown())
  if (body.response) return body.response
  const patch = parseCaptionPatch(body.data)
  if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 })

  const existing = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { status: true, pendingAction: true, teamId: true, headline: true, brief: { select: { userId: true } } },
  })
  if (!existing || !canView(user, { teamId: existing.teamId })) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  if (!canEditPost(user, { teamId: existing.teamId, ownerId: existing.brief.userId })) {
    return NextResponse.json(NOT_AUTHOR, { status: 403 })
  }

  const beingGenerated = () => NextResponse.json({ error: 'This caption is being generated' }, { status: 409 })
  if ('headline' in patch.value) {
    const headline = validateHeadline(patch.value.headline)
    if (!headline.ok) {
      return NextResponse.json({ error: `The headline was not saved (${headline.reason})` }, { status: 400 })
    }
    // Refused while anything may be writing the headline — a caption action,
    // or a generation (IN_PROGRESS, retry included) — so neither overwrites
    // the other.
    if (
      existing.pendingAction === 'REGENERATE_COPY' ||
      existing.status === 'IN_PROGRESS' ||
      !(await saveHeadlineEdit(params.id, headline.text))
    ) {
      return beingGenerated()
    }
    // 030 FR-15: after a successful save, with the headline read before it.
    await trackHeadlineEdited({
      draftId: params.id,
      teamId: existing.teamId,
      userId: user.userId,
      via: 'edit',
      before: existing.headline,
    })
  } else {
    // 039 D13: { kind: 'GENERAL', text } or { channel, text }. A missing row is
    // 404, a deleted one 409, and a PENDING one (being written) is refused.
    const value = patch.value
    const ref = 'kind' in value ? ({ kind: 'GENERAL' } as const) : ({ kind: 'CURATED', channel: value.channel } as const)
    const saved = await saveCaptionEdit(params.id, ref, value.text)
    if (saved === 'missing') return NextResponse.json({ error: 'Caption not found', code: 'caption-not-found' }, { status: 404 })
    if (saved === 'deleted') return NextResponse.json({ error: 'This caption was deleted', code: 'caption-deleted' }, { status: 409 })
    if (saved === 'pending') return beingGenerated()
  }

  // Captions and design are independent artifacts — a caption is what is
  // posted, the export is the rendered image — so a caption edit must NOT
  // touch Draft.status (TC-ASYNC-10). The pre-012 copy edit used to flip
  // EXPORTED → IN_PROGRESS to signal "the export is stale", but IN_PROGRESS
  // means "generation is running", and every consumer read it that way: the
  // draft dropped out of the library (it filters on EXPORTED), Refine design
  // and Edit inline vanished, Regenerate answered 409 'Draft is not ready', a
  // cleared caption left the page stuck on an eternal skeleton with no way
  // back, and after 15 minutes the lazy sweep marked the draft FAILED. Nothing
  // was regenerating, so the only escape was to regenerate the whole post.
  // regenerate-copy leaves status alone too (§Q TC-ASYNC-02). A "your export
  // predates this caption" nudge belongs in the UI, not in the status field.
  // Editing the headline does not re-render the design either.

  const result = await loadDraft(params.id)
  return NextResponse.json(result ? { ...result.data, canEdit: true } : undefined)
})

// Author-or-team-admin hard delete (038 D11): removes the draft with its revisions, and the parent Brief when no
// other draft references it. No cascades exist on these relations, so children
// are deleted first, all in one transaction — except the caption rows
// (DraftCaption), which cascade with the draft (012 D11).
export const DELETE = withTeamAuth<Params>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { id: true, briefId: true, teamId: true, brief: { select: { userId: true } } },
  })
  if (!draft || !canView(user, { teamId: draft.teamId })) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  if (!canEditPost(user, { teamId: draft.teamId, ownerId: draft.brief.userId })) {
    return NextResponse.json(NOT_AUTHOR, { status: 403 })
  }

  const { briefDeleted, screenshotKey } = await prisma.$transaction(async (tx) => {
    // Deliberately UNFILTERED: a hard delete removes every revision row,
    // rejected refine renders included (the FK would otherwise block the draft
    // delete). Draft.notAppliedRevisionId is ON DELETE SET NULL, so removing the
    // rejected row it references first is safe.
    await tx.draftRevision.deleteMany({ where: { draftId: draft.id } })
    await tx.draft.delete({ where: { id: draft.id } })
    // 006 FR-12: the draft's analytics events stay (they are aggregate history)
    // but lose the link to it; there is no foreign key, so this is explicit.
    await tx.analyticsEvent.updateMany({ where: { draftId: draft.id }, data: { draftId: null } })

    // Sweep the brief only when it has become an orphan (the schema allows
    // multiple drafts per brief, so count before deleting).
    const remaining = await tx.draft.count({ where: { briefId: draft.briefId } })
    if (remaining === 0) {
      // 025 FR-11: remember the brief's private screenshot before the row goes.
      const gone = await tx.brief.findUnique({ where: { id: draft.briefId }, select: { compositeSource: true } })
      await tx.brief.delete({ where: { id: draft.briefId } })
      return { briefDeleted: true, screenshotKey: parseCompositeSource(gone?.compositeSource)?.key ?? null }
    }
    return { briefDeleted: false, screenshotKey: null }
  })
  // Best-effort and after the commit, scoped to this team's own prefix.
  if (screenshotKey && screenshotKey.startsWith(`screenshots/${user.teamId}/`) && !screenshotKey.includes('..')) {
    try {
      await deleteObject(BUCKET_DOCS, screenshotKey)
    } catch (e) {
      console.error(`[drafts] failed to delete screenshot ${screenshotKey}:`, (e as Error).message)
    }
  }

  return NextResponse.json({ deleted: true, briefDeleted })
})
