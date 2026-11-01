import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canView, canEditPost, NOT_AUTHOR } from '@/lib/authz/visibility'
import { parseDeleteQuery } from '@/lib/captions/requests'
import { deleteCaption } from '@/lib/captions/store'
import { loadDraft } from '@/lib/drafts/detail'

type Params = { id: string }

// Delete one curated caption (039 D14, edit tier): DELETE ?channel=<CHANNEL>.
// A caption with text is soft-deleted and can be undone; one with no text is
// removed. The general caption is never deleted (400 general-not-deletable).
// The answer is the refreshed draft body, as PATCH gives.
export const DELETE = withTeamAuth<Params>(async (req, { params }, user) => {
  const query = parseDeleteQuery(new URL(req.url).searchParams)
  if (!query.ok) {
    return NextResponse.json(
      query.code ? { error: query.error, code: query.code } : { error: query.error },
      {
        status: 400,
      },
    )
  }

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

  const deleted = await deleteCaption(params.id, query.channel)
  if (deleted === 'missing') {
    return NextResponse.json(
      { error: 'Caption not found', code: 'caption-not-found' },
      { status: 404 },
    )
  }
  if (deleted === 'pending') {
    return NextResponse.json({ error: 'This caption is being generated' }, { status: 409 })
  }

  const result = await loadDraft(params.id)
  return NextResponse.json(result ? { ...result.data, canEdit: true } : undefined)
})
