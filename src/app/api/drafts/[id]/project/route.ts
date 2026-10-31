import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canView } from '@/lib/authz/visibility'
import { PROJECT_NOT_FOUND } from '@/lib/projects/errors'
import { track } from '@/lib/analytics/track'

const bodySchema = z.object({ projectId: z.string().min(1).max(64).nullable() })

type Change = 'assign' | 'move' | 'unassign'

// Assign, move or unassign a post (038 D8, FR-10). Any member of the post's
// team can (the view tier): the move only relabels, because the post keeps the
// inputs it was generated with (Draft.generationInputs, which this route never
// touches). It writes Brief.projectId and nothing else, and it is the one
// emitter of `draft.project_changed`. A repeat of the current assignment is a
// 200 with no write and no event.
export const PUT = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const targetId = body.data.projectId

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { id: true, teamId: true, briefId: true },
  })
  if (!draft || !canView(user, { teamId: draft.teamId })) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // D12: a foreign, deleted or unknown project is the one 404 body.
  const target = targetId
    ? await prisma.project.findFirst({
        where: { id: targetId, teamId: user.teamId, isDeleted: false },
        select: { id: true, name: true },
      })
    : null
  if (targetId && !target) return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })

  // The write is conditional on the target still being live, inside the
  // transaction: FOR SHARE waits for a concurrent project delete (which
  // soft-deletes first, then unassigns) and re-reads the row, so a post can
  // never be left on a deleted project.
  const result = await prisma.$transaction(async (tx) => {
    if (target) {
      const live = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Project"
        WHERE "id" = ${target.id} AND "teamId" = ${user.teamId} AND "isDeleted" = false
        FOR SHARE`
      if (live.length === 0) return { gone: true as const }
    }
    const brief = await tx.brief.findUnique({ where: { id: draft.briefId }, select: { projectId: true } })
    if (!brief) return { gone: true as const }
    const from = brief.projectId
    const to = target?.id ?? null
    if (from === to) return { gone: false as const, from, to, changed: false as const }
    await tx.brief.update({ where: { id: draft.briefId }, data: { projectId: to } })
    return { gone: false as const, from, to, changed: true as const }
  })

  if (result.gone) return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })

  if (result.changed) {
    const change: Change = result.to === null ? 'unassign' : result.from === null ? 'assign' : 'move'
    await track('draft.project_changed', {
      source: 'web',
      teamId: draft.teamId,
      userId: user.userId,
      draftId: draft.id,
      payload: { change, fromProjectId: result.from, toProjectId: result.to },
    })
  }

  return NextResponse.json({ project: target ? { id: target.id, name: target.name } : null })
})
