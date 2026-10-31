import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canView } from '@/lib/authz/visibility'
import { ensureCurrentExport } from '@/lib/drafts/download'
import { track } from '@/lib/analytics/track'
import { parseFactsCheck } from '@/lib/factsCheck/types'
import { parseRenderedText } from '@/lib/renderedText/stamp'
import { headlineState } from '@/lib/renderedText/state'
import { getObjectBytes, BUCKET_EXPORTS } from '@/lib/storage/minio'

// ASCII slug of the topic, at most 60 characters; "post" when nothing is left.
function slugOf(topic: string): string {
  const slug = topic
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'post'
}

// Download (037 D4, FR-04): the post's PNG as an attachment. The render, when
// the stored image is not current, lives in ensureCurrentExport. This route is
// the one emitter of `draft.downloaded`, for every outcome.
export const GET = withTeamAuth<{ id: string }>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: { select: { userId: true, topic: true } } },
  })
  if (!draft || !canView(user, { teamId: draft.teamId })) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const facts = parseFactsCheck(draft.factsCheck)
  const base = {
    source: 'web' as const,
    teamId: draft.teamId,
    userId: user.userId,
    draftId: draft.id,
  }
  const stamp = {
    factsStatus: facts?.status ?? null,
    headlineState: headlineState(parseRenderedText(draft.renderedText), draft.headline),
  }

  const result = await ensureCurrentExport(draft.id)
  if (!result.ok) {
    await track('draft.downloaded', {
      ...base,
      outcome: 'failed',
      payload: { rendered: false, ...stamp, failure: result.code },
    })
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status })
  }

  let bytes: Buffer
  try {
    bytes = await getObjectBytes(BUCKET_EXPORTS, result.key)
  } catch (err) {
    console.error(`[download] draft ${draft.id}: reading the image failed:`, err)
    await track('draft.downloaded', {
      ...base,
      outcome: 'failed',
      payload: { rendered: result.rendered, ...stamp, failure: 'render-failed' },
    })
    return NextResponse.json({ error: 'The image could not be read. Try again.', code: 'render-failed' }, { status: 500 })
  }
  await track('draft.downloaded', { ...base, outcome: 'ok', payload: { rendered: result.rendered, ...stamp } })
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${slugOf(draft.brief.topic)}-${draft.id}.png"`,
      'Cache-Control': 'private, no-store',
    },
  })
})
