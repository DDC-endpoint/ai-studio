// 012 T8, 039 T2 — the MCP/ACP and generate/copy outputs (FR-10, FR-15, FR-17,
// AC-10; 039 D20, AC-20).
// Prisma, MinIO and the generation orchestrator are
// mocked; the real tools, caption loader, resolver and extractor run. Extends
// the Task 13 / 14b cases (the team-bound guard; generation under the team
// Claude credential), which are kept.
//   - getDraft: `headline`; `captions` is the general caption first, then the
//     curated ones, each {kind,channel,text,status,facts,rules}; a cross-team
//     draft is still "not found";
//   - generatePost: adds `headline` and `captions`;
//   - generate/copy: `{headline, captions}`, partial per field, and nothing
//     is written;
//   - none of the three returns the pre-012 `copyText` alias (removed by
//     change 016, FR-07 / AC-06);
//   - there is no publish tool (037 removed publishPost).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Channel } from '@prisma/client'
import { buildMockCaptionReply } from '@/lib/testHooks'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  draftFindUniqueOrThrow: vi.fn(),
  draftWrite: vi.fn(),
  captionCreateMany: vi.fn(),
  captionFindMany: vi.fn(),
  captionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  briefCreate: vi.fn(),
  briefFindUnique: vi.fn(),
  resolveExportUrl: vi.fn(),
  generateDraftForBrief: vi.fn(),
  generateCaptions: vi.fn(),
  withClaudeAuth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: h.transaction,
    draft: {
      findUnique: h.draftFindUnique,
      findUniqueOrThrow: h.draftFindUniqueOrThrow,
      create: h.draftWrite,
      update: h.draftWrite,
      updateMany: h.draftWrite,
    },
    draftCaption: {
      createMany: h.captionCreateMany,
      findMany: h.captionFindMany,
      updateMany: h.captionUpdateMany,
    },
    brief: { create: h.briefCreate, findUnique: h.briefFindUnique },
    // 008 T6: generate/copy resolves the CAPTION model (no saved policy; in
    // CLI mode, which the local .env that @prisma/client loads can set, the
    // credential tier is 'team').
    teamModelPolicy: { findUnique: async () => null },
    team: { findUnique: async () => null },
    userClaudeToken: { findFirst: async () => null },
  },
}))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: h.resolveExportUrl }))
vi.mock('@/mcp/systemUser', () => ({ getSystemUserId: async () => 'system-user' }))
vi.mock('@/lib/agent/userToken', () => ({ withClaudeAuth: h.withClaudeAuth }))
vi.mock('@/lib/agent/generateDraft', () => ({
  generateDraftForBrief: h.generateDraftForBrief,
  NoBrandKitError: class NoBrandKitError extends Error {},
}))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx?.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canView: () => true, canEditPost: () => true, NOT_AUTHOR: { code: 'not-author' } }))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({ generateCaptions: h.generateCaptions }),
}))
// The post's kit (null: none); a test gives it a website (039 D17).
let kitForTest: { website: string | null } | null = null
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => kitForTest }))

const { getDraft, generatePost } = await import('@/mcp/tools/generate')
const { AGENT_MANIFEST } = await import('@/acp/agent')
const copyRoute = await import('@/app/api/generate/copy/route')

const GEN_TEXT = 'The general caption, for any channel.'
const IG_TEXT = 'Instagram caption #launch'
const LI_TEXT = 'LinkedIn caption, longer and more formal.'
// A legacy row (026): the loader must hide it.
const WA_TEXT = 'WhatsApp *caption*'

type Row = {
  kind: 'GENERAL' | 'CURATED'
  channel: Channel | null
  text: string
  status: 'PENDING' | 'READY' | 'FAILED'
  failureReason: string | null
  deletedAt: Date | null
  previous: null
}

function row(channel: Channel, text: string, over: Partial<Row> = {}): Row {
  return { kind: 'CURATED', channel, text, status: 'READY', failureReason: null, deletedAt: null, previous: null, ...over }
}

function general(text: string, over: Partial<Row> = {}): Row {
  return { kind: 'GENERAL', channel: null, text, status: 'READY', failureReason: null, deletedAt: null, previous: null, ...over }
}

const OK_RULES = { met: true, unmet: [] }

let rows: Row[]
let teamId: string

// One draft row that serves the tools' own lookups and the caption loader's
// select.
function draftRow() {
  return {
    id: 'd1',
    teamId,
    headline: 'Launch day',
    imageUrl: 'https://minio.test/bg.png',
    exportUrl: 'exports/d1.png',
    htmlContent: '<html></html>',
    status: 'EXPORTED',
    generationInputs: null,
    brief: { teamId, brandKitId: null },
    captions: rows.map((r) => ({ ...r, updatedAt: new Date() })),
  }
}

// Like Prisma, a lookup returns only the selected fields.
function selected(args?: { select?: Record<string, unknown> }) {
  const full = draftRow()
  if (!args?.select) return full
  return Object.fromEntries(Object.keys(args.select).map((k) => [k, full[k as keyof typeof full]]))
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  teamId = 'team1'
  kitForTest = null
  rows = [general(GEN_TEXT), row('INSTAGRAM', IG_TEXT), row('LINKEDIN', LI_TEXT), row('WHATSAPP', WA_TEXT)]
  h.draftFindUnique.mockImplementation(async (args) => selected(args))
  h.draftFindUniqueOrThrow.mockImplementation(async (args) => selected(args))
  h.resolveExportUrl.mockResolvedValue('https://minio.test/signed.png')
  h.withClaudeAuth.mockImplementation((_userId: unknown, _teamId: unknown, fn: () => unknown) => fn())
})

// ── getDraft (AC-10) ────────────────────────────────────────────────────────

describe('getDraft', () => {
  it('returns the headline and the general caption first, then the curated ones in registry order, hides a legacy WHATSAPP row, and no copyText', async () => {
    const out = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(out).not.toHaveProperty('copyText')
    expect(out).toEqual({
      headline: 'Launch day',
      captions: [
        { kind: 'GENERAL', channel: null, text: GEN_TEXT, status: 'READY', facts: null, rules: OK_RULES },
        { kind: 'CURATED', channel: 'INSTAGRAM', text: IG_TEXT, status: 'READY', facts: null, rules: OK_RULES },
        { kind: 'CURATED', channel: 'LINKEDIN', text: LI_TEXT, status: 'READY', facts: null, rules: OK_RULES },
      ],
      imageUrl: 'https://minio.test/bg.png',
      exportUrl: 'https://minio.test/signed.png',
      status: 'EXPORTED',
      // 027 FR-13: a draft with no stamp and no stored check reads null.
      postStyle: null,
      factsCheck: null,
    })
  })

  it('a post made before 039 has no GENERAL item (D11)', async () => {
    rows = [row('INSTAGRAM', IG_TEXT), row('LINKEDIN', LI_TEXT), row('WHATSAPP', WA_TEXT)]
    const out = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(out.captions.map((c) => `${c.kind}:${c.channel}`)).toEqual(['CURATED:INSTAGRAM', 'CURATED:LINKEDIN'])
  })

  it('a deleted curated caption is left out (D14)', async () => {
    rows[1] = row('INSTAGRAM', IG_TEXT, { deletedAt: new Date() })
    const out = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(out.captions.map((c) => c.channel)).toEqual([null, 'LINKEDIN'])
  })

  it('an empty caption is returned as is with met rules, and a row status is passed through', async () => {
    rows[0] = general('')
    rows[1] = row('INSTAGRAM', '', { status: 'FAILED', failureReason: 'missing' })
    const out = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(out).not.toHaveProperty('copyText')
    expect(out.captions[0]).toEqual({ kind: 'GENERAL', channel: null, text: '', status: 'READY', facts: null, rules: OK_RULES })
    expect(out.captions[1]).toEqual({ kind: 'CURATED', channel: 'INSTAGRAM', text: '', status: 'FAILED', facts: null, rules: OK_RULES })
  })

  it('each item carries only its own facts: flagged with its own flags, clear, error, or null when unchecked (AC-20)', async () => {
    const check = (status: string, flagged: unknown[]) => ({ v: 1, status, checkedAt: '2026-11-02T00:00:00.000Z', flagged })
    const flag = (where: string, value: string) => ({ kind: 'cur', value, where })
    h.draftFindUnique.mockImplementation(async (args) => ({
      ...selected(args),
      factsCheck: check('flagged', [flag('INSTAGRAM', '$49'), flag('headline', '$5')]),
    }))
    const flagged = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(flagged.captions.map((c) => c.facts)).toEqual([
      { status: 'clear', flagged: [] },
      { status: 'flagged', flagged: [{ kind: 'cur', value: '$49' }] },
      { status: 'clear', flagged: [] },
    ])

    h.draftFindUnique.mockImplementation(async (args) => ({ ...selected(args), factsCheck: { ...check('error', []), reason: 'boom' } }))
    const errored = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(errored.captions.every((c) => c.facts?.status === 'error')).toBe(true)

    h.draftFindUnique.mockImplementation(async (args) => selected(args))
    expect((await getDraft({ id: 'd1', teamId: 'team1' })).captions.every((c) => c.facts === null)).toBe(true)
  })

  it('each item has exactly kind, channel, text, status, facts and rules, and the manifest names the same keys', async () => {
    const out = await getDraft({ id: 'd1', teamId: 'team1' })
    const capability = AGENT_MANIFEST.capabilities.find((c) => c.name === 'generate_post')!
    const item = (capability.output as unknown as { properties: { captions: { items: { properties: object } } } }).properties
      .captions.items
    for (const caption of out.captions) {
      expect(Object.keys(caption).sort()).toEqual(['channel', 'facts', 'kind', 'rules', 'status', 'text'])
      expect(Object.keys(item.properties).sort()).toEqual(Object.keys(caption).sort())
    }
  })

  it("a Facebook caption's link rule uses the post's kit website (039 D17)", async () => {
    const FB = 'Mock Facebook caption.\nhttps://acme.example\n\n#a'
    rows = [general(GEN_TEXT), row('FACEBOOK', FB)]
    kitForTest = { website: 'https://acme.example' }
    const met = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(met.captions[1].rules.unmet).not.toContain('link-missing')
    rows = [general(GEN_TEXT), row('FACEBOOK', 'Mock Facebook caption.')]
    const missing = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(missing.captions[1].rules.unmet).toContain('link-missing')
    kitForTest = null
    const none = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(none.captions[1].rules.unmet).not.toContain('link-missing')
  })

  it('a cross-team draft is still "not found", and its captions are never read', async () => {
    teamId = 'other-team'
    await expect(getDraft({ id: 'd1', teamId: 'team1' })).rejects.toThrow('Draft d1 not found')
    expect(h.draftFindUnique).toHaveBeenCalledTimes(1)
  })

  it('an unknown id and a pre-tenancy null teamId are "not found" the same way', async () => {
    h.draftFindUnique.mockResolvedValue(null)
    await expect(getDraft({ id: 'nope', teamId: 'team1' })).rejects.toThrow('Draft nope not found')
    h.draftFindUnique.mockResolvedValue({ ...draftRow(), teamId: null })
    await expect(getDraft({ id: 'd1', teamId: 'team1' })).rejects.toThrow('Draft d1 not found')
  })
})

// ── generatePost ────────────────────────────────────────────────────────────

// Task 14b: generation runs inside withClaudeAuth(null, teamId, fn), under the
// team Claude credential (MCP/ACP has no personal tier).
describe('generatePost', () => {
  const args = {
    topic: 'Launch',
    goal: 'awareness',
    tone: 'bold',
    designMode: 'GENERATE' as const,
    teamId: 'team1',
  }

  beforeEach(() => h.briefCreate.mockResolvedValue({ id: 'b1', teamId: 'team1' }))

  it('runs under the team credential and adds headline and captions to {draftId, exportUrl, htmlContent}', async () => {
    h.generateDraftForBrief.mockResolvedValue({ draft: draftRow(), backgroundImageUrl: null })
    const out = await generatePost(args)
    expect(h.withClaudeAuth).toHaveBeenCalledWith(null, 'team1', expect.any(Function))
    expect(h.generateDraftForBrief).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), {
      userId: null,
      teamId: 'team1',
      source: 'mcp',
    })
    expect(out).not.toHaveProperty('copyText')
    expect(out).toEqual({
      draftId: 'd1',
      exportUrl: 'https://minio.test/signed.png',
      htmlContent: '<html></html>',
      headline: 'Launch day',
      captions: [
        { kind: 'GENERAL', channel: null, text: GEN_TEXT, status: 'READY', facts: null, rules: OK_RULES },
        { kind: 'CURATED', channel: 'INSTAGRAM', text: IG_TEXT, status: 'READY', facts: null, rules: OK_RULES },
        { kind: 'CURATED', channel: 'LINKEDIN', text: LI_TEXT, status: 'READY', facts: null, rules: OK_RULES },
      ],
      // 027 FR-13: the style the brief resolved to (goal 'awareness' maps to nothing) and
      // the stored check; this draft has none.
      postStyle: 'general',
      factsCheck: null,
    })
  })

  // 018 FR-01 / AC-01: the drift guard. The ACP manifest advertises exactly
  // the keys the handler returns, at the top level and per caption entry, and
  // its caption channel enum is the registry order the handler emits.
  it('the ACP manifest advertises exactly the output generatePost returns', async () => {
    h.generateDraftForBrief.mockResolvedValue({ draft: draftRow(), backgroundImageUrl: null })
    const out = await generatePost(args)
    const capability = AGENT_MANIFEST.capabilities.find((c) => c.name === 'generate_post')
    type Schema = { properties: Record<string, { items?: Schema; enum?: unknown[] }> }
    const output = capability!.output as unknown as Schema
    expect(Object.keys(out).sort()).toEqual(Object.keys(output.properties).sort())
    const item = output.properties.captions.items!
    for (const caption of out.captions) {
      expect(Object.keys(caption).sort()).toEqual(Object.keys(item.properties).sort())
    }
    // 039 D20: the curatable channels, plus null for the general caption.
    expect(item.properties.channel.enum).toEqual(['INSTAGRAM', 'LINKEDIN', 'FACEBOOK', null])
    expect(item.properties.kind.enum).toEqual(['GENERAL', 'CURATED'])
    expect(item.properties.status.enum).toEqual(['PENDING', 'READY', 'FAILED'])
  })

  it('a team with no Claude credential surfaces the no-credential error from inside the wrap', async () => {
    const noCredential =
      'No Claude credential available — connect a personal token in Settings or set the team token in Team settings'
    h.generateDraftForBrief.mockRejectedValue(new Error(noCredential))
    await expect(generatePost(args)).rejects.toThrow(noCredential)
    expect(h.withClaudeAuth).toHaveBeenCalledWith(null, 'team1', expect.any(Function))
  })
})

// ── post styles (027 FR-06, FR-13) ──────────────────────────────────────────

describe('generatePost — post styles', () => {
  const noStyleArgs = { topic: 'Launch', designMode: 'GENERATE' as const, teamId: 'team1' }
  const stored = { v: 1, status: 'flagged', checkedAt: '2026-10-25T00:00:00.000Z', flagged: [{ kind: 'cur', value: '$49', where: 'INSTAGRAM' }] }

  beforeEach(() => {
    h.briefCreate.mockResolvedValue({ id: 'b1', teamId: 'team1' })
    h.generateDraftForBrief.mockResolvedValue({ draft: { ...draftRow(), factsCheck: stored }, backgroundImageUrl: null })
  })

  const created = () => h.briefCreate.mock.calls[0][0].data

  it('goal and tone are optional; no style resolves to general and is returned', async () => {
    const out = await generatePost(noStyleArgs)
    expect(created()).toMatchObject({ postStyle: 'general', imageStyle: 'classic' })
    expect(out.postStyle).toBe('general')
  })

  it('an explicit postStyle is stored with the style goal; the goal sent is ignored', async () => {
    const out = await generatePost({ ...noStyleArgs, postStyle: 'promotion', goal: 'hiring', tone: 'casual' })
    expect(created()).toMatchObject({ postStyle: 'promotion', tone: 'casual' })
    expect(created().goal).not.toBe('hiring')
    expect(out.postStyle).toBe('promotion')
  })

  it('a legacy goal of hiring picks the hiring style only when no postStyle is given', async () => {
    await generatePost({ ...noStyleArgs, goal: 'hiring', tone: 'bold' })
    expect(created().postStyle).toBe('hiring')
  })

  it('an unknown key is a named error: no brief and no generation', async () => {
    await expect(generatePost({ ...noStyleArgs, postStyle: 'nope' })).rejects.toThrow("Unknown post style 'nope'")
    expect(h.briefCreate).not.toHaveBeenCalled()
    expect(h.generateDraftForBrief).not.toHaveBeenCalled()
  })

  it('returns the stored facts check as { status, flagged } and getDraft returns the same two fields', async () => {
    const out = await generatePost(noStyleArgs, 'acp')
    expect(out.factsCheck).toEqual({ status: 'flagged', flagged: stored.flagged })
    h.draftFindUnique.mockImplementation(async (args) => ({
      ...selected(args),
      postStyle: { key: 'event', version: 1, revision: 1 },
      factsCheck: stored,
    }))
    const read = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(read.postStyle).toBe('event')
    expect(read.factsCheck).toEqual({ status: 'flagged', flagged: stored.flagged })
  })

  it('an unreadable stored check reads null, never throws', async () => {
    h.generateDraftForBrief.mockResolvedValue({ draft: { ...draftRow(), factsCheck: { nonsense: true } }, backgroundImageUrl: null })
    expect((await generatePost(noStyleArgs)).factsCheck).toBeNull()
  })

  it('the manifest is version 2.2.0 (037, 038, 039) and drops goal, tone and channels from required', () => {
    expect(AGENT_MANIFEST.version).toBe('2.2.0')
    const cap = AGENT_MANIFEST.capabilities.find((c) => c.name === 'generate_post')!
    const input = cap.input as unknown as { required: string[]; properties: Record<string, { enum?: string[] }> }
    expect(input.required).toEqual(['topic', 'designMode'])
    expect(input.properties.postStyle.enum).toContain('general')
    expect(input.properties).toHaveProperty('goal')
  })
})

// ── generate/copy (FR-10) ───────────────────────────────────────────────────

describe('POST /api/generate/copy', () => {
  function brief(topic: string) {
    return {
      id: 'b1',
      teamId: 'team1',
      userId: 'u1',
      brandKitId: null,
      copyProviderKey: null,
      topic,
      description: null,
      goal: 'awareness',
      tone: 'bold',
    }
  }

  async function post(topic: string) {
    h.briefFindUnique.mockResolvedValue(brief(topic))
    h.generateCaptions.mockImplementation(
      async (_b: unknown, targets: readonly string[], model: { arg: string }) => ({
        raw: buildMockCaptionReply(topic, targets as never),
        modelId: model.arg,
      }),
    )
    const req = new Request('http://localhost/api/generate/copy', {
      method: 'POST',
      body: JSON.stringify({ briefId: 'b1' }),
    })
    const res = await copyRoute.POST(req as never, { params: Promise.resolve({}) } as never)
    return { status: res.status, body: await res.json() }
  }

  function expectNoWrites() {
    expect(h.transaction).not.toHaveBeenCalled()
    expect(h.draftWrite).not.toHaveBeenCalled()
    expect(h.captionCreateMany).not.toHaveBeenCalled()
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
    expect(h.briefCreate).not.toHaveBeenCalled()
  }

  it('returns {headline, captions} for the headline and the general caption, with no copyText, writing nothing', async () => {
    const { status, body } = await post('Launch')
    expect(status).toBe(200)
    expect(h.generateCaptions.mock.calls[0][1]).toEqual(['HEADLINE', 'GENERAL'])
    // 008: the CAPTION system default, resolved by the route.
    expect(h.generateCaptions.mock.calls[0][2]).toMatchObject({ surface: 'CAPTION', key: 'HAIKU', source: 'system' })
    expect(body).not.toHaveProperty('copyText')
    expect(body).toEqual({
      headline: 'Mock headline Launch',
      captions: [
        { kind: 'GENERAL', channel: null, text: 'Mock General caption [Launch]', status: 'READY', failureReason: null },
      ],
    })
    expectNoWrites()
  })

  it('a partial reply keeps the fields that validated and fails the rest', async () => {
    const { status, body } = await post('Launch __DROP_CAPTION_GENERAL__')
    expect(status).toBe(200)
    expect(body.headline).toBe('Mock headline Launch __DROP_CAPTION_GENERAL__'.slice(0, 100))
    expect(body.captions[0]).toEqual({
      kind: 'GENERAL',
      channel: null,
      text: '',
      status: 'FAILED',
      failureReason: 'missing',
    })
    expect(body).not.toHaveProperty('copyText')
    expectNoWrites()
  })

  it('a dropped headline is null and the general caption still reads', async () => {
    const { body } = await post('Launch __DROP_CAPTION_HEADLINE__')
    expect(body).not.toHaveProperty('copyText')
    expect(body.headline).toBeNull()
    expect(body.captions[0]).toMatchObject({ kind: 'GENERAL', status: 'READY' })
  })

  it('a provider error is still a 422 COPY_ERROR', async () => {
    h.briefFindUnique.mockResolvedValue(brief('Launch'))
    h.generateCaptions.mockRejectedValue(new Error('provider down'))
    const req = new Request('http://localhost/api/generate/copy', {
      method: 'POST',
      body: JSON.stringify({ briefId: 'b1' }),
    })
    const res = await copyRoute.POST(req as never, { params: Promise.resolve({}) } as never)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ code: 'COPY_ERROR', message: 'provider down' })
  })
})
