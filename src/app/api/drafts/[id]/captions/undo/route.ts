import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canView, canEditPost, NOT_AUTHOR } from '@/lib/authz/visibility'
import { parseUndoBody } from '@/lib/captions/requests'
import { undoCaption } from '@/lib/captions/store'
import { loadDraft } from '@/lib/drafts/detail'

type Params = { id: string }

// One step of undo for a caption (039 D15, edit tier): body { kind: 'GENERAL' }
// or { channel }. It swaps the caption's live state with its saved previous
// state, so a second undo brings back what the first replaced. The answer is
// the refreshed draft body, as PATCH gives.
export const POST = withTeamAuth<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, z.unknown())
  if (body.response) return body.response
  const ref = parseUndoBody(body.data)
  if (!ref.ok) return NextResponse.json({ error: ref.error }, { status: 400 })

  const existing = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { teamId: true, brief: { select: { userId: true } } },
  })
  if (!existing || !canView(user, { teamId: existing.teamId })) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  if (!canEditPost(user, { teamId: existing.teamId, ownerId: existing.brief.userId })) {
    return NextResponse.json(NOT_AUTHOR, { status: 403 })
  }

  const undone = await undoCaption(params.id, ref.value)
  if (undone === 'missing') {
    return NextResponse.json(
      { error: 'Caption not found', code: 'caption-not-found' },
      { status: 404 },
    )
  }
  if (undone === 'nothing') {
    return NextResponse.json({ error: 'Nothing to undo', code: 'nothing-to-undo' }, { status: 409 })
  }
  if (undone === 'pending') {
    return NextResponse.json({ error: 'This caption is being generated' }, { status: 409 })
  }
  if (undone === 'changed') {
    return NextResponse.json(
      { error: 'The caption changed. Try again.', code: 'changed' },
      { status: 409 },
    )
  }

  const result = await loadDraft(params.id)
  return NextResponse.json(result ? { ...result.data, canEdit: true } : undefined)
})
