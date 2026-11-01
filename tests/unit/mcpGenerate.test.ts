import { describe, it, expect, vi, beforeEach } from 'vitest'

// 038 D13 / AC-06: generate_post refuses the retired campaign field by name and a
// project outside the key's team with the one not-found answer. In both cases no
// brief is created and nothing is generated.

const h = vi.hoisted(() => ({
  briefCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'b1', ...data })),
  projectFind: vi.fn(),
  generate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brief: { create: h.briefCreate },
    project: { findFirst: h.projectFind },
    draft: { findUnique: vi.fn() },
  },
}))
vi.mock('@/mcp/systemUser', () => ({ getSystemUserId: async () => 'sys-user' }))
vi.mock('@/lib/agent/userToken', () => ({ withClaudeAuth: async (_u: unknown, _t: unknown, fn: () => unknown) => fn() }))
vi.mock('@/lib/agent/generateDraft', () => ({
  NoBrandKitError: class NoBrandKitError extends Error {},
  generateDraftForBrief: h.generate,
}))
vi.mock('@/lib/captions/store', () => ({ loadDraftCaptions: async () => ({ general: null, curated: [] }) }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async (k: string | null) => k }))
// 039 D17: the kit website for the caption rules (none here).
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))

const { generatePost, CampaignRetiredError, ProjectNotFoundError, refusalText } = await import('@/mcp/tools/generate')

const base = { topic: 'Launch', channels: ['INSTAGRAM'], designMode: 'GENERATE' as const, teamId: 'team1' }

beforeEach(() => {
  h.briefCreate.mockClear()
  h.projectFind.mockReset()
  h.generate.mockReset().mockResolvedValue({
    draft: { id: 'd1', exportUrl: 'exports/x.png', htmlContent: '<html/>', headline: 'H', factsCheck: null },
  })
})

describe('the retired campaign field', () => {
  it.each([
    ['campaignId', { campaignId: 'c1' }],
    ['an empty campaignId', { campaignId: '' }],
    ['campaign', { campaign: 'c1' }],
  ])('%s throws CampaignRetiredError before anything is read or created', async (_name, extra) => {
    await expect(generatePost({ ...base, ...extra } as never)).rejects.toBeInstanceOf(CampaignRetiredError)
    expect(h.projectFind).not.toHaveBeenCalled()
    expect(h.briefCreate).not.toHaveBeenCalled()
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('carries the code and the text', async () => {
    const err = await generatePost({ ...base, campaignId: 'c1' } as never).catch((e) => e)
    expect(err.code).toBe('CAMPAIGN_RETIRED')
    expect(err.message).toBe('campaignId is retired; use projectId')
    expect(refusalText(err)).toBe('CAMPAIGN_RETIRED: campaignId is retired; use projectId')
  })
})

describe('projectId', () => {
  it('an unknown or foreign project throws ProjectNotFoundError and creates no brief', async () => {
    h.projectFind.mockResolvedValue(null)
    const err = await generatePost({ ...base, projectId: 'p-foreign' }).catch((e) => e)
    expect(err).toBeInstanceOf(ProjectNotFoundError)
    expect(err.code).toBe('PROJECT_NOT_FOUND')
    expect(refusalText(err)).toBe('PROJECT_NOT_FOUND: Project not found')
    expect(h.briefCreate).not.toHaveBeenCalled()
    expect(h.generate).not.toHaveBeenCalled()
    // the lookup is team-scoped and live-only
    expect(h.projectFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-foreign', teamId: 'team1', isDeleted: false } }),
    )
  })

  it('a non-string projectId is a ProjectNotFoundError and never reaches Prisma as a filter', async () => {
    const err = await generatePost({ ...base, projectId: { not: 'x' } } as never).catch((e) => e)
    expect(err).toBeInstanceOf(ProjectNotFoundError)
    expect(h.projectFind).not.toHaveBeenCalled()
    expect(h.briefCreate).not.toHaveBeenCalled()
  })

  it('a live project is stored on the brief and its default style applies', async () => {
    h.projectFind.mockResolvedValue({ id: 'p1', defaultPostStyle: 'event', defaultTone: null })
    const out = await generatePost({ ...base, projectId: 'p1' })
    expect(out.postStyle).toBe('event')
    expect(h.briefCreate.mock.calls[0][0].data).toMatchObject({ projectId: 'p1', postStyle: 'event' })
  })

  it('no projectId stores a null project', async () => {
    await generatePost(base)
    expect(h.briefCreate.mock.calls[0][0].data).toMatchObject({ projectId: null, postStyle: 'general' })
    expect(h.briefCreate.mock.calls[0][0].data).not.toHaveProperty('campaignId')
  })

  // 039 D21: a `channels` argument from an older caller is ignored: it is not
  // refused, and the brief is created without it.
  it('a channels argument is ignored: no error, and brief.create receives no channels', async () => {
    await expect(generatePost({ ...base, channels: ['WHATSAPP'] } as never)).resolves.toBeDefined()
    expect(h.briefCreate.mock.calls[0][0].data).not.toHaveProperty('channels')
  })

  it('refusalText is null for any other error', () => {
    expect(refusalText(new Error('boom'))).toBeNull()
  })
})
