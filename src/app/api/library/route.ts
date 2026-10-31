import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { PROJECT_NOT_FOUND } from '@/lib/projects/errors'
import { withTeamAuth } from "@/lib/api/handler"
import { draftVisibilityWhere } from "@/lib/authz/visibility"
import { resolveExportUrl } from "@/lib/storage/minio"
import { Prisma } from "@prisma/client"
import { isStyleKey } from "@/lib/postStyles"
import { headlineState } from "@/lib/renderedText/state"
import { parseRenderedText } from "@/lib/renderedText/stamp"

export const GET = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)))
  const search = searchParams.get("search")?.trim() ?? ""
  const brandKitId = searchParams.get("brandKitId")?.trim() || null
  const postStyle = searchParams.get("postStyle")?.trim() || null
  // 038 FR-13: a project id, or "none" for the posts that belong to no project.
  const projectId = searchParams.get("projectId")?.trim() || null

  // An unknown style is a client error, never "no filter" (037 FR-06).
  if (postStyle && !isStyleKey(postStyle)) {
    return NextResponse.json({ error: "Unknown post style" }, { status: 400 })
  }

  // Build the where clause with the real Prisma type (M3, final review) — the
  // old hand-rolled WhereClause type didn't match Prisma's actual
  // DraftWhereInput shape, so the visibility AND-clause below had to be
  // silenced with `as never`. That cast meant a future change to
  // draftVisibilityWhere's shape wouldn't be type-checked at this call
  // site — exactly where a silent visibility regression (D6) would hurt.
  // The library lists finished posts only (037 D10): EXPORTED drafts.
  const where: Prisma.DraftWhereInput = { status: "EXPORTED" }

  // AND-ed conditions accumulate here (search + the mandatory D6 visibility
  // clause below) so the two can never accidentally overwrite each other.
  const andConditions: Prisma.DraftWhereInput[] = []

  if (search) {
    andConditions.push({
      brief: { topic: { contains: search, mode: "insensitive" } },
    })
  }

  // D6 visibility: own drafts, or anything shared via a campaign-linked brief
  // (team-wide admins/super-admins see the whole team).
  if (postStyle) {
    andConditions.push({ brief: { postStyle } })
  }

  // Project filter. A foreign, deleted or unknown id is the same 404 on every
  // surface (038 NFR-07), never an empty list.
  if (projectId === "none") {
    andConditions.push({ brief: { projectId: null } })
  } else if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, teamId: user.teamId, isDeleted: false },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
    }
    andConditions.push({ brief: { projectId } })
  }

  // Kit filter: the brief's own kit, else (no explicit kit) the campaign's.
  if (brandKitId) {
    andConditions.push({
      OR: [
        { brief: { brandKitId } },
        { brief: { brandKitId: null, campaign: { brandKitId } } },
      ],
    })
  }

  andConditions.push(draftVisibilityWhere(user))

  where.AND = andConditions

  const [drafts, total] = await Promise.all([
    // select (not include): tiles never need htmlContent (megabytes/row after
    // inline-asset restoration) or pendingConflict.
    prisma.draft.findMany({
      where,
      select: {
        id: true,
        status: true,
        exportUrl: true,
        createdAt: true,
        // 030 FR-12: read only to derive the state; neither is returned.
        headline: true,
        renderedText: true,
        brief: {
          select: {
            topic: true,
            aspectRatio: true,
            postStyle: true,
            brandKit: { select: { name: true } },
            campaign: { select: { brandKit: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.draft.count({ where }),
  ])

  // exportUrl is stored as an EXPORTS object key — sign each for the browser
  // (thumbnails). Signing is local (no network round-trip), so mapping is cheap.
  const signedDrafts = await Promise.all(
    drafts.map(async ({ headline, renderedText, brief, ...d }) => ({
      ...d,
      brief: {
        topic: brief.topic,
        aspectRatio: brief.aspectRatio,
        postStyle: brief.postStyle,
        // The explicit kit wins; a brief with none falls to its campaign's.
        brandKitName: brief.brandKit?.name ?? brief.campaign?.brandKit?.name ?? null,
      },
      exportUrl: await resolveExportUrl(d.exportUrl),
      headlineState: headlineState(parseRenderedText(renderedText), headline),
    }))
  )

  return NextResponse.json({ drafts: signedDrafts, total, page, pageSize })
})
