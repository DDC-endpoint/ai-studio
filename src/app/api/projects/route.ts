import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'
import { getStyle } from '@/lib/postStyles'
import { MAX_PROJECTS_PER_TEAM } from '@/lib/projects/limits'

export const GET = withTeamAuth(async (_req, _ctx, user) => {
  const projects = await prisma.project.findMany({
    where: { isDeleted: false, teamId: user.teamId },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      // 038 FR-05: the posts assigned to the project (the list page shows the count).
      _count: { select: { briefs: true } },
    },
    orderBy: { createdAt: 'desc' },
    // Bounded by MAX_PROJECTS_PER_TEAM (the create cap); the response is a bare array.
    take: MAX_PROJECTS_PER_TEAM,
  })

  return NextResponse.json(projects.map(withPostCount))
})

// `_count.briefs` stays for the clients that read it; `postCount` is the 038 name.
function withPostCount<T extends { _count: { briefs: number } }>(project: T) {
  return { ...project, postCount: project._count.briefs }
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  defaultBrandKitId: z.string().nullish(),
  defaultTone: z.string().nullish(),
  // 038 FR-05: a dataset key; a blank value means none. Checked below.
  defaultPostStyle: z.string().trim().max(40).nullish(),
})

export const POST = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, defaultBrandKitId, defaultTone } = body.data
  // A new project may only default to an active style (a retired one is kept only where it already is).
  const defaultPostStyle = body.data.defaultPostStyle?.trim() || null
  if (defaultPostStyle && getStyle(defaultPostStyle)?.status !== 'active') {
    return NextResponse.json(
      { error: `Unknown post style '${defaultPostStyle}'`, code: 'UNKNOWN_POST_STYLE' },
      { status: 400 },
    )
  }

  // I3 (final review): this validation was MISSING entirely — a bogus id was
  // a P2003 500, and a foreign team's id was accepted silently, becoming the
  // project's default brand kit (and thus, via resolveBrandKit's project
  // tier, the whole team's fallback branding).
  if (defaultBrandKitId) {
    const kit = await prisma.brandKit.findFirst({
      where: { id: defaultBrandKitId, teamId: user.teamId, isDeleted: false },
    })
    if (!kit) return NextResponse.json({ error: 'Brand kit not found' }, { status: 400 })
  }

  // D15: at most MAX_PROJECTS_PER_TEAM live projects; a soft-deleted one does not count.
  const live = await prisma.project.count({ where: { teamId: user.teamId, isDeleted: false } })
  if (live >= MAX_PROJECTS_PER_TEAM) {
    return NextResponse.json(
      { error: `A team can hold at most ${MAX_PROJECTS_PER_TEAM} projects`, code: 'project-limit' },
      { status: 409 },
    )
  }

  const project = await prisma.project.create({
    data: {
      teamId: user.teamId,
      name,
      defaultBrandKitId: defaultBrandKitId ?? null,
      defaultTone: defaultTone ?? null,
      defaultPostStyle,
    },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      _count: { select: { briefs: true } },
    },
  })

  return NextResponse.json(withPostCount(project), { status: 201 })
})
