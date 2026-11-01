import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PROJECT_NOT_FOUND } from '@/lib/projects/errors'
import { withTeamAdmin } from '@/lib/api/handler'

// Rollback: re-activate an older briefing version (no new version is created).
// Mirrors the BrandKitPrompt activate route.
export const POST = withTeamAdmin<{ id: string; vid: string }>(async (_req, { params }, user) => {
  const project = await prisma.project.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!project || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  const briefing = await prisma.projectBriefing.findFirst({
    where: { id: params.vid, projectId: params.id },
  })
  if (!briefing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.projectBriefing.updateMany({
      where: { projectId: params.id, isActive: true },
      data: { isActive: false },
    }),
    prisma.projectBriefing.update({
      where: { id: params.vid },
      data: { isActive: true },
    }),
  ])

  return NextResponse.json({ activated: params.vid })
})
