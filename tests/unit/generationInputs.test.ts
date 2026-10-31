import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 038 D3 / AC-10 / AC-15: a draft records the inputs it was generated with
// (Draft.generationInputs), written once in the draft's own create, and a retry
// reads that stamp (not the brief's current project), even after the project was
// soft-deleted. Prisma, the provider and the design runners are faked; the context
// module, the generation lifecycles and the caption store run for real.

const h = vi.hoisted(() => {
  const db = {
    draft: null as null | Record<string, unknown>,
    draftCreates: [] as Array<Record<string, unknown>>,
    draftUpdates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    projectLookups: [] as Array<Record<string, unknown>>,
    briefingLookups: [] as Array<Record<string, unknown>>,
    kitCalls: [] as Array<{ teamId: string; opts: unknown }>,
    providerCalls: [] as Array<Record<string, unknown>>,
    // the "database": one project (optionally soft-deleted) with one active briefing
    project: null as null | { id: string; name: string; isDeleted: boolean },
    briefing: null as null | { id: string; version: number; content: string },
    kit: { id: 'kit-t', name: 'Kit', source: 'team' } as Record<string, unknown> | null,
  }
  const tx = {
    teamModelPolicy: { findUnique: async () => null },
    userClaudeToken: { findFirst: async () => null },
    team: { findUnique: async () => null },
    project: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        db.projectLookups.push(args.where)
        const p = db.project
        if (!p || args.where.id !== p.id) return null
        if (args.where.isDeleted === false && p.isDeleted) return null
        return { id: p.id, name: p.name }
      },
    },
    projectBriefing: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        db.briefingLookups.push(args.where)
        return db.briefing
      },
    },
    projectDocument: { findMany: async () => [] },
    draft: {
      findUnique: async () => db.draft,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftCreates.push(data)
        return { id: 'd-new', ...data }
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.draftUpdates.push(args)
        return { id: 'd1', ...args.data }
      },
      updateMany: async () => ({ count: 1 }),
    },
    draftCaption: { updateMany: async () => ({ count: 1 }) },
    draftRevision: { create: async () => ({ id: 'rev' }), findFirst: async () => ({ revisionNumber: 1 }) },
  }
  const client = {
    ...tx,
    $transaction: async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (t: typeof tx) => Promise<unknown>)(tx),
  }
  return { db, client }
})
const db = h.db

vi.mock('@/lib/prisma', () => ({ prisma: h.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({
  resolveBrandKit: async (teamId: string, opts: unknown) => {
    db.kitCalls.push({ teamId, opts })
    return db.kit
  },
}))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({
    generateCaptions: async (brief: Record<string, unknown>, _t: unknown, model: { arg: string }) => {
      db.providerCalls.push(brief)
      return {
        raw: JSON.stringify({ headline: 'Applications are open', instagram: 'IG text', linkedin: 'LI text' }),
        modelId: model.arg,
        route: null,
      }
    },
  }),
}))
vi.mock('@/lib/agent/pathB', () => ({
  runPathBDesign: async () => ({
    htmlContent: '<html>b</html>',
    exportUrl: 'exports/b.png',
    backgroundImageUrl: null,
    background: { url: null, skip: 'NOT_NEEDED' },
  }),
}))
vi.mock('@/lib/factsCheck/refresh', () => ({
  computeFactsCheck: async () => ({ v: 1, status: 'clear', checkedAt: '2026-10-24T00:00:00.000Z', flagged: [] }),
  refreshFactsCheck: async () => {},
}))
vi.mock('@/lib/drafts/draftActions', () => ({ touchGeneration: async () => {} }))

const { createPendingDraft, generateDraftForBrief, runGenerationForDraft } = await import('@/lib/agent/generateDraft')
const { parseGenerationInputs } = await import('@/lib/projects/inputs')

const brief = (over: Record<string, unknown> = {}) =>
  ({
    id: 'b1',
    teamId: 'team1',
    userId: 'u1',
    topic: 'The brief topic',
    projectId: null,
    brandKitId: null,
    designMode: 'GENERATE',
    aspectRatio: 'SQUARE',
    copyProviderKey: null,
    ...over,
  }) as never
const actor = { userId: 'u1', teamId: 'team1', source: 'web' as const }

beforeEach(() => {
  db.draft = null
  db.draftCreates = []
  db.draftUpdates = []
  db.projectLookups = []
  db.briefingLookups = []
  db.kitCalls = []
  db.providerCalls = []
  db.project = { id: 'p1', name: 'Launch', isDeleted: false }
  db.briefing = { id: 'br2', version: 2, content: 'BRIEFING TEXT' }
  db.kit = { id: 'kit-p', name: 'Project kit', source: 'project' }
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('AC-10: the stamp is written in the draft’s own create', () => {
  it('createPendingDraft records the project, its active briefing and the resolved kit', async () => {
    await createPendingDraft(brief({ projectId: 'p1' }))
    expect(db.draftCreates).toHaveLength(1)
    expect(db.draftCreates[0].generationInputs).toEqual({
      v: 1,
      projectId: 'p1',
      briefingId: 'br2',
      briefingVersion: 2,
      kitId: 'kit-p',
      kitSource: 'project',
    })
    // the live path asks for a live project of this team, and a kit through the one resolver
    expect(db.projectLookups[0]).toMatchObject({ id: 'p1', teamId: 'team1', isDeleted: false })
    expect(db.kitCalls[0]).toEqual({ teamId: 'team1', opts: { brandKitId: null, projectId: 'p1' } })
  })

  it('an unassigned brief writes nulls with the kit’s source', async () => {
    db.kit = { id: 'kit-t', name: 'Kit', source: 'team' }
    await createPendingDraft(brief())
    expect(db.draftCreates[0].generationInputs).toEqual({
      v: 1,
      projectId: null,
      briefingId: null,
      briefingVersion: null,
      kitId: 'kit-t',
      kitSource: 'team',
    })
    expect(db.projectLookups).toHaveLength(0)
  })

  it('a project that is not a live project of the team is read as no project', async () => {
    db.project = { id: 'p1', name: 'Gone', isDeleted: true }
    await createPendingDraft(brief({ projectId: 'p1' }))
    expect(db.draftCreates[0].generationInputs).toMatchObject({ projectId: null, briefingId: null })
  })

  it('generateDraftForBrief writes the same stamp in its create, and the briefing reaches the caption call', async () => {
    await generateDraftForBrief(brief({ projectId: 'p1' }), actor)
    expect(db.draftCreates).toHaveLength(1)
    expect(db.draftCreates[0].generationInputs).toMatchObject({
      v: 1,
      projectId: 'p1',
      briefingId: 'br2',
      briefingVersion: 2,
      kitId: 'kit-p',
      kitSource: 'project',
    })
    expect(db.providerCalls[0].projectBriefing).toBe('BRIEFING TEXT')
  })
})

describe('AC-15: a retry reads the recorded stamp, not the brief’s current project', () => {
  it('after the stamped project was soft-deleted, the stamped briefing is still read and the draft completes', async () => {
    db.project = { id: 'p1', name: 'Launch', isDeleted: true }
    db.draft = {
      id: 'd1',
      templateId: null,
      generationInputs: { v: 1, projectId: 'p1', briefingId: 'br2', briefingVersion: 2, kitId: 'kit-p', kitSource: 'project' },
      // D9: the delete unassigned the brief, so the brief no longer names the project
      brief: brief({ projectId: null }),
    }
    await runGenerationForDraft('d1', actor)
    // the recorded briefing is read by its id, in the recorded project
    expect(db.briefingLookups[0]).toMatchObject({ id: 'br2', projectId: 'p1' })
    // the project lookup of the recorded path does not filter out a deleted row
    expect(db.projectLookups[0]).toEqual({ id: 'p1', teamId: 'team1' })
    expect(db.providerCalls[0].projectBriefing).toBe('BRIEFING TEXT')
    // the kit is the recorded one, asked for by id with the recorded project behind it
    expect(db.kitCalls[0].opts).toEqual({ brandKitId: 'kit-p', projectId: 'p1' })
    // completed, and the stamp was not rewritten
    expect(db.draftUpdates.some((u) => u.data.status === 'EXPORTED')).toBe(true)
    expect(db.draftUpdates.some((u) => 'generationInputs' in u.data)).toBe(false)
  })

  it('a draft made before 038 (no stamp) reads as no project: the brief’s own kit, no briefing', async () => {
    db.draft = { id: 'd1', templateId: null, generationInputs: null, brief: brief({ projectId: 'p1', brandKitId: 'k9' }) }
    await runGenerationForDraft('d1', actor)
    expect(db.briefingLookups).toHaveLength(0)
    expect(db.kitCalls[0].opts).toEqual({ brandKitId: 'k9', projectId: null })
    expect(db.providerCalls[0].projectBriefing).toBeUndefined()
  })
})

describe('parseGenerationInputs', () => {
  const good = { v: 1, projectId: 'p1', briefingId: 'b', briefingVersion: 3, kitId: 'k', kitSource: 'explicit' }

  it('reads a valid stamp and accepts nulls', () => {
    expect(parseGenerationInputs(good)).toEqual(good)
    expect(
      parseGenerationInputs({ v: 1, projectId: null, briefingId: null, briefingVersion: null, kitId: null, kitSource: null }),
    ).toMatchObject({ projectId: null })
  })

  it('rejects a malformed value and returns null, never throws', () => {
    for (const bad of [null, undefined, 'x', 7, {}, { ...good, v: 2 }, { ...good, kitSource: 'campaign' }, { ...good, briefingVersion: 0 }])
      expect(parseGenerationInputs(bad)).toBeNull()
  })
})
