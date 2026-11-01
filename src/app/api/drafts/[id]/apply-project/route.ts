import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canView, canEditPost, NOT_AUTHOR } from '@/lib/authz/visibility'
import { postContext, resolveInputsFor } from '@/lib/projects/context'
import { sameInputs } from '@/lib/projects/inputs'
import { refreshFactsCheck } from '@/lib/factsCheck/refresh'
import { parseFactsCheck } from '@/lib/factsCheck/types'
import { track } from '@/lib/analytics/track'
import { GET as getDraft } from '../route'

// Apply project settings (038 D8, FR-11): the one way an existing post takes new
// project inputs. It resolves the post's current assignment live, writes the
// stamp with a compare-and-set on the stamp it read (a lost race is a 409
// `changed`), recomputes the facts check against the new sources, and emits
// `draft.inputs_applied` (this route is that event's one emitter). It does not
// regenerate anything and never changes the post style or the tone.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
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

  if (draft.status === 'IN_PROGRESS' || draft.pendingAction) {
    return NextResponse.json({ error: 'Another action is already running on this post', code: 'busy' }, { status: 409 })
  }

  // The recorded inputs (a null stamp reads as the brief's own kit, no project)
  // against what the current assignment resolves to.
  const [recordedCtx, next] = await Promise.all([
    postContext(draft),
    resolveInputsFor({
      teamId: draft.teamId,
      projectId: draft.brief.projectId,
      brandKitId: draft.brief.brandKitId,
    }),
  ])
  const recorded = recordedCtx.inputs
  if (sameInputs(recorded, next.inputs)) {
    return NextResponse.json({ error: 'The post already uses its project settings', code: 'no-change' }, { status: 409 })
  }

  const asRead = draft.generationInputs === null ? Prisma.DbNull : (draft.generationInputs as Prisma.InputJsonValue)
  const written = await prisma.draft.updateMany({
    where: {
      id: draft.id,
      pendingAction: null,
      status: { not: 'IN_PROGRESS' },
      generationInputs: { equals: asRead },
    },
    data: { generationInputs: next.inputs as unknown as Prisma.InputJsonValue },
  })
  if (written.count === 0) {
    return NextResponse.json({ error: 'The post changed while applying. Try again.', code: 'changed' }, { status: 409 })
  }

  // The stored verdict must match the recorded sources (D8). Never throws.
  await refreshFactsCheck(draft.id)
  const after = await prisma.draft.findUnique({ where: { id: draft.id }, select: { factsCheck: true } })

  await track('draft.inputs_applied', {
    source: 'web',
    teamId: draft.teamId,
    userId: user.userId,
    draftId: draft.id,
    outcome: 'ok',
    payload: {
      fromProjectId: recorded.projectId,
      toProjectId: next.inputs.projectId,
      kitChanged: recorded.kitId !== next.inputs.kitId,
      briefingChanged: recorded.briefingId !== next.inputs.briefingId,
      factsStatus: parseFactsCheck(after?.factsCheck)?.status ?? null,
    },
  })

  // The body is the draft GET's (the page replaces its copy with it).
  return getDraft(req as NextRequest, { params: Promise.resolve({ id: draft.id }) })
})
