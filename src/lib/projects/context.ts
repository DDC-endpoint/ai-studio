// The project context of a post (038 D6): the kit, the briefing and the project a
// generation reads, in one branded value.
//
//   new post (live)          newPostContext(brief) / resolveInputsFor(...)
//   existing post (recorded) postContext(draft), which reads Draft.generationInputs
//
// This is the only file that reads ProjectBriefing, and, outside the document
// routes, ProjectDocument. It is also the only caller of resolveBrandKit besides
// the admin look probe. The brand below is not exported, so no other file can
// build a PostContext: `buildBriefInput`, `runPathADesign`, `runPathBDesign`,
// `generateBackgroundForBrief` and `loadFactsSources` take one, and a new call
// cannot reach the briefing or the kit without it (tests/unit/postContextSites.test.ts).
import { prisma } from '@/lib/prisma'
import { resolveBrandKit, type ResolvedBrandKit } from '@/lib/brandkit/resolve'
import {
  NO_PROJECT_INPUTS,
  parseGenerationInputs,
  type GenerationInputs,
  type KitSource,
} from './inputs'

declare const brand: unique symbol

export interface PostContextBriefing {
  id: string
  version: number
  content: string
}

export type PostContext = {
  readonly teamId: string
  /** The stamp to write on a new draft, or the recorded one. */
  readonly inputs: GenerationInputs
  readonly project: { id: string; name: string } | null
  readonly kit: ResolvedBrandKit | null
  readonly briefing: PostContextBriefing | null
  /** The parsed text of the recorded project's documents (the facts check reads it). */
  documentTexts(): Promise<string[]>
} & { readonly [brand]: true }

function make(parts: Omit<PostContext, typeof brand>): PostContext {
  return parts as PostContext
}

function documentsLoader(teamId: string, projectId: string | null): () => Promise<string[]> {
  return async () => {
    if (!projectId) return []
    const docs = await prisma.projectDocument.findMany({
      where: { projectId, teamId },
      orderBy: { createdAt: 'asc' },
      select: { parsedText: true },
    })
    return docs.map((d) => d.parsedText)
  }
}

/**
 * Resolves the inputs live: the project's active briefing and the kit by
 * explicit kit, then the project's default, then the team default. The caller
 * has already checked `projectId` against the team (D12); a project that is not
 * a live row of this team is read as "no project" here, never as an error.
 */
export async function resolveInputsFor(args: {
  teamId: string
  projectId?: string | null
  brandKitId?: string | null
}): Promise<PostContext> {
  const { teamId } = args
  const project = args.projectId
    ? await prisma.project.findFirst({
        where: { id: args.projectId, teamId, isDeleted: false },
        select: { id: true, name: true },
      })
    : null
  const [kit, briefing] = await Promise.all([
    resolveBrandKit(teamId, { brandKitId: args.brandKitId, projectId: project?.id ?? null }),
    project
      ? prisma.projectBriefing.findFirst({
          where: { projectId: project.id, isActive: true },
          select: { id: true, version: true, content: true },
        })
      : null,
  ])
  const inputs: GenerationInputs = project
    ? {
        v: 1,
        projectId: project.id,
        briefingId: briefing?.id ?? null,
        briefingVersion: briefing?.version ?? null,
        kitId: kit?.id ?? null,
        kitSource: (kit?.source as KitSource | undefined) ?? null,
      }
    : NO_PROJECT_INPUTS(kit)
  return make({
    teamId,
    inputs,
    project,
    kit,
    briefing,
    documentTexts: documentsLoader(teamId, project?.id ?? null),
  })
}

/** A new post: resolved live from the brief. */
export function newPostContext(brief: {
  teamId: string
  projectId?: string | null
  brandKitId?: string | null
}): Promise<PostContext> {
  return resolveInputsFor({
    teamId: brief.teamId,
    projectId: brief.projectId,
    brandKitId: brief.brandKitId,
  })
}

/**
 * An existing post: read from the draft's recorded stamp, not from the brief's
 * current assignment (D3, D4, D8). A null stamp is a post made before 038: the
 * brief's own kit, then the team default, with no briefing and no documents.
 * The recorded project may be soft-deleted and still supplies its kit,
 * briefing version and documents.
 */
export async function postContext(draft: {
  generationInputs?: unknown
  brief: { teamId: string; brandKitId?: string | null }
}): Promise<PostContext> {
  const { teamId } = draft.brief
  const stamp = parseGenerationInputs(draft.generationInputs)
  const recorded: GenerationInputs = stamp ?? {
    v: 1,
    projectId: null,
    briefingId: null,
    briefingVersion: null,
    kitId: draft.brief.brandKitId ?? null,
    kitSource: null,
  }
  const project = recorded.projectId
    ? await prisma.project.findFirst({
        where: { id: recorded.projectId, teamId },
        select: { id: true, name: true },
      })
    : null
  const [kit, briefing] = await Promise.all([
    resolveBrandKit(teamId, { brandKitId: recorded.kitId, projectId: project?.id ?? null }),
    project && recorded.briefingId
      ? prisma.projectBriefing.findFirst({
          where: { id: recorded.briefingId, projectId: project.id },
          select: { id: true, version: true, content: true },
        })
      : null,
  ])
  return make({
    teamId,
    inputs: stamp ?? NO_PROJECT_INPUTS(kit),
    project,
    kit,
    briefing,
    documentTexts: documentsLoader(teamId, project?.id ?? null),
  })
}
