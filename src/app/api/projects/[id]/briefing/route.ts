import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PROJECT_NOT_FOUND } from '@/lib/projects/errors'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

async function projectInTeam(id: string, teamId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id, isDeleted: false, teamId },
    select: { id: true },
  })
  return Boolean(project)
}

// Versions are readable by any signed-in user — editors see the active briefing
// for context in the wizard and on the project page; writes are admin-only
// (the briefing steers every post in the project, like the brand voice).
// Team tenancy fix: this ran under plain withAuth + a teamId-less
// projectExists() check — any authenticated user of ANY team could read
// another team's full briefing content (every version) by projectId.
export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  if (!(await projectInTeam(params.id, user.teamId))) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  const briefings = await prisma.projectBriefing.findMany({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
  })

  return NextResponse.json(briefings)
})

const createSchema = z.object({
  content: z.string().trim().min(1, 'content is required'),
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const { userId } = user

  const project = await prisma.project.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!project || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { content } = body.data

  // Allocate the next version, deactivate the current active briefing, and
  // create the new active one atomically. Concurrent saves can read the same
  // max version and collide on @@unique([projectId, version]); surface that
  // as 409 rather than a raw P2002 500. (Mirrors the BrandKitPrompt route.)
  try {
    const briefing = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectBriefing.findFirst({
        where: { projectId: params.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const nextVersion = (latest?.version ?? 0) + 1

      await tx.projectBriefing.updateMany({
        where: { projectId: params.id, isActive: true },
        data: { isActive: false },
      })

      return tx.projectBriefing.create({
        data: {
          projectId: params.id,
          content,
          version: nextVersion,
          isActive: true,
          createdBy: userId,
        },
      })
    })

    return NextResponse.json(briefing, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'A concurrent edit created a new version — please retry.' },
        { status: 409 }
      )
    }
    throw err
  }
})
