import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canView, canEditPost, NOT_AUTHOR } from '@/lib/authz/visibility'
import { copyProviderIsClaude, resolveCopyProvider } from '@/providers/registry'
import { postContext, type PostContext } from '@/lib/projects/context'
import { briefPostStyleStamp, buildBriefInput } from '@/lib/agent/briefInput'
import { writeCaptions } from '@/lib/captions/generate'
import { parseRegenerateBody } from '@/lib/captions/requests'
import { failedCaptionFields } from '@/lib/captions/actionTargets'
import { trackHeadlineEdited } from '@/lib/renderedText/track'
import { claimCaptionAction, loadDraftCaptions, settleCaptionAction } from '@/lib/captions/store'
import { releaseDraftAction, startDraftAction } from '@/lib/drafts/draftActions'
import { resolveModel } from '@/lib/models/policy'
import { regenerateStampTier, type ResolvedModel } from '@/lib/models/resolve'
import { captionProviderNotClaudeError, modelError } from '@/lib/models/requests'
import { newActionTrace } from '@/lib/analytics/trace'

// Regenerates a caption for a draft (012 FR-11; the route name is a kept
// contract): body { kind: 'GENERAL' } → the general caption (made on a post that
// has none), { channel } → that curated caption, { headline: true } → the
// headline, each with an optional `model` pick (008 FR-17). {} is a 400: "Regenerate
// all" is retired (039 Q2). Validation runs
// synchronously, then the model work runs in-process fire-and-forget (the F1
// pattern — see draftActions.ts) and the route returns 202; the draft page
// polls pendingAction and the rows' status to completion. The design HTML/PNG
// is untouched — captions and design regenerate independently, and
// Draft.status never changes.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  // An empty or absent body parses as {}, which is the wrong shape (400).
  // Malformed JSON is a 400 of its own.
  let raw: unknown = {}
  const text = await req.text()
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  }
  const parsed = parseRegenerateBody(raw)
  if (!parsed.ok) {
    const body = 'code' in parsed ? { error: parsed.error, code: parsed.code } : { error: parsed.error }
    return NextResponse.json(body, { status: 400 })
  }
  const { targets, model: requested } = parsed.value

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (!draft || !canView(user, { teamId: draft.teamId })) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  if (!canEditPost(user, { teamId: draft.teamId, ownerId: draft.brief.userId })) {
    return NextResponse.json(NOT_AUTHOR, { status: 403 })
  }

  // Regeneration needs existing content to replace — a draft still generating
  // (or one whose generation failed) has none.
  if (draft.status !== 'EXPORTED') {
    return NextResponse.json({ error: 'Draft is not ready for caption regeneration' }, { status: 409 })
  }

  // Everything fallible that needs no claim runs first, so its failure (422)
  // leaves nothing claimed.
  let provider: Awaited<ReturnType<typeof resolveCopyProvider>>
  let ctx: PostContext
  let model: ResolvedModel
  try {
    // The rows are read BEFORE the claim marks them PENDING: they carry the
    // stamps below.
    const loaded = await loadDraftCaptions(draft.id)
    // 039 T2: a curated caption that does not exist yet is made by T3's curate;
    // until then only an existing row is regenerated. The general caption is the
    // one target that is created in the claim (an old post's).
    const curated = targets.find((t) => t !== 'HEADLINE' && t !== 'GENERAL')
    if (curated && !loaded?.curated.some((r) => r.target === curated)) {
      return NextResponse.json({ error: 'Caption not found', code: 'caption-not-found' }, { status: 404 })
    }

    // 008 FR-09: the regenerate default is the stamp of what is being replaced
    // — the row's model or the headline's (a missing row or a null stamp → no
    // stamp tier, so the team default). An
    // explicit pick (FR-17) is tier 1, above the stamp. Resolved before the
    // claim, so a refused pick (400) or a team with nothing allowed (422)
    // claims nothing.
    // Spec open question 1: a caption pick needs a Claude caption provider (the
    // one this run would use: the brief's key, else the team default).
    if (requested && !(await copyProviderIsClaude(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined))) {
      return NextResponse.json(captionProviderNotClaudeError(), { status: 400 })
    }
    const stamp = regenerateStampTier(targets, {
      captions: [...(loaded?.general ? [loaded.general] : []), ...(loaded?.curated ?? [])],
      headlineModel: draft.headlineModel ?? null,
    })
    const resolved = await resolveModel('CAPTION', { requested, stamp, userId: user.userId, teamId: draft.teamId })
    if (!resolved.ok) {
      if (requested) return NextResponse.json(modelError(resolved), { status: 400 })
      throw new Error(resolved.message)
    }
    model = resolved.resolved

    provider = await resolveCopyProvider(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined)
    // 038 D3: the kit and the briefing the post was made with (its recorded stamp),
    // not the brief's current project.
    ctx = await postContext(draft)
  } catch (err) {
    return copyError(err)
  }

  // One draft-level claim for every caption action (A2), with the target rows
  // marked PENDING in the same transaction.
  const claimed = await claimCaptionAction(draft.id, targets)
  if (!claimed) {
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }
  const { claim, created } = claimed

  try {
    // CLI mode bills the acting user's personal Claude token when connected
    // (the team token otherwise) — startDraftAction resolves it before the
    // request unwinds and pins it onto the background run. Each row settles per
    // settleCaptionRow (a failure keeps good text, A7); a throw settles every
    // target row as failed (onError) and is recorded on pendingActionError.
    // 008 FR-08: the reply's stamp goes on the fields that validated only; the
    // failure settles pass none, so a row keeps the stamp of the text it keeps.
    const trace = newActionTrace()
    trace.fields.model = { model: model.key, modelId: model.arg, substitutedFrom: model.substitutedFrom }
    // 039 D22/D25: a caption action names its kind, its channel (curated) and
    // whether it made the row or replaced it on the settle event (startDraftAction
    // spreads trace.fields into the payload).
    const only = targets.length === 1 ? targets[0] : null
    if (only && only !== 'HEADLINE') {
      trace.fields.captionKind = only === 'GENERAL' ? 'GENERAL' : 'CURATED'
      if (only !== 'GENERAL') trace.fields.channel = only
      trace.fields.captionOp = created.includes(only) ? 'create' : 'replace'
    }
    await startDraftAction(
      draft.id,
      user.userId,
      user.teamId,
      claim,
      async () => {
        // 027: the brief's post style rules, if it has one (a stored key that does
        // not resolve throws here and settles the rows as failed).
        const briefInput = buildBriefInput(draft.brief, ctx)
        const { fields, stamp } = await writeCaptions(provider, briefInput, targets, model)
        // The copy ran under the style's current version; the settle writes it to
        // Draft.postStyle (claim-guarded) and recomputes the facts check. Only when
        // some target validated: a run that changed no text keeps the old stamp.
        const anyOk = Object.values(fields).some((f) => f?.ok)
        const settled = await settleCaptionAction(draft.id, claim, targets, fields, stamp, undefined, anyOk ? briefPostStyleStamp(draft.brief) : undefined)
        // 030 FR-15: one event when the settle wrote a headline (after the transaction).
        if (settled.headlineWritten) {
          await trackHeadlineEdited({
            draftId: draft.id,
            teamId: user.teamId,
            userId: user.userId,
            via: 'regenerate',
            before: settled.headlineBefore,
          })
        }
        // A headline has no row to carry a failure, so it is reported on
        // pendingActionError; the stored headline is unchanged.
        const headline = fields.HEADLINE
        if (targets.includes('HEADLINE') && !headline?.ok) {
          throw new Error(`Regenerate headline failed: ${headline?.reason ?? 'missing'}`)
        }
      },
      async (err) => {
        await settleCaptionAction(draft.id, claim, targets, failedCaptionFields(targets, errorMessage(err)))
      },
      trace,
    )
  } catch (err) {
    // The run never started (e.g. the credential lookup threw): settle the rows
    // this request marked PENDING and give the claim back, so the panels don't
    // wait for the 15-minute sweep. Settle first, while the claim still holds.
    // Best-effort: if this fails too, the stale sweep still recovers the draft.
    const message = errorMessage(err)
    try {
      await settleCaptionAction(draft.id, claim, targets, failedCaptionFields(targets, message))
      await releaseDraftAction(draft.id, claim, message)
    } catch (e) {
      console.error(`[draft-action] draft ${draft.id}: releasing the unstarted caption action failed:`, e)
    }
    return copyError(err)
  }

  return NextResponse.json({ ok: true }, { status: 202 })
})

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

function copyError(err: unknown) {
  return NextResponse.json({ code: 'COPY_ERROR', message: errorMessage(err) }, { status: 422 })
}
