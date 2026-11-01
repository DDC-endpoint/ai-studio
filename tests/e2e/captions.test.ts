import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, curate, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable, seedCuratedCaption } from '../helpers/db'
import { expectNoAxeViolations } from '../helpers/axe'
import { ADMIN_EMAIL, ADMIN_PASSWORD, pageLogin } from '../helpers/ui'

// §W — Captions (change 012, wave 1: AC-12 → AC-20, AC-22, AC-26; wave 2, T13:
// AC-21 and AC-24, at the end of this file; 039 T2: AC-04 → AC-07, AC-27). The
// legacy-caption cases (AC-23: TC-CAP-11/12/13, TC-CAP-19) were removed by 016.
//
// Contract (039 spec FR-06 → FR-17):
//   GET /api/drafts/[id] → headline, captions[]: the general caption first
//     (kind GENERAL, no channel), then any curated rows (an old post's
//     INSTAGRAM, LINKEDIN); a legacy WHATSAPP row is hidden, 026.
//   POST regenerate-copy {kind:'GENERAL'} | {channel} | {headline:true} → 202;
//     one draft-level REGENERATE_COPY claim, the target row PENDING. {} is 400
//     ("Regenerate all" is retired).
//   PATCH {kind:'GENERAL', text} | {channel, text} | {headline}; never touches
//     Draft.status.
//   (Publishing was removed by 037; its cases are gone from this suite. Curate
//   is 039 T3 and is covered by curated-captions.test.ts; a curated row here is
//   made through the route, or seeded through the test DB where the case needs
//   a state the route never leaves: an old post, a fixed text.)
//
// Deterministic seams (MOCK_AI + MOCK_PUPPETEER):
//   - the mock caption reply is "Mock <Label> caption [<topic>]" and "Mock
//     headline <topic>", parsed by the real extractor;
//   - "__DROP_CAPTION_GENERAL__" and "__DROP_CAPTION_HEADLINE__" in the topic
//     drop that key, only in a generation reply.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

type Caption = {
  kind: 'GENERAL' | 'CURATED'
  channel: 'INSTAGRAM' | 'LINKEDIN' | null
  target: 'GENERAL' | 'INSTAGRAM' | 'LINKEDIN'
  label: string
  text: string
  status: 'PENDING' | 'READY' | 'FAILED'
  failureReason: string | null
  updatedAt: string
}

const captionsOf = (draft: Record<string, unknown>) => draft.captions as Caption[]
const captionOf = (draft: Record<string, unknown>, target: Caption['target']) => {
  const c = captionsOf(draft).find((x) => x.target === target)
  expect(c, `the draft has a ${target} caption`).toBeTruthy()
  return c!
}

// A post as it was before 039: Instagram and LinkedIn rows, and no general caption.
async function makeOldPost(draftId: string) {
  await prisma!.draftCaption.deleteMany({ where: { draftId } })
  await seedCuratedCaption(draftId, 'INSTAGRAM', 'An old Instagram caption.')
  await seedCuratedCaption(draftId, 'LINKEDIN', 'An old LinkedIn caption.')
}

// One kit per worker, shared by every generation in this suite.
let suiteKitId: string | null = null
async function suiteKit(api: ApiClient): Promise<string> {
  if (suiteKitId) return suiteKitId
  const stamp = Date.now()
  const kit = await (await api.post('/api/admin/brandkits', { name: `Captions Kit ${stamp}`, colors: ['#0b6e4f'] })).json()
  suiteKitId = kit.id as string
  return suiteKitId
}

// A Path B generation, polled until it leaves IN_PROGRESS.
async function generate(api: ApiClient, topic: string): Promise<Record<string, unknown>> {
  const brief = await (
    await api.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      brandKitId: await suiteKit(api),
    })
  ).json()
  const res = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  return waitForDraft(api, draftId)
}

async function exportedDraft(api: ApiClient, topic: string) {
  const draft = await generate(api, topic)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

// ── AC-12 → AC-20, AC-22: generation and partial failure ────────────────────

test.describe('§W — per-channel captions', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-CAP-01 — AC-12 (FR-10), 039 D10: a headline and one READY general caption, normalised.
  test('a generated draft has a headline and one READY general caption, normalised', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Gen ${Date.now()}`
    const draft = await exportedDraft(api, topic)

    expect(draft.headline).toBe(`Mock headline ${topic}`)

    const captions = captionsOf(draft)
    expect(captions.map((c) => c.target)).toEqual(['GENERAL'])
    for (const c of captions) {
      expect(c.status).toBe('READY')
      expect(c.failureReason).toBeNull()
      expect(c.text).toContain(topic)
      expect(c.text).not.toContain('**')
    }
    expect(captionOf(draft, 'GENERAL').text).toBe(`Mock General caption [${topic}]`)
  })

  // TC-CAP-23 — 039 AC-04: the generation contract, read through the database.
  test('a generation writes exactly one caption row, GENERAL with no channel, READY with text', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap One Row ${Date.now()}`
    const draft = await exportedDraft(api, topic)

    const rows = await prisma!.draftCaption.findMany({ where: { draftId: draft.id as string } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'GENERAL', channel: null, status: 'READY' })
    // The mock was asked for the headline and the general caption only: the topic marker is in the general text.
    expect(rows[0].text).toBe(`Mock General caption [${topic}]`)
    expect(rows[0].model).toBeTruthy()

    const listed = captionsOf((await (await api.get(`/api/drafts/${draft.id}`)).json()) as Record<string, unknown>)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ kind: 'GENERAL', channel: null, target: 'GENERAL', label: 'General' })
  })

  // TC-CAP-24 — 039 AC-05, AC-13 (FR-08, FR-11): the general caption fails alone.
  test('a dropped general caption fails alone, and a general regenerate fixes only it', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap Drop GEN __DROP_CAPTION_GENERAL__ ${Date.now()}`
    const draft = await exportedDraft(api, topic)

    // The post is made, with its headline; only the general caption failed.
    expect(draft.status).toBe('EXPORTED')
    expect(draft.headline).toBe(`Mock headline ${topic}`.slice(0, 100))
    const general = captionOf(draft, 'GENERAL')
    expect(general.status).toBe('FAILED')
    expect(general.text).toBe('')
    expect(general.failureReason).toContain('missing')

    // { kind: 'GENERAL' } succeeds: the sentinel only drops keys from a generation reply.
    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, { kind: 'GENERAL' })
    expect(res.status()).toBe(202)
    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingActionError).toBeNull()

    const after = captionOf(done, 'GENERAL')
    expect(after.status).toBe('READY')
    expect(after.failureReason).toBeNull()
    expect(after.text).toBe(`Mock General caption [${topic}]`)
    expect(done.headline).toBe(draft.headline)
    expect(done.currentRevisionNumber).toBe(draft.currentRevisionNumber)
  })

  // TC-CAP-03 — AC-14 (FR-09): no headline fails the generation.
  test('a reply with no headline fails the draft, and the general caption that validated is kept', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Drop HL __DROP_CAPTION_HEADLINE__ ${Date.now()}`
    const draft = await generate(api, topic)

    expect(draft.status).toBe('FAILED')
    expect(String(draft.failureReason)).toContain('headline')
    expect(draft.headline).toBeNull()
    for (const c of captionsOf(draft)) {
      expect(c.status).toBe('READY')
      expect(c.text).toContain(topic)
    }
  })

  // TC-CAP-26 — 039 AC-07 (D21): a `channels` key is ignored, never refused; the column stays null.
  test('briefs ignore a channels key, WhatsApp included, and store none', async () => {
    test.skip(!dbAvailable, 'requires test DB access')
    const kitId = await suiteKit(api)
    const body = {
      goal: 'g',
      tone: 'professional',
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      brandKitId: kitId,
    }
    const withChannels = await api.post('/api/briefs', { ...body, topic: `Cap WA brief ${Date.now()}`, channels: ['WHATSAPP'] })
    expect(withChannels.status()).toBe(201)
    const without = await api.post('/api/briefs', { ...body, topic: `Cap no channels ${Date.now()}` })
    expect(without.status()).toBe(201)
    for (const res of [withChannels, without]) {
      const { id } = await res.json()
      const rows = await prisma!.$queryRaw<{ channels: unknown }[]>`SELECT "channels" FROM "Brief" WHERE "id" = ${id}`
      expect(rows[0].channels).toBeNull()
    }
  })

  // TC-CAP-09 — AC-20 (FR-11, FR-12): one draft-level caption claim.
  test('while REGENERATE_COPY runs, every other action 409s, and a PENDING row refuses its edit', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await exportedDraft(api, `Cap Flight ${Date.now()}`)
    const id = draft.id as string
    // A curated Instagram row too, so the post has a READY row besides the general one.
    await curate(api, id, 'INSTAGRAM')

    // A caption action in flight: the claim, and its general row being written.
    await prisma!.draft.update({ where: { id }, data: { pendingAction: 'REGENERATE_COPY' } })
    await prisma!.draftCaption.updateMany({
      where: { draftId: id, kind: 'GENERAL' },
      data: { status: 'PENDING' },
    })

    const inFlight = 'Another action is already running on this draft'
    for (const [path, body] of [
      ['regenerate-copy', { kind: 'GENERAL' }],
      ['regenerate-copy', { channel: 'INSTAGRAM' }],
      ['regenerate-copy', { headline: true }],
      ['regenerate-design', {}],
      ['revisions/1/restore', {}],
    ] as const) {
      const res = await api.post(`/api/drafts/${id}/${path}`, body)
      expect(res.status(), path).toBe(409)
      expect((await res.json()).error).toBe(inFlight)
    }

    // The PENDING row refuses an edit; a READY row on the same draft does not.
    const pendingEdit = await api.patch(`/api/drafts/${id}`, { kind: 'GENERAL', text: 'Typed over a regenerate' })
    expect(pendingEdit.status()).toBe(409)
    expect((await pendingEdit.json()).error).toBe('This caption is being generated')
    const readyEdit = await api.patch(`/api/drafts/${id}`, { channel: 'INSTAGRAM', text: 'Typed while the general caption runs' })
    expect(readyEdit.status()).toBe(200)
    expect(captionOf(await readyEdit.json(), 'INSTAGRAM').text).toBe('Typed while the general caption runs')

    // Release the slot so nothing else meets it.
    await prisma!.draftCaption.updateMany({
      where: { draftId: id, kind: 'GENERAL' },
      data: { status: 'READY' },
    })
    await prisma!.draft.update({ where: { id }, data: { pendingAction: null } })
  })

  // TC-CAP-10 — AC-22 (FR-11): revisions are design-only.
  test('restoring a revision never touches the captions or the headline', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(api, `Cap Restore ${Date.now()}`)
    const id = draft.id as string

    const refine = await api.post(`/api/drafts/${id}/refine`, { instruction: 'Make the background darker' })
    expect(refine.status()).toBe(202)
    const refined = await waitForAction(api, id)
    expect(refined.pendingActionError).toBeNull()
    expect(refined.currentRevisionNumber).toBe(2)

    const edited = await api.patch(`/api/drafts/${id}`, { kind: 'GENERAL', text: 'An edited general caption.' })
    expect(edited.status()).toBe(200)
    const before = await edited.json()

    const restore = await api.post(`/api/drafts/${id}/revisions/1/restore`, {})
    expect(restore.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${id}`)).json()
    expect(after.currentRevisionNumber).toBe(1)
    expect(after.captions).toEqual(before.captions)
    expect(after.headline).toBe(before.headline)
    expect(captionOf(after, 'GENERAL').text).toBe('An edited general caption.')
  })
})

// ── AC-17 (ACP part) and AC-26: the machine surface ─────────────────────────

test.describe('§W — captions on the ACP surface', () => {
  let plaintextKey: string
  let keyId: string

  test.beforeAll(async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const created = await (await admin.post('/api/team/api-keys', { label: `Captions suite ${Date.now()}` })).json()
    plaintextKey = created.plaintext
    keyId = created.id
    await admin.dispose()
  })
  test.afterAll(async ({ request }) => {
    if (!keyId) return
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    await admin.del(`/api/team/api-keys/${keyId}`)
    await admin.dispose()
  })

  // TC-CAP-14 — AC-26 (FR-17); 037: publish_post is an unknown capability; 039 AC-20: one general
  // caption, and a `channels` input is ignored.
  test('generate_post returns the headline and the general caption; channels is ignored; publish_post is gone', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap ACP ${Date.now()}`
    const gen = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': plaintextKey },
      data: {
        capability: 'generate_post',
        input: { topic, goal: 'Drive signups', tone: 'professional', channels: ['INSTAGRAM'], designMode: 'GENERATE' },
      },
    })
    expect(gen.status()).toBe(200)
    const output = (await gen.json()).output
    expect(output.draftId).toBeTruthy()
    expect(output.headline).toBe(`Mock headline ${topic}`)
    expect(output.captions).toHaveLength(1)
    expect(output.captions[0]).toMatchObject({ kind: 'GENERAL', channel: null, status: 'READY' })
    expect(Object.keys(output.captions[0]).sort()).toEqual(['channel', 'facts', 'kind', 'rules', 'status', 'text'])
    expect(output.captions[0].text).toContain(topic)
    expect(output.captions[0].rules).toEqual({ met: true, unmet: [] })

    const pub = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': plaintextKey },
      data: { capability: 'publish_post', input: { draftId: output.draftId, channel: 'INSTAGRAM' } },
    })
    expect(pub.status()).toBe(400)
    expect((await pub.json()).error).toMatch(/Unknown capability/)
  })
})

// ── Wave 2 (T13): AC-21 (the headline) and AC-24 (the panels) ────────────────

type ShownTarget = Caption['target']
// A caption's heading, its textbox name and the name its buttons carry.
const TITLES = { GENERAL: 'General caption', INSTAGRAM: 'Instagram caption', LINKEDIN: 'LinkedIn caption' } as const
const n = (x: number) => x.toLocaleString('en-US')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const startsWith = (s: string) => new RegExp(`^${escapeRe(s)}`)

// 014's AC-19 axe scan (tests/helpers/axe.ts, 018 FR-07), run here over the
// draft page in the caption states 014's own scan never sees: notices,
// warnings, a FAILED row (NFR-07). No settle step: each case waits for the
// state it asserts on, as it always has.

test.describe('§W — wave 2: the headline and the caption panels', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  const openDraft = async (page: Page, id: unknown) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })
  }
  const field = (page: Page, target: ShownTarget) =>
    page.getByRole('textbox', { name: TITLES[target], exact: true })
  const read = async (id: unknown) => (await api.get(`/api/drafts/${id}`)).json()

  // TC-CAP-15 — AC-21 (FR-11): { kind: 'GENERAL' } rewrites the general caption, never the
  // headline or the design; {} ("Regenerate all") is retired (039 AC-27).
  test('a general regenerate rewrites the general caption and leaves the headline and the revision alone; {} is 400', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Regen Gen ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    const before = captionOf(draft, 'GENERAL')
    // A hand-set headline: the mock headline is the same on every run, so only
    // a value the mock would never produce can show it was left alone.
    const handHeadline = `Hand headline ${Date.now()}`
    expect((await api.patch(`/api/drafts/${draft.id}`, { headline: handHeadline })).status()).toBe(200)

    const retired = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, {})
    expect(retired.status()).toBe(400)
    expect((await retired.json()).error).toBe("Send { kind: 'GENERAL' }, { channel } or { headline: true }")

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, { kind: 'GENERAL' })
    expect(res.status()).toBe(202)
    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingActionError).toBeNull()

    const after = captionOf(done, 'GENERAL')
    expect(after.status).toBe('READY')
    expect(after.failureReason).toBeNull()
    expect(after.text).toContain(topic)
    expect(Date.parse(after.updatedAt), 'updatedAt moved').toBeGreaterThan(Date.parse(before.updatedAt))
    expect(done.headline).toBe(handHeadline)
    expect(done.currentRevisionNumber).toBe(draft.currentRevisionNumber)
  })

  // TC-CAP-16 — AC-21 (FR-11): {headline:true} sets the headline and touches
  // no caption. The headline is nulled first, so "set" is visible.
  test('a headline-only regenerate sets the headline and leaves every caption row unchanged', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap Regen HL ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    await prisma!.draft.update({ where: { id: draft.id as string }, data: { headline: null } })
    const cleared = await read(draft.id)
    expect(cleared.headline).toBeNull()

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, { headline: true })
    expect(res.status()).toBe(202)
    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingActionError).toBeNull()

    expect(done.headline).toBe(`Mock headline ${topic}`)
    expect(done.captions).toEqual(cleared.captions) // text, status, updatedAt: every field
    expect(done.currentRevisionNumber).toBe(cleared.currentRevisionNumber)
  })

  // TC-CAP-17 — AC-24 (FR-18, FR-19): the desk's structure, names, counters
  // and limit warnings; neither warning blocks the save. The post is an old one (curated
  // Instagram and LinkedIn rows besides the general caption), so every card shows.
  test('the caption desk: headings, names, counters and the Instagram limit', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await exportedDraft(api, `Cap Panels ${Date.now()}`)
    await seedCuratedCaption(draft.id as string, 'INSTAGRAM', 'Hook line #one #two')
    await seedCuratedCaption(draft.id as string, 'LINKEDIN', 'A longer LinkedIn caption.')
    const full = (await read(draft.id)) as Record<string, unknown>
    await openDraft(page, draft.id)

    // "Captions" (h2), then the h3s, in registry order.
    const desk = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Captions', level: 2, exact: true }) })
      .last()
    await expect(desk.getByRole('heading', { level: 3 })).toHaveText([
      'Headline',
      'General caption',
      'Curated captions',
      'Instagram caption',
      'LinkedIn caption',
    ])
    await expect(desk.getByRole('textbox', { name: 'Headline', exact: true })).toHaveCount(1)

    // Each caption textarea is named by its own h3, and its counter is exact.
    const counters = {
      GENERAL: (len: number) => `${n(len)} / 2,200 (general caption)`,
      INSTAGRAM: (len: number) => `${n(len)} / 2,200 (Instagram)`,
      LINKEDIN: (len: number) => `${n(len)} / 3,000 (LinkedIn)`,
    }
    for (const c of captionsOf(full)) {
      const box = desk.getByRole('textbox', { name: TITLES[c.target], exact: true })
      await expect(box).toHaveJSProperty('tagName', 'TEXTAREA')
      const heading = page.locator(`[id="${await box.getAttribute('aria-labelledby')}"]`)
      await expect(heading).toHaveJSProperty('tagName', 'H3')
      await expect(heading).toHaveText(TITLES[c.target])
      await expect(box).toHaveValue(c.text)
      await expect(desk.getByText(counters[c.target](c.text.length), { exact: true })).toBeVisible()
    }

    // No WhatsApp panel (026 FR-04, FR-09).
    await expect(desk.getByText('WhatsApp')).toHaveCount(0)

    // Instagram past its hard 2,200: "Over the Instagram limit", still saved.
    const longIg = 'i'.repeat(2201)
    await field(page, 'INSTAGRAM').fill(longIg)
    await expect(desk.getByText('2,201 / 2,200 (Instagram)', { exact: true })).toBeVisible()
    await expect(desk.getByText('Over the Instagram limit', { exact: true })).toBeVisible()
    await field(page, 'INSTAGRAM').blur()
    await expect.poll(async () => captionOf(await read(draft.id), 'INSTAGRAM').text).toBe(longIg)
    // Only the caption past its limit warns.
    await expect(desk.getByText(/^Over the .* limit$/)).toHaveCount(1)

    await expectNoAxeViolations(page, '/drafts/[id] with the limit warning showing')
  })

  // TC-CAP-18 — AC-24 (FR-19): Copy the general caption, and Regenerate writes the mock text over a
  // hand edit, after which the card offers the server Undo (039 T3), which brings the hand edit back.
  test('Copy general caption fills the clipboard, and Regenerate replaces a hand edit, which Undo brings back', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const topic = `Cap Copy Regen ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    await openDraft(page, draft.id)

    // Copy: the clipboard holds exactly the general text.
    const genText = captionOf(draft, 'GENERAL').text
    await page.getByRole('button', { name: 'Copy general caption', exact: true }).click()
    await expect(page.getByText('Caption copied', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(genText)

    // A hand edit, so the regenerate (which writes the mock text) is visible.
    const hand = 'A hand-written general caption.'
    await field(page, 'GENERAL').fill(hand)
    await field(page, 'GENERAL').blur()
    await expect.poll(async () => captionOf(await read(draft.id), 'GENERAL').text).toBe(hand)

    await page.getByRole('button', { name: 'Regenerate general caption', exact: true }).click()
    await expect(field(page, 'GENERAL')).toHaveValue(`Mock General caption [${topic}]`, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Regenerate all', exact: true })).toHaveCount(0)
    const undo = page.getByRole('button', { name: 'Undo general caption', exact: true })
    await expect(undo).toBeVisible()
    await undo.click()
    await expect(field(page, 'GENERAL')).toHaveValue(hand)
    expect(captionOf(await read(draft.id), 'GENERAL').text).toBe(hand)
  })

  // TC-CAP-20 — AC-24 (FR-19): a FAILED row shows its error notice and Generate.
  test('a FAILED general row shows the error notice and a Generate button that fills it', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Failed Panel __DROP_CAPTION_GENERAL__ ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    const general = captionOf(draft, 'GENERAL')
    expect(general.status).toBe('FAILED')
    await openDraft(page, draft.id)

    const failed = `The general caption failed to generate (${general.failureReason}).`
    await expect(page.getByText(failed, { exact: false })).toBeVisible()
    await expect(field(page, 'GENERAL')).toHaveValue('')
    await expect(field(page, 'GENERAL')).toBeEditable()
    await expect(field(page, 'GENERAL')).toHaveAccessibleDescription(startsWith(failed))
    const generate = page.getByRole('button', { name: 'Generate general caption', exact: true })
    await expect(generate).toHaveText('Generate')
    await expect(generate).toBeEnabled()
    await expectNoAxeViolations(page, '/drafts/[id] with a FAILED caption')

    await generate.click()
    await expect(field(page, 'GENERAL')).toHaveValue(`Mock General caption [${topic}]`, { timeout: 20_000 })
    await expect(page.getByText(failed, { exact: false })).toHaveCount(0)
    expect(captionOf(await read(draft.id), 'GENERAL').status).toBe('READY')
  })

  // TC-CAP-25 — 039 AC-06 (D11, FR-07): a post made before 039 has no general caption.
  test('an old post lists its curated captions and no general one, and "Generate general caption" makes it', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap Old Post ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    const id = draft.id as string
    await makeOldPost(id)

    // 1. GET lists the two curated items and no GENERAL item.
    const listed = await read(id)
    expect(captionsOf(listed).map((c) => `${c.kind}:${c.channel}`)).toEqual(['CURATED:INSTAGRAM', 'CURATED:LINKEDIN'])

    // 3. The page shows both cards and "Generate general caption".
    await openDraft(page, id)
    await expect(field(page, 'INSTAGRAM')).toHaveValue('An old Instagram caption.')
    await expect(field(page, 'LINKEDIN')).toHaveValue('An old LinkedIn caption.')
    await expect(page.getByRole('textbox', { name: 'General caption', exact: true })).toHaveCount(0)
    const generate = page.getByRole('button', { name: 'Generate general caption', exact: true })
    await expect(generate).toBeVisible()
    const checkedBefore = ((await read(id)).factsCheck as { checkedAt: string } | null)?.checkedAt ?? null

    // 4. Clicking it creates a GENERAL row that becomes READY.
    await generate.click()
    await expect(field(page, 'GENERAL')).toHaveValue(`Mock General caption [${topic}]`, { timeout: 20_000 })
    const row = await prisma!.draftCaption.findFirstOrThrow({ where: { draftId: id, kind: 'GENERAL' } })
    expect(row).toMatchObject({ channel: null, status: 'READY' })
    await expect(generate).toHaveCount(0)

    // 5. The facts check is recomputed.
    const after = await read(id)
    const checkedAfter = (after.factsCheck as { checkedAt: string } | null)?.checkedAt ?? null
    expect(checkedAfter).not.toBeNull()
    expect(checkedAfter).not.toBe(checkedBefore)
    // The curated cards stay, after the general one.
    expect(captionsOf(after).map((c) => c.target)).toEqual(['GENERAL', 'INSTAGRAM', 'LINKEDIN'])
  })

  // 039 D12 (T3): a regenerate of a curated channel with no row makes the row (curate).
  test('a regenerate of a curated channel with no row makes it, and the post then has two captions', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap No Row ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    expect(captionsOf(draft).map((c) => c.target)).toEqual(['GENERAL'])
    const done = await curate(api, draft.id as string, 'INSTAGRAM')
    expect(done.pendingActionError).toBeNull()
    expect(captionsOf(done).map((c) => c.target)).toEqual(['GENERAL', 'INSTAGRAM'])
    expect(captionOf(done, 'INSTAGRAM').text).toBe(`Mock Instagram caption [${topic}] [from general]`)
  })

  // TC-CAP-21 — AC-05 (026 FR-04, FR-05): a legacy WhatsApp row is hidden and kept.
  test('a legacy WhatsApp caption row is hidden from the API and the page, and left unchanged', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await exportedDraft(api, `Cap Legacy WA ${Date.now()}`)
    const id = draft.id as string
    const legacyText = 'A legacy WhatsApp caption that must stay hidden.'
    await prisma!.draftCaption.create({
      data: { draftId: id, kind: 'CURATED', channel: 'WHATSAPP', text: legacyText, status: 'READY' },
    })
    const rowBefore = await prisma!.draftCaption.findFirstOrThrow({
      where: { draftId: id, kind: 'CURATED', channel: 'WHATSAPP' },
    })

    const listed = await read(id)
    expect(captionsOf(listed).map((c) => c.target)).toEqual(['GENERAL'])
    expect(JSON.stringify(listed)).not.toContain(legacyText)

    await openDraft(page, id)
    const desk = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Captions', level: 2, exact: true }) })
      .last()
    await expect(desk.getByRole('heading', { level: 3 })).toHaveText(['Headline', 'General caption', 'Curated captions'])
    await expect(page.getByText('WhatsApp')).toHaveCount(0)
    await expect(page.getByText(legacyText)).toHaveCount(0)

    // It cannot be edited or regenerated either (FR-02).
    expect((await api.patch(`/api/drafts/${id}`, { channel: 'WHATSAPP', text: 'x' })).status()).toBe(400)
    expect((await api.post(`/api/drafts/${id}/regenerate-copy`, { channel: 'WHATSAPP' })).status()).toBe(400)

    const rowAfter = await prisma!.draftCaption.findFirstOrThrow({
      where: { draftId: id, kind: 'CURATED', channel: 'WHATSAPP' },
    })
    expect(rowAfter.text).toBe(legacyText)
    expect(rowAfter.status).toBe('READY')
    expect(rowAfter.updatedAt.getTime()).toBe(rowBefore.updatedAt.getTime())
  })

  // TC-CAP-22 — AC-09 (026 FR-08): Refine design sits under the Preview card.
  test('Refine design is under the Preview card from xl, and between Preview and Captions below it', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(api, `Cap Layout ${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await openDraft(page, draft.id)

    const preview = page.locator('section[aria-label="Preview"]')
    const refine = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Refine design', exact: true }) })
      .last()
    const captions = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Captions', level: 2, exact: true }) })
      .last()
    await expect(refine).toBeVisible()

    const pb = (await preview.boundingBox())!
    const rb = (await refine.boundingBox())!
    expect(rb.y).toBeGreaterThanOrEqual(pb.y + pb.height - 1)
    expect(Math.abs(rb.x - pb.x)).toBeLessThanOrEqual(1)
    await expectNoAxeViolations(page, '/drafts/[id] at 1440 px, Refine design under Preview')

    await page.setViewportSize({ width: 390, height: 900 })
    const ys = {
      preview: (await preview.boundingBox())!.y,
      refine: (await refine.boundingBox())!.y,
      captions: (await captions.boundingBox())!.y,
    }
    expect(ys.preview).toBeLessThan(ys.refine)
    expect(ys.refine).toBeLessThan(ys.captions)
    const order = await page.evaluate(() => {
      const q = (el: Element | null) => el!
      const p = document.querySelector('section[aria-label="Preview"]')
      const headings = Array.from(document.querySelectorAll('h2'))
      const rf = headings.find((h) => h.textContent?.trim() === 'Refine design')!.closest('section')
      const cp = headings.find((h) => h.textContent?.trim() === 'Captions')!.closest('section')
      const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      return before(q(p), q(rf)) && before(q(rf), q(cp))
    })
    expect(order).toBe(true)
    await expectNoAxeViolations(page, '/drafts/[id] at 390 px, one column')
  })
})
