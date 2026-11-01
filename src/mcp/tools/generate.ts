import { prisma } from '@/lib/prisma'
import { generateDraftForBrief, NoBrandKitError } from '@/lib/agent/generateDraft'
import { resolveExportUrl } from '@/lib/storage/minio'
import { getSystemUserId } from '@/mcp/systemUser'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { loadDraftCaptions } from '@/lib/captions/store'
import { externalCaptions } from '@/lib/captions/external'
import { resolvePostStyle, styleSummary } from '@/lib/postStyles'
import { parseFactsCheck } from '@/lib/factsCheck/types'

interface GeneratePostArgs {
  topic: string
  /** Legacy (027): picks a style only when no postStyle is given; ignored otherwise. */
  goal?: string
  tone?: string
  /** 027: a post style key (see the tool schema). An unknown key is an error. */
  postStyle?: string
  designMode: 'TEMPLATE' | 'GENERATE'
  copyProviderKey?: string
  /** 038: a project id; its briefing, documents, default kit and default post style apply. */
  projectId?: string
  description?: string
  /** The calling ApiKey's team (resolved by the ACP route / MCP server via resolveApiKey). */
  teamId: string
}

// 038 D13: the retired campaign field is refused by name, never ignored, so a
// stale caller fails loudly instead of silently losing its briefing and kit.
export class CampaignRetiredError extends Error {
  readonly code = 'CAMPAIGN_RETIRED'
  constructor() {
    super('campaignId is retired; use projectId')
    this.name = 'CampaignRetiredError'
  }
}

// A projectId that is not a live project of the key's team (unknown, deleted or
// foreign: one answer, NFR-07). The brief is never created, and the id is never
// read as "no project".
export class ProjectNotFoundError extends Error {
  readonly code = 'PROJECT_NOT_FOUND'
  constructor() {
    super('Project not found')
    this.name = 'ProjectNotFoundError'
  }
}

// The text MCP returns for an input refusal: `CODE: message`. Null for any other error.
export function refusalText(err: unknown): string | null {
  if (err instanceof CampaignRetiredError || err instanceof ProjectNotFoundError) return `${err.code}: ${err.message}`
  return null
}

// ACP entry point for post generation — a thin adapter over the same Path B
// pipeline the web routes use (runPathBDesign), so aspect ratio, brand-kit
// precedence, the team's model policy and system defaults (src/lib/models),
// and CLI/API dispatch can never drift from the app. TEMPLATE mode needs a
// template selection this surface doesn't have.
export async function generatePost(args: GeneratePostArgs, surface: 'mcp' | 'acp' = 'mcp') {
  // 1. The retired field, before anything else is read or created.
  if ('campaignId' in args || 'campaign' in args) throw new CampaignRetiredError()

  // 039 D21: a `channels` argument from an older caller is ignored (it selected
  // no output; Brief.channels is deprecated).

  if (args.designMode === 'TEMPLATE') {
    throw new Error(
      'TEMPLATE mode is not supported via ACP — it requires selecting a brand template. Use GENERATE, or create the post in the web app.'
    )
  }

  // 2. The caller's team comes from its resolved ApiKey. An explicit projectId
  // must be a live project of that same team (D12), otherwise the new Brief would
  // inherit the kit, briefing and style of a project the caller has no claim to.
  let project: { id: string; defaultPostStyle: string | null; defaultTone: string | null } | null = null
  if (args.projectId) {
    // MCP passes its arguments unvalidated: a non-string must not reach Prisma as a filter.
    if (typeof args.projectId !== 'string') throw new ProjectNotFoundError()
    project = await prisma.project.findFirst({
      where: { id: args.projectId, teamId: args.teamId, isDeleted: false },
      select: { id: true, defaultPostStyle: true, defaultTone: true },
    })
    if (!project) throw new ProjectNotFoundError()
  }

  // 027 FR-06: the one resolution (explicit key, else the legacy goal, else the
  // project default, else General). An unknown key is a named error; it never
  // degrades to "no style". Unattended, so any image style resolves to classic.
  const resolved = resolvePostStyle({
    style: args.postStyle,
    legacyGoal: args.goal,
    project,
    explicit: { tone: args.tone },
    path: 'B',
    aspectRatio: 'SQUARE',
    surface: surface,
  })
  if (!resolved.ok) throw new Error(resolved.message)

  // Create the Brief row first so copy + design run off the same record the
  // web pipeline would use.
  const brief = await prisma.brief.create({
    data: {
      teamId: args.teamId,
      userId: await getSystemUserId(args.teamId),
      topic: args.topic,
      description: args.description,
      postStyle: resolved.key,
      goal: resolved.goal,
      tone: resolved.tone,
      imageStyle: resolved.imageStyle,
      designMode: args.designMode,
      copyProviderKey: args.copyProviderKey ?? 'env-default',
      projectId: project?.id ?? null,
    },
  })

  // Shared brief→draft orchestrator: kit precedence (project default →
  // team default; no explicit kit on this surface), the project briefing, copy,
  // Path B design, Draft persistence — identical to the web routes. MCP/ACP
  // callers hold server API keys (M2M trust boundary), not app-user sessions,
  // so there is no personal-token tier here — userId: null skips straight to
  // the caller's TEAM Claude credential (and, for the IMAGE provider, the
  // team's default — see resolveImageProvider). The whole model-calling span
  // (copy → background image → design) runs inside withClaudeAuth so every
  // `claude -p` it spawns shares that one resolved team credential; a team
  // with none throws the usual no-credential ClaudeCliError, caught below like any other generation failure.
  // args.teamId ?? '' guards a malformed/legacy caller — the
  // GeneratePostArgs type already requires teamId, so this is defense in depth.
  const teamId = args.teamId ?? ''
  try {
    const { draft } = await withClaudeAuth(null, teamId, () =>
      generateDraftForBrief(brief, { userId: null, teamId, source: 'mcp' })
    )
    return {
      draftId: draft.id,
      exportUrl: await resolveExportUrl(draft.exportUrl),
      htmlContent: draft.htmlContent,
      headline: draft.headline,
      captions: await captionList(draft.id, draft.factsCheck),
      postStyle: resolved.key,
      factsCheck: factsCheckResult(draft.factsCheck),
    }
  } catch (err) {
    if (err instanceof NoBrandKitError) {
      throw new Error(
        'No brand kit found — configure a brand kit for this project, or ask a team admin to set a team default.'
      )
    }
    throw err
  }
}

// The facts check as a machine caller sees it (027 FR-13): the status and the
// flagged values with where they are, never any text. Null = never checked.
function factsCheckResult(raw: unknown) {
  const check = parseFactsCheck(raw)
  return check ? { status: check.status, flagged: check.flagged } : null
}

// The external caption list (039 D20): the general caption, then any curated
// captions, each with its facts and rules (externalCaptions). Read through the
// loader. The kit website that a Facebook caption's rules check against joins in
// 039 T4 (the second argument's null until then).
async function captionList(draftId: string, factsCheck: unknown) {
  const loaded = await loadDraftCaptions(draftId)
  return externalCaptions(loaded, parseFactsCheck(factsCheck), null)
}

export async function getDraft(args: { id: string; teamId: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.id },
    select: {
      headline: true,
      imageUrl: true,
      exportUrl: true,
      status: true,
      teamId: true,
      postStyle: true,
      factsCheck: true,
    },
  })
  // Task 13 (reviewer follow-up): same team-bound guard as the other tools: a
  // draft belonging to a different team (or the pre-tenancy null) reads as
  // "not found" rather than leaking its existence/content across tenants.
  if (!draft || draft.teamId !== args.teamId) throw new Error(`Draft ${args.id} not found`)
  const captions = await captionList(args.id, draft.factsCheck)
  // exportUrl is stored as an EXPORTS object key — sign it for the caller.
  const { teamId: _teamId, postStyle, factsCheck, ...rest } = draft
  return {
    ...rest,
    postStyle: styleSummary(postStyle)?.key ?? null,
    factsCheck: factsCheckResult(factsCheck),
    captions,
    exportUrl: await resolveExportUrl(draft.exportUrl),
  }
}
