// 012 T8 — the MCP/ACP and generate/copy outputs (FR-10, FR-15, FR-17, AC-10).
// Prisma, MinIO and the generation orchestrator are
// mocked; the real tools, caption loader, resolver and extractor run. Extends
// the Task 13 / 14b cases (the team-bound guard; generation under the team
// Claude credential), which are kept.
//   - getDraft: `headline`; `captions` is 3 × {channel,text,status} in
//     registry order; a cross-team draft is still "not found";
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
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))

const { getDraft, generatePost } = await import('@/mcp/tools/generate')
const { AGENT_MANIFEST } = await import('@/acp/agent')
const copyRoute = await import('@/app/api/generate/copy/route')

const IG_TEXT = 'Instagram caption #launch'
const LI_TEXT = 'LinkedIn caption, longer and more formal.'
// A legacy row (026): the loader must hide it.
const WA_TEXT = 'WhatsApp *caption*'

type Row = { channel: Channel; text: string; status: 'PENDING' | 'READY' | 'FAILED'; failureReason: string | null }

function row(channel: Channel, text: string, over: Partial<Row> = {}): Row {
  return { channel, text, status: 'READY', failureReason: null, ...over }
}

let rows: Row[]
let teamId: string

// One draft row that serves the tools' own lookups and the caption loader's
// select. Every registry channel has a row, so the loader fills nothing in.
function draftRow() {
  return {
    id: 'd1',
    teamId,
    headline: 'Launch day',
    imageUrl: 'https://minio.test/bg.png',
    exportUrl: 'exports/d1.png',
    htmlContent: '<html></html>',
    status: 'EXPORTED',
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
  rows = [row('INSTAGRAM', IG_TEXT), row('LINKEDIN', LI_TEXT), row('WHATSAPP', WA_TEXT)]
  h.draftFindUnique.mockImplementation(async (args) => selected(args))
  h.draftFindUniqueOrThrow.mockImplementation(async (args) => selected(args))
  h.resolveExportUrl.mockResolvedValue('https://minio.test/signed.png')
  h.withClaudeAuth.mockImplementation((_userId: unknown, _teamId: unknown, fn: () => unknown) => fn())
})

// ── getDraft (AC-10) ────────────────────────────────────────────────────────

describe('getDraft', () => {
  it('returns the headline and 2 captions in registry order, hides a legacy WHATSAPP row, and no copyText', async () => {
    const out = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(out).not.toHaveProperty('copyText')
    expect(out).toEqual({
      headline: 'Launch day',
      captions: [
        { channel: 'INSTAGRAM', text: IG_TEXT, status: 'READY' },
        { channel: 'LINKEDIN', text: LI_TEXT, status: 'READY' },
      ],
      imageUrl: 'https://minio.test/bg.png',
      exportUrl: 'https://minio.test/signed.png',
      status: 'EXPORTED',
      // 027 FR-13: a draft with no stamp and no stored check reads null.
      postStyle: null,
      factsCheck: null,
    })
  })

  it("an empty Instagram caption is returned as is, and a row's status is passed through", async () => {
    rows[0] = row('INSTAGRAM', '')
    rows[1] = row('LINKEDIN', '', { status: 'FAILED', failureReason: 'missing' })
    const out = await getDraft({ id: 'd1', teamId: 'team1' })
    expect(out).not.toHaveProperty('copyText')
    expect(out.captions[0]).toEqual({ channel: 'INSTAGRAM', text: '', status: 'READY' })
    expect(out.captions[1]).toEqual({ channel: 'LINKEDIN', text: '', status: 'FAILED' })
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
    channels: ['instagram', 'LINKEDIN'],
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
        { channel: 'INSTAGRAM', text: IG_TEXT, status: 'READY' },
        { channel: 'LINKEDIN', text: LI_TEXT, status: 'READY' },
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
    expect(item.properties.channel.enum).toEqual(out.captions.map((c) => c.channel))
    // 026 AC-07: the contract names two channels.
    expect(item.properties.channel.enum).toEqual(['INSTAGRAM', 'LINKEDIN'])
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
  const noStyleArgs = { topic: 'Launch', channels: ['INSTAGRAM'], designMode: 'GENERATE' as const, teamId: 'team1' }
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

  it('the manifest is version 2.1.0 (037, 038) and drops goal and tone from required', () => {
    expect(AGENT_MANIFEST.version).toBe('2.1.0')
    const cap = AGENT_MANIFEST.capabilities.find((c) => c.name === 'generate_post')!
    const input = cap.input as unknown as { required: string[]; properties: Record<string, { enum?: string[] }> }
    expect(input.required).toEqual(['topic', 'channels', 'designMode'])
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
      channels: ['INSTAGRAM', 'LINKEDIN'],
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

  it('returns {headline, captions} for the headline and every channel, with no copyText, writing nothing', async () => {
    const { status, body } = await post('Launch')
    expect(status).toBe(200)
    expect(h.generateCaptions.mock.calls[0][1]).toEqual(['HEADLINE', 'INSTAGRAM', 'LINKEDIN'])
    // 008: the CAPTION system default, resolved by the route.
    expect(h.generateCaptions.mock.calls[0][2]).toMatchObject({ surface: 'CAPTION', key: 'HAIKU', source: 'system' })
    expect(body).not.toHaveProperty('copyText')
    expect(body).toEqual({
      headline: 'Mock headline Launch',
      captions: [
        { channel: 'INSTAGRAM', text: 'Mock Instagram caption [Launch]', status: 'READY', failureReason: null },
        { channel: 'LINKEDIN', text: 'Mock LinkedIn caption [Launch]', status: 'READY', failureReason: null },
      ],
    })
    expectNoWrites()
  })

  it('a partial reply keeps the fields that validated and fails the rest', async () => {
    const { status, body } = await post('Launch __DROP_CAPTION_LINKEDIN__ __DROP_CAPTION_HEADLINE__')
    expect(status).toBe(200)
    expect(body.headline).toBeNull()
    expect(body.captions[1]).toEqual({ channel: 'LINKEDIN', text: '', status: 'FAILED', failureReason: 'missing' })
    expect(body.captions[0].status).toBe('READY')
    expect(body).not.toHaveProperty('copyText')
    expectNoWrites()
  })

  it('a failed Instagram caption is reported in captions, with no copyText fallback', async () => {
    const { body } = await post('Launch __DROP_CAPTION_INSTAGRAM__')
    expect(body).not.toHaveProperty('copyText')
    expect(body.headline).toMatch(/^Mock headline Launch/)
    expect(body.captions[0]).toMatchObject({ channel: 'INSTAGRAM', text: '', status: 'FAILED' })
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
