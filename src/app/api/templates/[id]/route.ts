import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'

// Reads one brand-kit template, HTML included, for the viewer previews. The list
// route never returns HTML because a single template can be ~1.8 MB; the wizard
// fetches only the selected one. Available to any signed-in team member. Another
// team's template, a deleted kit's template and an unknown id all answer the same 404.
export const GET = withTeamAuth<{ id: string }>(async (_req, { params }, user) => {
  const { id } = params

  // BrandKitTemplate has no teamId of its own — scope via its parent kit.
  const template = await prisma.brandKitTemplate.findFirst({
    where: { id, brandKit: { isDeleted: false, teamId: user.teamId } },
    select: { id: true, name: true, aspectRatio: true, htmlTemplate: true },
  })

  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: template.id,
    name: template.name,
    aspectRatio: template.aspectRatio,
    htmlTemplate: template.htmlTemplate,
  })
})
