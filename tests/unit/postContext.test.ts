import { describe, it, expect, vi, beforeEach } from 'vitest'

// 038 D3 to D8 (AC-09, AC-11): the project context. A new post resolves live from
// the brief's project; an existing post reads its recorded stamp, and a move of the
// post to another project (Brief.projectId) never changes what it reads. Every
// read is scoped to the post's team.

const h = vi.hoisted(() => ({
  projects: {} as Record<string, { id: string; teamId: string; name: string; isDeleted: boolean }>,
  briefings: [] as Array<{ id: string; projectId: string; version: number; content: string; isActive: boolean }>,
  docs: [] as Array<{ projectId: string; teamId: string; parsedText: string; createdAt: number }>,
  kitCalls: [] as Array<{ teamId: string; opts: { brandKitId?: string | null; projectId?: string | null } }>,
  projectWhere: [] as Array<Record<string, unknown>>,
  docWhere: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findFirst: async ({ where }: { where: { id: string; teamId: string; isDeleted?: boolean } }) => {
        h.projectWhere.push(where)
        const p = h.projects[where.id]
        if (!p || p.teamId !== where.teamId) return null
        if (where.isDeleted === false && p.isDeleted) return null
        return { id: p.id, name: p.name }
      },
    },
    projectBriefing: {
      findFirst: async ({ where }: { where: { id?: string; projectId?: string; isActive?: boolean } }) => {
        const row = h.briefings.find(
          (b) =>
            (where.id === undefined || b.id === where.id) &&
            (where.projectId === undefined || b.projectId === where.projectId) &&
            (where.isActive === undefined || b.isActive === where.isActive),
        )
        return row ? { id: row.id, version: row.version, content: row.content } : null
      },
    },
    projectDocument: {
      findMany: async ({ where }: { where: { projectId: string; teamId: string } }) => {
        h.docWhere.push(where)
        return h.docs
          .filter((d) => d.projectId === where.projectId && d.teamId === where.teamId)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((d) => ({ parsedText: d.parsedText }))
      },
    },
  },
}))
vi.mock('@/lib/brandkit/resolve', () => ({
  resolveBrandKit: async (teamId: string, opts: { brandKitId?: string | null; projectId?: string | null }) => {
    h.kitCalls.push({ teamId, opts })
    return { id: opts.brandKitId ?? `kit-of-${opts.projectId ?? 'team'}`, name: 'K', source: 'project' }
  },
}))

const { newPostContext, postContext, resolveInputsFor } = await import('@/lib/projects/context')

beforeEach(() => {
  h.projects = {
    pA: { id: 'pA', teamId: 'team1', name: 'Project A', isDeleted: false },
    pB: { id: 'pB', teamId: 'team1', name: 'Project B', isDeleted: false },
    pX: { id: 'pX', teamId: 'team2', name: 'Foreign', isDeleted: false },
  }
  h.briefings = [
    { id: 'bA1', projectId: 'pA', version: 1, content: 'A old', isActive: false },
    { id: 'bA2', projectId: 'pA', version: 2, content: 'A current', isActive: true },
    { id: 'bB1', projectId: 'pB', version: 1, content: 'B only', isActive: true },
  ]
  h.docs = [
    { projectId: 'pA', teamId: 'team1', parsedText: 'doc A', createdAt: 1 },
    { projectId: 'pB', teamId: 'team1', parsedText: 'doc B1', createdAt: 2 },
    { projectId: 'pB', teamId: 'team1', parsedText: 'doc B0', createdAt: 1 },
  ]
  h.kitCalls = []
  h.projectWhere = []
  h.docWhere = []
})

describe('a new post resolves live', () => {
  it('reads the project’s active briefing, its kit and its documents', async () => {
    const ctx = await newPostContext({ teamId: 'team1', projectId: 'pA', brandKitId: null })
    expect(ctx.project).toEqual({ id: 'pA', name: 'Project A' })
    expect(ctx.briefing).toEqual({ id: 'bA2', version: 2, content: 'A current' })
    expect(ctx.inputs).toEqual({
      v: 1,
      projectId: 'pA',
      briefingId: 'bA2',
      briefingVersion: 2,
      kitId: 'kit-of-pA',
      kitSource: 'project',
    })
    expect(await ctx.documentTexts()).toEqual(['doc A'])
    expect(h.kitCalls[0]).toEqual({ teamId: 'team1', opts: { brandKitId: null, projectId: 'pA' } })
  })

  it('a project of another team reads as no project, never as an error', async () => {
    const ctx = await resolveInputsFor({ teamId: 'team1', projectId: 'pX' })
    expect(ctx.project).toBeNull()
    expect(ctx.briefing).toBeNull()
    expect(ctx.inputs.projectId).toBeNull()
    expect(await ctx.documentTexts()).toEqual([])
    expect(h.projectWhere[0]).toMatchObject({ id: 'pX', teamId: 'team1', isDeleted: false })
  })

  it('no project has no briefing and no documents', async () => {
    const ctx = await newPostContext({ teamId: 'team1', projectId: null, brandKitId: 'k1' })
    expect(ctx.briefing).toBeNull()
    expect(await ctx.documentTexts()).toEqual([])
    expect(ctx.inputs).toMatchObject({ projectId: null, briefingId: null, kitId: 'k1' })
  })
})

describe('an existing post reads its recorded stamp (AC-11)', () => {
  const stamp = { v: 1, projectId: 'pB', briefingId: 'bB1', briefingVersion: 1, kitId: 'kit-b', kitSource: 'project' }

  it('a post moved to another project still reads the stamped briefing, kit and documents', async () => {
    // The brief now names project A; the stamp says project B.
    const ctx = await postContext({
      generationInputs: stamp,
      brief: { teamId: 'team1', brandKitId: null, projectId: 'pA' } as never,
    })
    expect(ctx.project).toEqual({ id: 'pB', name: 'Project B' })
    expect(ctx.briefing?.content).toBe('B only')
    expect(ctx.kit?.id).toBe('kit-b')
    expect(await ctx.documentTexts()).toEqual(['doc B0', 'doc B1'])
    // the kit is asked for by the recorded id, with the recorded project behind it
    expect(h.kitCalls[0].opts).toEqual({ brandKitId: 'kit-b', projectId: 'pB' })
  })

  it('reads a briefing version by its id, so a newer active version is not read', async () => {
    h.briefings.push({ id: 'bB2', projectId: 'pB', version: 2, content: 'B newer', isActive: true })
    h.briefings.find((b) => b.id === 'bB1')!.isActive = false
    const ctx = await postContext({ generationInputs: stamp, brief: { teamId: 'team1' } })
    expect(ctx.briefing).toEqual({ id: 'bB1', version: 1, content: 'B only' })
  })

  it('reads a soft-deleted recorded project', async () => {
    h.projects.pB.isDeleted = true
    const ctx = await postContext({ generationInputs: stamp, brief: { teamId: 'team1' } })
    expect(ctx.project?.id).toBe('pB')
    expect(ctx.briefing?.content).toBe('B only')
    expect(h.projectWhere[0]).toEqual({ id: 'pB', teamId: 'team1' })
  })

  it('a briefing id that belongs to another project is not read', async () => {
    const ctx = await postContext({ generationInputs: { ...stamp, briefingId: 'bA2' }, brief: { teamId: 'team1' } })
    expect(ctx.briefing).toBeNull()
  })

  it('a stamp whose project is in another team reads as no project and no documents', async () => {
    const ctx = await postContext({
      generationInputs: { ...stamp, projectId: 'pX', briefingId: null },
      brief: { teamId: 'team1' },
    })
    expect(ctx.project).toBeNull()
    expect(await ctx.documentTexts()).toEqual([])
    expect(h.docWhere).toEqual([])
  })

  it('a draft with no stamp reads as no project, with the brief’s own kit', async () => {
    const ctx = await postContext({ generationInputs: null, brief: { teamId: 'team1', brandKitId: 'k7' } })
    expect(ctx.project).toBeNull()
    expect(ctx.briefing).toBeNull()
    expect(h.kitCalls[0].opts).toEqual({ brandKitId: 'k7', projectId: null })
    expect(await ctx.documentTexts()).toEqual([])
  })

  it('an unreadable stamp reads like no stamp', async () => {
    const ctx = await postContext({ generationInputs: { v: 9 }, brief: { teamId: 'team1' } })
    expect(ctx.project).toBeNull()
  })
})
