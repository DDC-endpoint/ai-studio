// 008 FR-20 (T16): GET /api/drafts/[id] carries `captionProviderIsClaude` for
// THIS draft — the brief's own caption provider key, else the team default —
// through the same copyProviderIsClaude lookup regenerate-copy refuses a pick
// on, so the draft page's caption pickers hide exactly when the server would
// refuse them (spec open question 1; reviews/T13.md NOTE).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  draftUpdateMany: vi.fn(),
  providerFindMany: vi.fn(),
  teamFindUnique: vi.fn(),
  copyProviderIsClaude: vi.fn(),
  resolveBrandKit: vi.fn(),
  projectFindFirst: vi.fn(),
  briefingFindFirst: vi.fn(),
  saveHeadlineEdit: vi.fn(),
  canEditPost: vi.fn(() => true),
  trackHeadlineEdited: vi.fn(),
  loaded: vi.fn(() => ({ general: null, curated: [] }) as unknown),
  renderBoom: vi.fn(() => {
    throw new Error('the GET must not render or parse')
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: h.draftFindUnique, updateMany: h.draftUpdateMany },
    availableProvider: { findMany: h.providerFindMany },
    team: { findUnique: h.teamFindUnique },
    project: { findFirst: h.projectFindFirst },
    projectBriefing: { findFirst: h.briefingFindFirst },
  },
}))
// 030 AC-10: the renderer and the mock check throw if reached, to show the read
// side parses and renders nothing. The emitter is a spy.
vi.mock('@/lib/renderer/puppeteer', () => ({ renderPost: h.renderBoom, renderHtmlToPng: h.renderBoom }))
vi.mock('@/lib/renderedText/mockCheck', () => ({ mockHeadlineCheck: h.renderBoom }))
vi.mock('@/lib/renderedText/track', () => ({ trackHeadlineEdited: h.trackHeadlineEdited }))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap, withTeamAdmin: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({
  canView: () => true,
  canEditPost: h.canEditPost,
  NOT_AUTHOR: { error: 'not author', code: 'not-author' },
}))
// The real copyProviderIsClaude behind a spy: the call-argument cases stub it,
// and the select case (018 FR-04) lets it run against the faked Prisma row.
vi.mock('@/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/providers/registry')>()
  h.copyProviderIsClaude.mockImplementation(actual.copyProviderIsClaude)
  return { copyProviderIsClaude: h.copyProviderIsClaude }
})
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: h.resolveBrandKit }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async () => null }))
vi.mock('@/lib/drafts/revisions', async () => {
  // The real tolerant parse: the GET reads the stamp through it (009 FR-15).
  const { parseCompositionStamp } = await import('@/lib/designData')
  return {
    COMMITTED_REVISION: {},
    resolveNotAppliedOutcome: async () => null,
    draftCompositionStamp: (d: { composition?: unknown }) => parseCompositionStamp(d.composition),
  }
})
vi.mock('@/lib/captions/store', () => ({
  loadDraftCaptions: async () => h.loaded(),
  saveCaptionEdit: vi.fn(),
  saveHeadlineEdit: h.saveHeadlineEdit,
  settlePendingCaptions: vi.fn(),
}))

const { GET, PATCH } = await import('@/app/api/drafts/[id]/route')
const realCopyProviderIsClaude = h.copyProviderIsClaude.getMockImplementation()!

// A settled, exported draft: nothing for the recovery sweep to write.
function exportedDraft(copyProviderKey: string | null) {
  const now = new Date()
  return {
    id: 'd1',
    briefId: 'b1',
    teamId: 'team1',
    status: 'EXPORTED',
    failureReason: null,
    pendingAction: null,
    pendingActionClaimId: null,
    pendingActionError: null,
    pendingConflict: null,
    updatedAt: now,
    createdAt: now,
    exportUrl: 'exports/d1.png',
    htmlContent: '<html></html>',
    currentRevisionNumber: 1,
    headline: 'H',
    renderedText: null as unknown,
    headlineModel: null,
    headlineModelSubstitutedFrom: null,
    designModel: null,
    designModelSubstitutedFrom: null,
    imageUrl: null,
    backgroundSkipReason: null,
    backgroundSkipDetail: null,
    _count: { revisions: 1 },
    brief: {
      id: 'b1',
      userId: 'u1',
      teamId: 'team1',
      brandKitId: null,
      copyProviderKey,
      topic: 'T',
      goal: null,
      tone: null,
      aspectRatio: 'SQUARE',
      designMode: 'GENERATE',
    },
  }
}

async function get() {
  const res = (await GET(new Request('http://test/x') as never, { params: { id: 'd1' } } as never)) as Response
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  h.draftFindUnique.mockReset()
  h.draftUpdateMany.mockReset().mockResolvedValue({ count: 1 })
  // 024: the lookup reads the team's setting and its enabled COPY rows (never a key).
  h.providerFindMany.mockReset().mockResolvedValue([])
  h.teamFindUnique.mockReset().mockResolvedValue(null)
  h.copyProviderIsClaude.mockReset()
  h.copyProviderIsClaude.mockImplementation(realCopyProviderIsClaude)
  h.resolveBrandKit.mockReset()
  h.resolveBrandKit.mockResolvedValue(null)
  h.projectFindFirst.mockReset().mockResolvedValue(null)
  h.briefingFindFirst.mockReset().mockResolvedValue(null)
  h.saveHeadlineEdit.mockReset().mockResolvedValue(true)
  h.trackHeadlineEdited.mockReset().mockResolvedValue(undefined)
  h.renderBoom.mockClear()
  h.loaded.mockReset().mockReturnValue({ general: null, curated: [] })
  h.canEditPost.mockReset().mockReturnValue(true)
})

describe("GET /api/drafts/[id] — captionProviderIsClaude is the draft's own", () => {
  it("asks about the brief's own caption provider key, on the brief's team", async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft('openai-copy'))
    h.copyProviderIsClaude.mockResolvedValue(false)
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(h.copyProviderIsClaude).toHaveBeenCalledWith('team1', 'openai-copy')
    expect(body.captionProviderIsClaude).toBe(false)
  })

  it('a brief with no key asks about the team default (undefined key), and true passes through', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(h.copyProviderIsClaude).toHaveBeenCalledWith('team1', undefined)
    expect(body.captionProviderIsClaude).toBe(true)
  })

  it('carries canEdit from canEditPost (038 D11)', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.copyProviderIsClaude.mockResolvedValue(true)
    expect((await get()).body.canEdit).toBe(true)
    h.canEditPost.mockReturnValue(false)
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.canEdit).toBe(false)
    expect(h.canEditPost).toHaveBeenLastCalledWith(expect.anything(), { teamId: 'team1', ownerId: 'u1' })
  })

  it('PATCH by a member who cannot edit is 403 not-author and saves nothing', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.canEditPost.mockReturnValue(false)
    const res = (await PATCH(
      new Request('http://test/x', { method: 'PATCH', body: JSON.stringify({ headline: 'New' }) }) as never,
      { params: { id: 'd1' } } as never,
    )) as Response
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('not-author')
    expect(h.saveHeadlineEdit).not.toHaveBeenCalled()
  })

  it('a missing draft is 404 and asks nothing', async () => {
    h.draftFindUnique.mockResolvedValue(null)
    const { status } = await get()
    expect(status).toBe(404)
    expect(h.copyProviderIsClaude).not.toHaveBeenCalled()
  })
})

describe('GET /api/drafts/[id] — the provider lookup per poll (018 FR-04)', () => {
  it('reads the enabled COPY rows of the team in one query, selecting no key (018 FR-04, 024 FR-03)', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft('openai-copy'))
    h.providerFindMany.mockResolvedValue([
      { id: 'r1', providerKey: 'openai-copy', providerName: 'openai', isDefault: false, createdAt: new Date(0) },
    ])
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(h.providerFindMany).toHaveBeenCalledTimes(1)
    expect(h.providerFindMany).toHaveBeenCalledWith({
      where: { slot: 'COPY', teamId: 'team1', isEnabled: true },
      select: { id: true, providerKey: true, providerName: true, isDefault: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    expect(body.captionProviderIsClaude).toBe(false)
  })

  it('runs the provider lookup alongside the brand-kit read, not after it', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    let releaseKit!: (kit: { name: string }) => void
    h.resolveBrandKit.mockReturnValue(new Promise((resolve) => (releaseKit = resolve)))
    const pending = get()
    await vi.waitFor(() => expect(h.copyProviderIsClaude).toHaveBeenCalled())
    releaseKit({ name: 'Kit' })
    const { body } = await pending
    expect(body.brandKitName).toBe('Kit')
    expect(body.captionProviderIsClaude).toBe(true)
  })
})

// 019 FR-06 / FR-07 / AC-05: the sweep's clear is guarded on the claim it
// OBSERVED, and a null token (an older image's claim) is swept all the same.
describe('GET /api/drafts/[id] — the stale-action sweep is guarded on the observed claim (019)', () => {
  const STALE_AT = new Date(Date.now() - 20 * 60_000)
  const stale = (claimId: string | null) => ({
    ...exportedDraft(null),
    pendingAction: 'REFINE',
    pendingActionClaimId: claimId,
    updatedAt: STALE_AT,
  })

  it('clears with a WHERE carrying the observed action and token, and nulls the token', async () => {
    h.draftFindUnique.mockResolvedValue(stale('tok-1'))
    const { body } = await get()
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: {
        pendingAction: null,
        pendingActionClaimId: null,
        pendingActionError: 'The action was interrupted. Please try again.',
      },
    })
    expect(body.pendingAction).toBeNull()
  })

  it('sweeps a stale row whose token is null (claimed by an older image): the WHERE matches IS NULL', async () => {
    h.draftFindUnique.mockResolvedValue(stale(null))
    await get()
    expect(h.draftUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1', pendingAction: 'REFINE', pendingActionClaimId: null } }),
    )
  })

  it('a sweep whose observed token no longer matches writes nothing to the row', async () => {
    // A stateful fake: R2 claimed (tok-2) between the sweep's read (tok-1) and its clear.
    const row = { pendingAction: 'REFINE', pendingActionClaimId: 'tok-2', pendingActionError: null as string | null }
    h.draftUpdateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where.pendingAction !== row.pendingAction || where.pendingActionClaimId !== row.pendingActionClaimId) {
        return { count: 0 }
      }
      Object.assign(row, data)
      return { count: 1 }
    })
    h.draftFindUnique.mockResolvedValue(stale('tok-1'))
    await get()
    expect(row).toEqual({ pendingAction: 'REFINE', pendingActionClaimId: 'tok-2', pendingActionError: null })
  })

  it('never puts the token in the response', async () => {
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), pendingAction: 'REFINE', pendingActionClaimId: 'tok-secret' })
    const { body } = await get()
    expect(JSON.stringify(body)).not.toContain('tok-secret')
    expect(body).not.toHaveProperty('pendingActionClaimId')
  })
})

describe('GET /api/drafts/[id] — composition and compositionNotice (009 FR-15)', () => {
  it('a pre-009 draft (no stamp) reports null and null', async () => {
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: null })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(body.composition).toBeNull()
    expect(body.compositionNotice).toBeNull()
  })

  it('a kept archetype reports the stamp and no notice', async () => {
    const stamp = {
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'product-showcase',
      contractVersion: 1,
      imageQuality: 'default',
    }
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: stamp })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(body.composition).toEqual(stamp)
    expect(body.compositionNotice).toBeNull()
  })

  it('a fallback reports the stamp and its notice with the reason', async () => {
    const stamp = {
      requestedArchetype: 'editorial-split',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'busy',
      imageQuality: 'default',
    }
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: stamp })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(body.composition).toEqual(stamp)
    expect(body.compositionNotice).toMatchObject({ reason: 'busy' })
    expect((body.compositionNotice as { message: string }).message).toContain('Editorial split')
  })

  it('an unreadable stored value is null, never a throw', async () => {
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: { nonsense: true } })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.composition).toBeNull()
    expect(body.compositionNotice).toBeNull()
  })
})

// ── 030 AC-10: headlineImage ────────────────────────────────────────────────

describe('GET /api/drafts/[id] — headlineImage (030 FR-12, AC-10)', () => {
  const verified = (text: string) => ({ headline: { text, verified: true } })
  const unverified = (text: string, reason: string) => ({ headline: { text, verified: false, reason } })
  const withStamp = (renderedText: unknown, headline: string | null = 'H') => ({
    ...exportedDraft(null),
    renderedText,
    headline,
  })

  async function image(draft: unknown) {
    h.draftFindUnique.mockResolvedValue(draft)
    const { status, body } = await get()
    expect(status).toBe(200)
    return body.headlineImage as Record<string, unknown>
  }

  it('fresh: only the state', async () => {
    expect(await image(withStamp(verified('h')))).toEqual({
      state: 'fresh',
      renderedHeadline: null,
      reason: null,
    })
  })

  it.each([
    ['a null stamp (a draft from before 030)', null, 'H'],
    ['a stamp with no headline key', {}, 'H'],
    ['a null headline', verified('H'), null],
  ])('unknown for %s: only the state', async (_n, stamp, headline) => {
    const img = await image(withStamp(stamp, headline))
    expect(img).toEqual({ state: 'unknown', renderedHeadline: null, reason: null })
  })

  it('an unreadable stored value reads as unknown, never a throw', async () => {
    expect((await image(withStamp({ headline: 'nope' }))).state).toBe('unknown')
  })

  it('stale: renderedHeadline is the stamped text, and no reason', async () => {
    const img = await image(withStamp(verified('Old line'), 'New line'))
    expect(img).toEqual({ state: 'stale', renderedHeadline: 'Old line', reason: null })
  })

  it('unconfirmed: the reason, and no renderedHeadline', async () => {
    const img = await image(withStamp(unverified('H', 'not-visible')))
    expect(img).toEqual({ state: 'unconfirmed', renderedHeadline: null, reason: 'not-visible' })
  })

  it('answers with the renderer and the mock check set to throw: nothing is rendered or parsed', async () => {
    await image(withStamp(verified('Old line'), 'New line'))
    expect(h.renderBoom).not.toHaveBeenCalled()
  })
})

// ── 030 AC-19 (unit half): the PATCH headline branch emits through the one emitter ──

describe('PATCH { headline } — draft.headline_edited (030 FR-15)', () => {
  function patchHeadline(headline: string) {
    return PATCH(
      new Request('http://test/x', { method: 'PATCH', body: JSON.stringify({ headline }) }) as never,
      { params: { id: 'd1' } } as never,
    ) as Promise<Response>
  }

  it('calls the emitter once after the save, with the headline read before it', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    const res = await patchHeadline('New line')
    expect(res.status).toBe(200)
    expect(h.saveHeadlineEdit).toHaveBeenCalledWith('d1', 'New line')
    expect(h.trackHeadlineEdited).toHaveBeenCalledTimes(1)
    expect(h.trackHeadlineEdited).toHaveBeenCalledWith({
      draftId: 'd1',
      teamId: 'team1',
      userId: 'u1',
      via: 'edit',
      before: 'H',
    })
    expect(h.saveHeadlineEdit.mock.invocationCallOrder[0]).toBeLessThan(h.trackHeadlineEdited.mock.invocationCallOrder[0])
  })

  it('a refused save emits nothing', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.saveHeadlineEdit.mockResolvedValue(false)
    expect((await patchHeadline('New line')).status).toBe(409)
    expect(h.trackHeadlineEdited).not.toHaveBeenCalled()
  })
})


// 038 FR-12, NFR-06: `project` and `inputsCurrent`. The live comparison runs only
// for an EXPORTED draft with nothing running.
describe('GET /api/drafts/[id] — project and inputsCurrent (038)', () => {
  const stamp = (projectId: string | null, briefingId: string | null, kitId: string | null) => ({
    v: 1,
    projectId,
    briefingId,
    briefingVersion: briefingId ? 1 : null,
    kitId,
    kitSource: kitId ? 'team' : null,
  })
  const kit = { id: 'kit1', name: 'Kit', source: 'team' }

  it('is true when the recorded inputs match the current assignment', async () => {
    h.resolveBrandKit.mockResolvedValue(kit)
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), generationInputs: stamp(null, null, 'kit1') })
    const { body } = await get()
    expect(body.inputsCurrent).toBe(true)
    expect(body.project).toBeNull()
  })

  it('is false after a move: the brief points at project A, the stamp records B', async () => {
    h.resolveBrandKit.mockResolvedValue(kit)
    h.projectFindFirst.mockResolvedValue({ id: 'pA', name: 'A' })
    const d = exportedDraft(null)
    h.draftFindUnique.mockResolvedValue({
      ...d,
      generationInputs: stamp('pB', 'bB', 'kit1'),
      brief: { ...d.brief, projectId: 'pA' },
    })
    const { body } = await get()
    expect(body.inputsCurrent).toBe(false)
    expect(body.project).toEqual({ id: 'pA', name: 'A' })
  })

  it('a draft with no stamp reads as no project and the brief kit: current when nothing changed', async () => {
    h.resolveBrandKit.mockResolvedValue(kit)
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), generationInputs: null })
    expect((await get()).body.inputsCurrent).toBe(true)
  })

  it('is true without a comparison while an action runs (no extra reads)', async () => {
    const d = exportedDraft(null)
    h.draftFindUnique.mockResolvedValue({
      ...d,
      pendingAction: 'REFINE',
      updatedAt: new Date(),
      generationInputs: stamp('pB', 'bB', 'kit1'),
      brief: { ...d.brief, projectId: 'pA' },
    })
    const { body } = await get()
    expect(body.inputsCurrent).toBe(true)
    expect(h.briefingFindFirst).not.toHaveBeenCalled()
    // Two project reads: the recorded project (the stamp) and the current assignment's name.
    expect(h.projectFindFirst).toHaveBeenCalledTimes(2)
  })
})

// 039 FR-15 / AC-23: the captions on the draft GET.
describe('GET /api/drafts/[id] — captions (039 FR-15)', () => {
  const capRow = (target: string, text: string, over: Record<string, unknown> = {}) => ({
    kind: target === 'GENERAL' ? 'GENERAL' : 'CURATED',
    channel: target === 'GENERAL' ? null : target,
    target,
    text,
    status: 'READY',
    failureReason: null,
    updatedAt: new Date('2026-11-02T00:00:00Z'),
    model: null,
    modelSubstitutedFrom: null,
    route: null,
    deleted: false,
    canUndo: false,
    ...over,
  })

  it('each item carries the FR-15 keys, the general caption first, with rules and its own facts', async () => {
    h.draftFindUnique.mockResolvedValue({
      ...exportedDraft(null),
      factsCheck: {
        v: 1,
        status: 'flagged',
        checkedAt: '2026-11-02T00:00:00.000Z',
        flagged: [{ kind: 'cur', value: '$49', where: 'INSTAGRAM' }],
      },
    })
    h.copyProviderIsClaude.mockResolvedValue(true)
    h.loaded.mockReturnValue({
      general: capRow('GENERAL', 'General text'),
      curated: [capRow('INSTAGRAM', 'Hook\n#a #b'), capRow('LINKEDIN', 'Line #x\nMore')],
    })
    const { body } = await get()
    const items = body.captions as Array<Record<string, unknown>>
    expect(items.map((c) => c.target)).toEqual(['GENERAL', 'INSTAGRAM', 'LINKEDIN'])
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        ['canUndo', 'channel', 'deleted', 'facts', 'failureReason', 'kind', 'label', 'model', 'modelSubstitutedFrom', 'route', 'rules', 'status', 'target', 'text', 'updatedAt'].sort(),
      )
    }
    expect(items.map((c) => c.label)).toEqual(['General', 'Instagram', 'LinkedIn'])
    expect(items[0]).toMatchObject({ kind: 'GENERAL', channel: null, rules: { met: true, unmet: [] }, facts: { status: 'clear', flagged: [] } })
    expect(items[1].facts).toEqual({ status: 'flagged', flagged: [{ kind: 'cur', value: '$49' }] })
    // Instagram's hashtags must all be on the last line; LinkedIn's mid-text hashtag is within its rule.
    expect(items[1].rules).toEqual({ met: true, unmet: [] })
    expect(items[2].rules).toEqual({ met: true, unmet: [] })
  })

  it('a rule miss is reported when read, from the stored text (an edit clears it at once)', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.copyProviderIsClaude.mockResolvedValue(true)
    h.loaded.mockReturnValue({ general: null, curated: [capRow('INSTAGRAM', '#early\nand then text')] })
    expect(((await get()).body.captions as Array<{ rules: unknown }>)[0].rules).toEqual({
      met: false,
      unmet: ['hashtags-not-at-end'],
    })
  })

  it('a post made before 039 has no general item, and an empty row reads with met rules', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.copyProviderIsClaude.mockResolvedValue(true)
    h.loaded.mockReturnValue({ general: null, curated: [capRow('INSTAGRAM', '', { status: 'FAILED', failureReason: 'missing' })] })
    const items = (await get()).body.captions as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'CURATED', rules: { met: true, unmet: [] }, facts: null })
  })

  it('kitWebsite is null until the kit has one (T4), and brief.channels is gone', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(body.kitWebsite).toBeNull()
    expect(body.brief).not.toHaveProperty('channels')
  })

  it('issues the queries it issued before 039 and no more (NFR-06): one draft read, one provider list', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.copyProviderIsClaude.mockResolvedValue(true)
    h.loaded.mockReturnValue({ general: capRow('GENERAL', 'g'), curated: [capRow('INSTAGRAM', 'i')] })
    await get()
    expect(h.draftFindUnique).toHaveBeenCalledTimes(1)
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
    expect(h.projectFindFirst).not.toHaveBeenCalled()
    expect(h.briefingFindFirst).not.toHaveBeenCalled()
    expect(h.providerFindMany).not.toHaveBeenCalled()
  })
})
