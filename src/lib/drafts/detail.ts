// The draft detail (the GET body, also returned by the caption routes): the
// stuck-draft sweep and the one reader that assembles a post for the page, the
// poll and the caption desk. Moved out of the draft route (039 FR-09): a Next
// route module may export only its handlers, and the caption delete and undo
// routes answer the same body. Callers have already checked access (canView).

import type { DraftAction, DraftStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { postContext, resolveInputsFor } from '@/lib/projects/context'
import { parseGenerationInputs, sameInputs } from '@/lib/projects/inputs'
import { resolveExportUrl } from '@/lib/storage/minio'
import { planDraftRecovery, STUCK_ACTION_REASON, STUCK_REASON } from '@/lib/drafts/recovery'
import { COMMITTED_REVISION, draftCompositionStamp, resolveNotAppliedOutcome } from '@/lib/drafts/revisions'
import { backgroundSkippedFor } from '@/lib/drafts/backgroundNotice'
import { imageSourceNoticeFor, parseImageSource } from '@/lib/drafts/imageSourceNotice'
import { fontNoticeFor } from '@/lib/drafts/fontNotice'
import { parseRenderNotes } from '@/lib/fonts/renderNotes'
import { compositionNoticeFor } from '@/lib/drafts/compositionNotice'
import { styleSummary } from '@/lib/postStyles'
import { parseFactsCheck } from '@/lib/factsCheck/types'
import { captionFactsFor } from '@/lib/drafts/factsCheckNotice'
import { captionSpec } from '@/lib/channels'
import { captionRulesFor } from '@/lib/captions/rules'
import { loadDraftCaptions, settlePendingCaptions } from '@/lib/captions/store'
import { copyProviderIsClaude } from '@/providers/registry'
import { track } from '@/lib/analytics/track'
import { headlineImageFor } from '@/lib/renderedText/state'
import { parseRenderedText } from '@/lib/renderedText/stamp'

// The fields recoverIfStuck reads and writes. Structurally satisfies the pure
// planner's RecoverableDraft, but with the Prisma enum types the writes need.
interface DraftRecoveryRow {
  id: string
  teamId: string
  status: DraftStatus
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionClaimId: string | null
  pendingActionError: string | null
  updatedAt: Date
}

// Applies the recovery plan (decided purely in lib/drafts/recovery.ts) and
// returns the EFFECTIVE status/reason + pending-action fields, so the response
// reflects the recovery immediately with no extra round-trip. Every write guards
// on the value that was observed, so a concurrent transition always wins. No
// branch here touches draft CONTENT — only status/reason bookkeeping.
async function recoverIfStuck(draft: DraftRecoveryRow): Promise<{
  status: DraftStatus
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
}> {
  const { id, status, pendingAction, pendingActionClaimId } = draft
  const plan = planDraftRecovery(draft)
  const effective = {
    status,
    failureReason: draft.failureReason,
    pendingAction,
    pendingActionError: draft.pendingActionError,
  }

  // Caption rows the swept run left PENDING settle as a failed write, keeping
  // any text they had (012 FR-11). Done BEFORE the run is failed or its claim
  // cleared: until then no new run can mark rows PENDING, so only the swept
  // run's rows are settled.
  if (plan.settlePendingCaptions) {
    await settlePendingCaptions(id, plan.failStuckGeneration ? STUCK_REASON : STUCK_ACTION_REASON).catch(() => {
      /* best-effort recovery */
    })
  }

  // A draft stranded IN_PROGRESS by an interrupted run (e.g. a server restart)
  // → FAILED, so the preview page shows the inline error card + Retry instead of
  // an eternal skeleton.
  if (plan.failStuckGeneration) {
    const swept = await prisma.draft
      .updateMany({
        where: { id, status: 'IN_PROGRESS' },
        data: { status: 'FAILED', failureReason: STUCK_REASON },
      })
      .catch(() => ({ count: 0 }))
    // 006 FR-04: one swept event, and only when THIS call's guarded write
    // changed the row (a concurrent settle or sweep emits its own).
    if (swept.count === 1) {
      await track('generation.swept', {
        source: 'web',
        teamId: draft.teamId,
        draftId: id,
        outcome: 'failed',
        payload: { ageMs: Math.max(0, Date.now() - draft.updatedAt.getTime()) },
      })
    }
    effective.status = 'FAILED'
    effective.failureReason = STUCK_REASON
  }

  if (plan.clearStuckAction) {
    const cleared = await prisma.draft
      .updateMany({
        // Guarded on the claim OBSERVED (action and token; a null token matches
        // IS NULL, the older-image shape), so a run that settled, or a newer
        // claim taken since the read, is never cleared (019 FR-06).
        where: { id, pendingAction, pendingActionClaimId },
        data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: STUCK_ACTION_REASON },
      })
      .catch(() => ({ count: 0 }))
    if (cleared.count === 1 && pendingAction) {
      await track('draft_action.swept', {
        source: 'web',
        teamId: draft.teamId,
        draftId: id,
        outcome: 'failed',
        payload: { action: pendingAction },
      })
    }
    effective.pendingAction = null
    effective.pendingActionError = STUCK_ACTION_REASON
  }

  return effective
}

export async function loadDraft(id: string) {
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      brief: true,
      // revisionCount counts the chain only — rejected refine renders are not
      // versions (change 004 FR-13).
      _count: { select: { revisions: { where: COMMITTED_REVISION } } },
    },
  })
  if (!draft) return null

  // Sweep one stranded IN_PROGRESS by an interrupted run → FAILED, and clear a
  // stale in-flight action, so the effective fields below reflect the recovery.
  const effective = await recoverIfStuck(draft)

  // The one caption reader (012 FR-13), after the sweep, so a row it just
  // settled reads settled.
  const captions = await loadDraftCaptions(id)

  // Surface a refine brand-kit conflict to the poll WITHOUT the stored
  // pendingHtml — it can be huge and is server-side only (the Override path
  // reads it from the DB).
  const pendingConflict = draft.pendingConflict as unknown as {
    conflictId: string
    explanation: string
  } | null

  // 030 FR-12: the state comes from columns already read (no parse, no render).
  const renderedText = parseRenderedText(draft.renderedText)
  const imageSource = parseImageSource(draft.imageSource)

  // Independent reads, run together (018 FR-04: this GET is the 4 s poll).
  // 038 NFR-06: the live comparison for `inputsCurrent` runs only for an
  // EXPORTED draft with nothing running; any other state reads `true`.
  const compareInputs = effective.status === 'EXPORTED' && !effective.pendingAction
  const [ctx, notApplied, captionProviderIsClaude, nextCtx, assigned] = await Promise.all([
    // 038 FR-12: the kit name and the project come from the recorded stamp (a
    // draft made before 038 has none: its brief's own kit, then the team default).
    postContext(draft),
    // FR-14/AC-18: a twice-failed refine is a distinct outcome, not the
    // existing error channel — re-derived from the retained rejected row on
    // every poll (Ruling E), never trusted off the stored FK alone.
    resolveNotAppliedOutcome(draft),
    // 008 FR-20: the caption pickers hide when this draft's own caption
    // provider isn't Claude — the same lookup regenerate-copy refuses a pick on
    // (the brief's key, else the team default), not GET /api/models' team
    // default. It selects the provider name only.
    copyProviderIsClaude(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined),
    // What the post's current assignment resolves to (its project, active
    // briefing and kit), for `inputsCurrent`.
    compareInputs
      ? resolveInputsFor({
          teamId: draft.brief.teamId,
          projectId: draft.brief.projectId,
          brandKitId: draft.brief.brandKitId,
        })
      : null,
    // 038 FR-12: the current assignment (a live project of this team), when the
    // comparison above does not already hold it.
    !compareInputs && draft.brief.projectId
      ? prisma.project.findFirst({
          where: { id: draft.brief.projectId, teamId: draft.brief.teamId, isDeleted: false },
          select: { id: true, name: true },
        })
      : null,
  ])
  const project = nextCtx ? nextCtx.project : assigned

  const composition = draftCompositionStamp(draft)
  const stamp = parseGenerationInputs(draft.generationInputs)

  // 039 FR-15: each item carries its rules (checked when read, never stored; an
  // edit clears a miss at once) and its own facts. The brand kit's website joins
  // the context in 039 T4; until then no caption has a link rule.
  const kitWebsite: string | null = null
  const factsCheck = parseFactsCheck(draft.factsCheck)
  const captionItems = [...(captions?.general ? [captions.general] : []), ...(captions?.curated ?? [])].map((row) => ({
    kind: row.kind,
    channel: row.channel,
    target: row.target,
    label: captionSpec(row.target).label,
    text: row.text,
    status: row.status,
    failureReason: row.failureReason,
    updatedAt: row.updatedAt,
    model: row.model,
    modelSubstitutedFrom: row.modelSubstitutedFrom,
    route: row.route,
    deleted: row.deleted,
    canUndo: row.canUndo,
    rules: captionRulesFor(row, kitWebsite),
    facts: captionFactsFor(factsCheck, row.target),
  }))

  return {
    ownerId: draft.brief.userId,
    teamId: draft.teamId,
    data: {
    id: draft.id,
    briefId: draft.briefId,
    headline: draft.headline,
    // 008 FR-16: the stamps (additive; captions[] carry their own).
    headlineModel: draft.headlineModel,
    headlineModelSubstitutedFrom: draft.headlineModelSubstitutedFrom,
    designModel: draft.designModel,
    designModelSubstitutedFrom: draft.designModelSubstitutedFrom,
    // 039 FR-15: the general caption first, then the curated ones; a post made
    // before 039 has no general item.
    captions: captionItems,
    captionProviderIsClaude,
    imageUrl: draft.imageUrl,
    htmlContent: draft.htmlContent,
    // exportUrl is stored as an EXPORTS object key — sign it for the browser.
    exportUrl: await resolveExportUrl(draft.exportUrl),
    status: effective.status,
    failureReason: effective.failureReason,
    pendingAction: effective.pendingAction,
    pendingActionError: effective.pendingActionError,
    conflict: pendingConflict
      ? { conflictId: pendingConflict.conflictId, explanation: pendingConflict.explanation }
      : null,
    notApplied,
    // 005 FR-07: why there is no AI background, when that was not the
    // model's choice. The message is a fixed per-reason sentence.
    backgroundSkipped: backgroundSkippedFor(draft.backgroundSkipReason, draft.backgroundSkipDetail, imageSource),
    // 031 FR-14: the user's own key failed and the team's provider made the image.
    imageSourceNotice: imageSourceNoticeFor(imageSource),
    // 031 FR-24: the live render used a fallback for a post font (tolerant parse; null = nothing to say).
    fontNotice: fontNoticeFor(parseRenderNotes(draft.renderNotes)),
    // 009 FR-15: the tolerant parse (null on anything unreadable) and its notice.
    composition,
    compositionNotice: compositionNoticeFor(composition),
    // 027 FR-13: the stored facts check (tolerant parse, null on anything
    // unreadable) and the post-style stamp as { key, label, version } or null.
    factsCheck,
    postStyle: styleSummary(draft.postStyle),
    // 030 FR-12: what the image shows of the headline, from the stamp.
    headlineImage: headlineImageFor(renderedText, draft.headline),
    createdAt: draft.createdAt,
    revisionCount: draft._count.revisions,
    currentRevisionNumber: draft.currentRevisionNumber,
    brandKitName: ctx.kit?.name ?? null,
    kitWebsite,
    // 038 FR-12: the current assignment, and whether the recorded inputs still
    // match it (a move only relabels; Apply project settings re-reads it).
    project,
    inputsCurrent: nextCtx ? sameInputs(ctx.inputs, nextCtx.inputs) : true,
    // 038 FR-12: what the post was generated with, from the stamp (null = made before 038).
    inputs: stamp
      ? {
          project: ctx.project,
          briefingVersion: stamp.briefingVersion,
          kitName: ctx.kit?.name ?? null,
          kitSource: stamp.kitSource,
        }
      : null,
    brief: {
      id: draft.brief.id,
      topic: draft.brief.topic,
      goal: draft.brief.goal,
      tone: draft.brief.tone,
      aspectRatio: draft.brief.aspectRatio,
      designMode: draft.brief.designMode,
    },
    },
  }
}
