import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { PROJECT_NOT_FOUND } from '@/lib/projects/errors'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'
import { getStyle, isStyleKey } from '@/lib/postStyles'

type Params = { id: string }

// Team tenancy fix: this GET ran under plain withAuth with no teamId check at
// all — any authenticated user of ANY team could fetch another team's full
// project (default brand kit, post count) by id. PATCH/DELETE below
// were already correctly team-scoped; this GET was missed by the same sweep.
export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      _count: { select: { briefs: true } },
    },
  })

  if (!project || project.isDeleted || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }
  return NextResponse.json({ ...project, postCount: project._count.briefs })
})

const patchSchema = z.object({
  name: z.string().trim().min(1, 'name is required').optional(),
  defaultBrandKitId: z.string().nullable().optional(),
  defaultTone: z.string().nullable().optional(),
  // 038 FR-05: a dataset key, or null/blank to clear.
  defaultPostStyle: z.string().trim().max(40).nullable().optional(),
})

export const PATCH = withTeamAdmin<Params>(async (req, { params }, user) => {
  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { name, defaultBrandKitId, defaultTone } = body.data
  // undefined = leave alone; null or blank = clear; otherwise a dataset key.
  const defaultPostStyle =
    body.data.defaultPostStyle === undefined ? undefined : body.data.defaultPostStyle?.trim() || null
  if (defaultPostStyle) {
    // A retired key is accepted only when it is already the stored value (no new use of a retired style).
    const ok =
      isStyleKey(defaultPostStyle) &&
      (getStyle(defaultPostStyle)?.status === 'active' || defaultPostStyle === project.defaultPostStyle)
    if (!ok) {
      return NextResponse.json(
        { error: `Unknown post style '${defaultPostStyle}'`, code: 'UNKNOWN_POST_STYLE' },
        { status: 400 },
      )
    }
  }

  // I3 (final review): same missing/foreign-team validation as POST above —
  // PATCH accepts defaultBrandKitId too and was equally unguarded.
  if (defaultBrandKitId) {
    const kit = await prisma.brandKit.findFirst({
      where: { id: defaultBrandKitId, teamId: project.teamId, isDeleted: false },
    })
    if (!kit) return NextResponse.json({ error: 'Brand kit not found' }, { status: 400 })
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(defaultBrandKitId !== undefined && { defaultBrandKitId }),
      ...(defaultTone !== undefined && { defaultTone }),
      ...(defaultPostStyle !== undefined && { defaultPostStyle }),
    },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      _count: { select: { briefs: true } },
    },
  })

  return NextResponse.json({ ...updated, postCount: updated._count.briefs })
})

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  // D9: soft-delete and unassign the project's posts in one transaction. The
  // briefing, the documents and their objects are kept, because existing drafts'
  // stamps point at them; only the grouping is lost.
  // The soft delete comes first: it takes the project row lock, so a concurrent
  // assign (PUT /api/drafts/[id]/project, which holds FOR SHARE on the live
  // project) either lands before the unassign below sees it, or finds the
  // project deleted and answers 404 (038 T4).
  const unassigned = await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: params.id },
      data: { isDeleted: true, deletedAt: new Date() },
    })
    const { count } = await tx.brief.updateMany({
      where: { projectId: params.id, teamId: user.teamId },
      data: { projectId: null },
    })
    return count
  })

  return NextResponse.json({ unassigned })
})
