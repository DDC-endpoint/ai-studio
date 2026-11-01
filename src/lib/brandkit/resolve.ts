import { prisma } from '@/lib/prisma'
import type { BrandKit, BrandKitPrompt, BrandKitArtifact } from '@prisma/client'
import { buildLogoList, type LogoEntry } from '@/lib/brandkit/logos'

type KitWithPrompts = BrandKit & { prompts: BrandKitPrompt[]; artifacts?: BrandKitArtifact[] }

export type BrandKitSource = 'explicit' | 'project' | 'team'

export interface ResolvedBrandKit {
  id: string
  name: string
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  // 031 FR-21: { [script]: family } (only `sinhala` is offered); null = none. Optional so a
  // hand-built kit (tests, fixtures) needs no change; resolveBrandKit always sets it.
  scriptFonts?: Record<string, string> | null
  logoUrl: string | null
  logos: LogoEntry[]
  voicePrompt: string | null
  // 039 D6: the kit's https website (null = none); code inserts it into a Facebook caption.
  website: string | null
  source: BrandKitSource
}

// A tolerant read of BrandKit.scriptFonts: string values only; anything else is null.
function scriptFontsOf(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'string') out[k] = v
  return Object.keys(out).length > 0 ? out : null
}

function normalise(kit: KitWithPrompts, source: BrandKitSource): ResolvedBrandKit {
  return {
    id: kit.id,
    name: kit.name,
    colors: Array.isArray(kit.colors) ? (kit.colors as string[]) : [],
    fonts: Array.isArray(kit.fonts) ? (kit.fonts as Array<{ name: string; url: string }>) : [],
    scriptFonts: scriptFontsOf(kit.scriptFonts),
    logoUrl: kit.logoUrl ?? null,
    logos: buildLogoList(
      (kit.artifacts ?? []).map((a) => ({ name: a.name, url: a.url })),
      kit.logoUrl ?? null,
    ),
    voicePrompt: kit.prompts[0]?.content ?? null,
    website: kit.website ?? null,
    source,
  }
}

const PROMPT_INCLUDE = {
  prompts: { where: { isActive: true }, take: 1 },
  artifacts: { where: { type: 'LOGO' as const }, orderBy: { createdAt: 'asc' as const } },
} as const

// Resolves brand kit precedence (038 D5):
//   explicit brief kit → the project's default kit → team default
// `brandKitId` is the brief's own selection (Brief.brandKitId) and wins when set
// and the kit still exists; a deleted, missing or foreign kit at a tier is skipped.
//
// `teamId` is REQUIRED and scopes every tier, including the last-resort team
// default: an unscoped `findFirst({ isDefault: true })` once leaked another
// team's default kit (final review C1). Every id is checked against the team
// here too, because this function must never trust an id alone.
//
// The project row itself may be soft-deleted: a recorded project still supplies
// its default kit, so a regenerate after a delete resolves the same kit.
//
// Only src/lib/projects/context.ts and the admin look probe import this
// (tests/unit/kitResolverBoundary.test.ts).
export async function resolveBrandKit(
  teamId: string,
  { brandKitId, projectId }: { brandKitId?: string | null; projectId?: string | null } = {},
): Promise<ResolvedBrandKit | null> {
  if (brandKitId) {
    const explicit = await prisma.brandKit.findFirst({
      where: { id: brandKitId, teamId, isDeleted: false },
      include: PROMPT_INCLUDE,
    })
    if (explicit) return normalise(explicit, 'explicit')
  }

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, teamId },
      include: { defaultBrandKit: { include: PROMPT_INCLUDE } },
    })
    const projectKit = project?.defaultBrandKit
    if (projectKit && !projectKit.isDeleted && projectKit.teamId === teamId) {
      return normalise(projectKit, 'project')
    }
  }

  const teamKit = await prisma.brandKit.findFirst({
    where: { teamId, isDefault: true, isDeleted: false },
    include: PROMPT_INCLUDE,
  })

  return teamKit ? normalise(teamKit, 'team') : null
}
