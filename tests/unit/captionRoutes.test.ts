// 012 T6 review NOTEs, 039 T2 — the caption routes' edge paths, with the store,
// the action lifecycle and the provider mocked:
//   - regenerate-copy: an empty body is 400 ("Regenerate all" is retired,
//     039 Q2); malformed JSON is 400; a throw
//     after the claim (before the run starts) settles the target rows and
//     releases the claim instead of stranding both until the sweep; a failure
//     before the claim claims nothing;
//   - PATCH { headline }: refused (409) while a generation runs.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  resolveCopyProvider: vi.fn(),
  loadDraftCaptions: vi.fn(),
  claimCaptionAction: vi.fn(),
  settleCaptionAction: vi.fn(),
  saveHeadlineEdit: vi.fn(),
  startDraftAction: vi.fn(),
  releaseDraftAction: vi.fn(),
  resolveModel: vi.fn(),
  writeCaptions: vi.fn(),
  trackHeadlineEdited: vi.fn(),
  admit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findUnique: h.draftFindUnique } } }))
// The real handler module pulls in auth (and its env checks); these routes need
// only the wrapper and a JSON read.
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap, withTeamAdmin: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canView: () => true, canEditPost: () => true, NOT_AUTHOR: { code: 'not-author' } }))
vi.mock('@/providers/registry', () => ({ resolveCopyProvider: h.resolveCopyProvider }))
// The post's kit (null: none). A test sets it to give the post a website (039 D17).
let kitForTest: unknown = null
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => kitForTest }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async () => null }))
vi.mock('@/lib/drafts/revisions', () => ({ COMMITTED_REVISION: {}, resolveNotAppliedOutcome: async () => null }))
vi.mock('@/lib/renderedText/track', () => ({ trackHeadlineEdited: h.trackHeadlineEdited }))
vi.mock('@/lib/captions/generate', () => ({ writeCaptions: h.writeCaptions }))
// 039 D16: the per-user caption limit (its own unit suite is captionRateLimit).
vi.mock('@/lib/captions/limits', () => ({ admitCaptionAction: h.admit }))
// 008: the route resolves the CAPTION model before its claim. The I/O wrapper
// is a spy; by default it runs the REAL pure decideModel on a policy the test
// sets (API mode, so the credential is 'n/a'), so FR-09's tiers are exercised.
let policy: { allowed: string[]; defaults: Record<string, string>; gateOn: boolean }
vi.mock('@/lib/models/policy', () => ({ resolveModel: h.resolveModel }))
const { decideModel } = await import('@/lib/models/resolve')
vi.mock('@/lib/captions/store', () => ({
  loadDraftCaptions: h.loadDraftCaptions,
  claimCaptionAction: h.claimCaptionAction,
  settleCaptionAction: h.settleCaptionAction,
  saveHeadlineEdit: h.saveHeadlineEdit,
  saveCaptionEdit: vi.fn(),
  settlePendingCaptions: vi.fn(),
}))
vi.mock('@/lib/drafts/draftActions', () => ({
  startDraftAction: h.startDraftAction,
  releaseDraftAction: h.releaseDraftAction,
}))

const { generalHashOf } = await import('@/lib/captions/generalHash')
const { POST: regenerate } = await import('@/app/api/drafts/[id]/regenerate-copy/route')
const { PATCH: patch } = await import('@/app/api/drafts/[id]/route')

const ctx = { params: { id: 'd1' } }
const CLAIM = { action: 'REGENERATE_COPY', claimId: 'claim-1' }
// What the claim returns (039 D12): the claim, and the targets it created.
const CLAIMED = { claim: CLAIM, created: [] as string[] }

function post(body?: string) {
  return regenerate(new Request('http://test/x', { method: 'POST', body }) as never, ctx as never)
}

// The loader's shape (039 FR-05): the general row (or none) and the curated rows.
function rows(ig: string | null, li: string | null, gen?: string | null) {
  const row = (target: string, model: string | null) => ({
    kind: target === 'GENERAL' ? 'GENERAL' : 'CURATED',
    channel: target === 'GENERAL' ? null : target,
    target,
    text: 'text',
    status: 'READY',
    deleted: false,
    model,
    modelSubstitutedFrom: null,
  })
  return {
    general: gen === undefined ? null : row('GENERAL', gen),
    curated: [row('INSTAGRAM', ig), row('LINKEDIN', li)],
  }
}

function exportedDraft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    status: 'EXPORTED',
    pendingAction: null,
    brief: { userId: 'u1', teamId: 'team1', brandKitId: null, copyProviderKey: null },
    ...over,
  }
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  policy = { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false }
  h.resolveModel.mockImplementation(async (surface: never, opts: { stamp?: string | null }) =>
    decideModel(surface, { stamp: opts.stamp, policy: policy as never, credential: 'n/a', mode: 'api' }),
  )
  h.admit.mockReturnValue({ ok: true })
  h.draftFindUnique.mockResolvedValue(exportedDraft())
  h.resolveCopyProvider.mockResolvedValue({})
  h.loadDraftCaptions.mockResolvedValue(rows(null, null, 'g'))
  h.claimCaptionAction.mockResolvedValue(CLAIMED)
  // 030: the settle reports whether it wrote the headline.
  h.settleCaptionAction.mockResolvedValue({ headlineWritten: false, headlineBefore: null })
  h.trackHeadlineEdited.mockResolvedValue(undefined)
  h.releaseDraftAction.mockResolvedValue(undefined)
  h.startDraftAction.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('regenerate-copy — the body', () => {
  // 039 Q2, AC-27: an empty body is the wrong shape; nothing is read or claimed.
  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '  \n'],
    ['{}', '{}'],
  ])('an %s body is 400 with the shape message', async (_name, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Send { kind: 'GENERAL' }, { channel } or { headline: true }" })
    expect(h.draftFindUnique).not.toHaveBeenCalled()
    expect(h.claimCaptionAction).not.toHaveBeenCalled()
  })

  it("{ kind: 'GENERAL' } claims the general caption", async () => {
    const res = await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(res.status).toBe(202)
    expect(h.claimCaptionAction).toHaveBeenCalledWith('d1', ['GENERAL'])
  })

  it('a curate with no row claims it (the claim creates the row) and runs (039 D12)', async () => {
    h.loadDraftCaptions.mockResolvedValue({ general: null, curated: [] })
    const res = await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(res.status).toBe(202)
    expect(h.claimCaptionAction).toHaveBeenCalledWith('d1', ['LINKEDIN'])
  })

  it('is refused 429 with Retry-After over the limit, before anything is read for the claim (039 D16)', async () => {
    h.admit.mockReturnValue({ ok: false, retryAfterSec: 42 })
    const res = await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect((await res.json()).code).toBe('rate-limited')
    expect(h.claimCaptionAction).not.toHaveBeenCalled()
    expect(h.resolveModel).not.toHaveBeenCalled()
    expect(h.startDraftAction).not.toHaveBeenCalled()
  })

  it('the settle event names the caption kind, channel and whether the row was created or replaced (039 D22, D25)', async () => {
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(h.startDraftAction.mock.calls[0][6].fields).toMatchObject({
      captionKind: 'CURATED',
      channel: 'LINKEDIN',
      captionOp: 'replace',
    })
    h.startDraftAction.mockClear()
    h.claimCaptionAction.mockResolvedValue({ claim: CLAIM, created: ['GENERAL'] })
    h.loadDraftCaptions.mockResolvedValue(rows(null, null))
    await post(JSON.stringify({ kind: 'GENERAL' }))
    const fields = h.startDraftAction.mock.calls[0][6].fields
    expect(fields).toMatchObject({ captionKind: 'GENERAL', captionOp: 'create' })
    expect(fields).not.toHaveProperty('channel')
  })

  it('a headline regenerate names no caption kind', async () => {
    await post(JSON.stringify({ headline: true }))
    expect(h.startDraftAction.mock.calls[0][6].fields).not.toHaveProperty('captionKind')
  })

  it('malformed non-empty JSON is still 400, before anything is read', async () => {
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
    expect(h.draftFindUnique).not.toHaveBeenCalled()
  })
})

describe('regenerate-copy — a failure never strands the claim', () => {
  it('a throw after the claim (the run never started) settles the target rows, then releases the claim', async () => {
    const order: string[] = []
    h.startDraftAction.mockRejectedValue(new Error('No Claude credential'))
    h.settleCaptionAction.mockImplementation(async () => {
      order.push('settle')
    })
    h.releaseDraftAction.mockImplementation(async () => {
      order.push('release')
    })

    const res = await post(JSON.stringify({ channel: 'LINKEDIN' }))

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ code: 'COPY_ERROR', message: 'No Claude credential' })
    expect(h.settleCaptionAction).toHaveBeenCalledWith('d1', CLAIM, ['LINKEDIN'], {
      LINKEDIN: { ok: false, reason: 'No Claude credential' },
    })
    expect(h.releaseDraftAction).toHaveBeenCalledWith('d1', CLAIM, 'No Claude credential')
    // Settled while the claim still holds, so no newer run's rows are touched.
    expect(order).toEqual(['settle', 'release'])
  })

  it('a failure before the claim (provider resolution) claims nothing and settles nothing', async () => {
    h.resolveCopyProvider.mockRejectedValue(new Error('No copy provider'))
    const res = await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(res.status).toBe(422)
    expect(h.claimCaptionAction).not.toHaveBeenCalled()
    expect(h.settleCaptionAction).not.toHaveBeenCalled()
    expect(h.releaseDraftAction).not.toHaveBeenCalled()
  })

  it('reads the rows before claiming them (they carry the stamps)', async () => {
    await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(h.loadDraftCaptions.mock.invocationCallOrder[0]).toBeLessThan(
      h.claimCaptionAction.mock.invocationCallOrder[0],
    )
  })

  it('carries the claim from claimCaptionAction to startDraftAction and the unstarted settle (019)', async () => {
    const res = await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(res.status).toBe(202)
    expect(h.startDraftAction.mock.calls[0][3]).toBe(CLAIM)
    h.startDraftAction.mockRejectedValue(new Error('x'))
    h.settleCaptionAction.mockClear()
    h.releaseDraftAction.mockClear()
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(h.settleCaptionAction.mock.calls[0][1]).toBe(CLAIM)
    expect(h.releaseDraftAction.mock.calls[0][1]).toBe(CLAIM)
  })

  it('a lost claim is 409 and releases nothing it does not hold', async () => {
    h.claimCaptionAction.mockResolvedValue(null)
    const res = await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(res.status).toBe(409)
    expect(h.startDraftAction).not.toHaveBeenCalled()
    expect(h.releaseDraftAction).not.toHaveBeenCalled()
  })
})

describe('PATCH { headline } — refused while something may write the headline', () => {
  function patchHeadline() {
    return patch(
      new Request('http://test/x', { method: 'PATCH', body: JSON.stringify({ headline: 'Mine' }) }) as never,
      ctx as never,
    )
  }

  it.each([
    ['a generation is running (IN_PROGRESS)', { status: 'IN_PROGRESS', headline: null }],
    ['a retry over a draft that has a headline', { status: 'IN_PROGRESS', headline: 'Old' }],
    ['a caption action holds the draft', { pendingAction: 'REGENERATE_COPY' }],
  ])('409 while %s, and nothing is written', async (_name, over) => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(over))
    const res = await patchHeadline()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'This caption is being generated' })
    expect(h.saveHeadlineEdit).not.toHaveBeenCalled()
  })
})

// ── 008 T7 (FR-09, FR-08): the regenerate default is the stamps' ────────────

describe('regenerate-copy — 008 FR-09 stamp tier, resolved before the claim', () => {
  const SONNET = 'claude-sonnet-5-5'
  const OPUS = 'claude-opus-5-5'
  const HAIKU = 'claude-haiku-4-5'

  // The ResolvedModel the run was handed (writeCaptions' 4th argument).
  const ranWith = () => h.writeCaptions.mock.calls[0][3]

  beforeEach(() => {
    // Run the background work inline so the closure's writes are observable.
    h.startDraftAction.mockImplementation(async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
      await work()
    })
    h.writeCaptions.mockImplementation(async (_p: unknown, _b: unknown, targets: string[], model: { arg: string; substitutedFrom: string | null }) => ({
      fields: Object.fromEntries(targets.map((t) => [t, { ok: true, text: `new ${t}` }])),
      stamp: { model: model.arg, substitutedFrom: model.substitutedFrom },
    }))
  })

  it('{channel}: the stamp tier is THAT row\'s model only', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, OPUS))
    expect((await post(JSON.stringify({ channel: 'LINKEDIN' }))).status).toBe(202)
    expect(h.resolveModel).toHaveBeenCalledWith('CAPTION', { stamp: OPUS, userId: 'u1', teamId: 'team1' })
    expect(ranWith()).toMatchObject({ key: 'OPUS', source: 'stamp', substitutedFrom: null })
  })

  it('{headline:true}: the stamp tier is Draft.headlineModel', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft({ headlineModel: HAIKU }))
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, SONNET))
    await post(JSON.stringify({ headline: true }))
    expect(h.resolveModel.mock.calls[0][1]).toMatchObject({ stamp: HAIKU })
    expect(ranWith()).toMatchObject({ key: 'HAIKU', source: 'stamp' })
  })

  it("{kind:'GENERAL'}: the stamp tier is the general row's model (like for like)", async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(OPUS, OPUS, SONNET))
    await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(h.resolveModel.mock.calls[0][1]).toMatchObject({ stamp: SONNET })
    expect(ranWith()).toMatchObject({ key: 'SONNET', source: 'stamp' })
  })

  it.each([
    ['no general row (a post made before 039)', rows(SONNET, SONNET)],
    ['a null stamp', rows(SONNET, SONNET, null)],
  ])("{kind:'GENERAL'} with %s → no stamp tier: the team default, recorded as NO substitution", async (_n, loaded) => {
    policy.defaults = { CAPTION: 'HAIKU' }
    h.loadDraftCaptions.mockResolvedValue(loaded)
    await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(h.resolveModel.mock.calls[0][1]).toMatchObject({ stamp: null })
    expect(ranWith()).toMatchObject({ key: 'HAIKU', source: 'team', substitutedFrom: null })
  })

  it('a null-stamp draft with no team default → the system default', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(null, null, null))
    await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(ranWith()).toMatchObject({ source: 'system', substitutedFrom: null })
  })

  it('a stamp since disallowed falls through and is recorded on the new stamp (AC-17)', async () => {
    policy.allowed = ['HAIKU', 'SONNET']
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, OPUS))
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(ranWith()).toMatchObject({ key: 'HAIKU', source: 'system', substitutedFrom: OPUS })
    // The settle receives the reply's stamp, substitution included.
    expect(h.settleCaptionAction).toHaveBeenCalledWith(
      'd1',
      CLAIM,
      ['LINKEDIN'],
      { LINKEDIN: { ok: true, text: 'new LINKEDIN' } },
      { model: HAIKU, substitutedFrom: OPUS },
      // 027: the db default, then the post-style stamp (null: the brief has no style).
      undefined,
      null,
      // 039 D4: no general caption on this post, so no source hash.
      { generalHash: null, website: null },
    )
  })

  it('resolves after the rows are loaded (they carry the stamps) and BEFORE the claim', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, SONNET, SONNET))
    await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(h.loadDraftCaptions.mock.invocationCallOrder[0]).toBeLessThan(h.resolveModel.mock.invocationCallOrder[0])
    expect(h.resolveModel.mock.invocationCallOrder[0]).toBeLessThan(h.claimCaptionAction.mock.invocationCallOrder[0])
  })

  it('a failed resolution is the 422 COPY_ERROR shape and claims nothing', async () => {
    policy.allowed = []
    const res = await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('COPY_ERROR')
    expect(h.claimCaptionAction).not.toHaveBeenCalled()
    expect(h.startDraftAction).not.toHaveBeenCalled()
  })

  it('the onError settle passes no stamp (a failed run keeps every row stamp)', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, SONNET))
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    const onError = h.startDraftAction.mock.calls[0][5] as (e: unknown) => Promise<void>
    h.settleCaptionAction.mockClear()
    await onError(new Error('boom'))
    expect(h.settleCaptionAction).toHaveBeenCalledWith('d1', CLAIM, ['LINKEDIN'], { LINKEDIN: { ok: false, reason: 'boom' } })
    expect(h.settleCaptionAction.mock.calls[0]).toHaveLength(4)
  })
})

// ── 030 FR-15: regenerate emits draft.headline_edited only when the settle wrote the headline ──

describe('regenerate-copy — draft.headline_edited (030 FR-15)', () => {
  beforeEach(() => {
    h.startDraftAction.mockImplementation(async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
      await work()
    })
    h.writeCaptions.mockImplementation(async (_p: unknown, _b: unknown, targets: string[]) => ({
      fields: Object.fromEntries(targets.map((t) => [t, { ok: true, text: `new ${t}` }])),
      stamp: { model: 'm', substitutedFrom: null },
    }))
  })

  it('emits once, via regenerate, with the value before, after the settle that wrote the headline', async () => {
    h.settleCaptionAction.mockResolvedValue({ headlineWritten: true, headlineBefore: 'Old' })
    await post(JSON.stringify({ headline: true }))
    expect(h.trackHeadlineEdited).toHaveBeenCalledTimes(1)
    expect(h.trackHeadlineEdited).toHaveBeenCalledWith({
      draftId: 'd1',
      teamId: 'team1',
      userId: 'u1',
      via: 'regenerate',
      before: 'Old',
    })
    expect(h.settleCaptionAction.mock.invocationCallOrder[0]).toBeLessThan(h.trackHeadlineEdited.mock.invocationCallOrder[0])
  })

  it('emits nothing when the settle wrote no headline', async () => {
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(h.trackHeadlineEdited).not.toHaveBeenCalled()
  })
})

// ── 039 T3 (D4, D12, D18): a curate writes from the post's general caption ──

describe('regenerate-copy — a curate passes the general caption and stores its hash', () => {
  beforeEach(() => {
    h.startDraftAction.mockImplementation(async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
      await work()
    })
    h.writeCaptions.mockImplementation(async (_p: unknown, _b: unknown, targets: string[]) => ({
      fields: Object.fromEntries(targets.map((t) => [t, { ok: true, text: `new ${t}` }])),
      stamp: { model: 'm', substitutedFrom: null },
    }))
  })

  const withGeneral = (over: Record<string, unknown> = {}) => {
    const loaded = rows(null, null, 'g')
    return { ...loaded, general: { ...loaded.general, text: 'The general caption', ...over } }
  }
  const briefPassed = () => h.writeCaptions.mock.calls[0][1] as { generalCaption?: string }
  const extraPassed = () => h.settleCaptionAction.mock.calls[0][7]

  it('hands the live READY general caption to the brief input and its hash to the settle', async () => {
    h.loadDraftCaptions.mockResolvedValue(withGeneral())
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(briefPassed().generalCaption).toBe('The general caption')
    expect(extraPassed()).toEqual({ generalHash: generalHashOf('The general caption'), website: null })
  })

  it.each([
    ['no general caption', { general: null, curated: [] }],
    ['a deleted one', withGeneral({ deleted: true })],
    ['a FAILED one', withGeneral({ status: 'FAILED' })],
    ['an empty one', withGeneral({ text: '  ' })],
  ])('passes nothing and stores a null hash with %s (D11)', async (_n, loaded) => {
    h.loadDraftCaptions.mockResolvedValue(loaded)
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(briefPassed()).not.toHaveProperty('generalCaption')
    expect(extraPassed()).toEqual({ generalHash: null, website: null })
  })

  it("passes the post's kit website to the settle and to the brief input (039 D17)", async () => {
    kitForTest = { id: 'k1', name: 'Kit', voicePrompt: null, website: 'https://acme.example' }
    try {
      h.loadDraftCaptions.mockResolvedValue(withGeneral())
      await post(JSON.stringify({ channel: 'FACEBOOK' }))
      expect(extraPassed()).toMatchObject({ website: 'https://acme.example' })
      expect(briefPassed()).toMatchObject({ kitWebsite: 'https://acme.example' })
    } finally {
      kitForTest = null
    }
  })

  it('a general or headline regenerate passes no general caption', async () => {
    h.loadDraftCaptions.mockResolvedValue(withGeneral())
    await post(JSON.stringify({ kind: 'GENERAL' }))
    expect(briefPassed()).not.toHaveProperty('generalCaption')
    h.writeCaptions.mockClear()
    await post(JSON.stringify({ headline: true }))
    expect(briefPassed()).not.toHaveProperty('generalCaption')
  })
})
