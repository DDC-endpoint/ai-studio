import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { Prisma } from '@prisma/client'
import { findTeamIdByName, loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { briefDraftIds, expectNoHorizontalScroll, pageLogin } from '../helpers/ui'
import { expectNoAxeViolations } from '../helpers/axe'

// §AE — Post styles and the facts check (change 027). The SERVER cases are
// TC-PS-01 to TC-PS-29; the UI cases (T6: the wizard, the project default, the
// draft notice) are TC-PS-30 onward, and the insights section (T7, TC-PS-40) is
// last. 037 T2 removed the queue and scheduler cases (TC-PS-07 to TC-PS-09,
// TC-PS-17 to TC-PS-24, TC-PS-38) with scheduled generation.
//
// Everything runs under MOCK_AI (no model call). The facts check is exercised
// through the mock caption seams in src/lib/testHooks.ts: a sentinel in the
// topic appends one invented value to the mock headline and captions, and
// __MOCK_FACT_ERROR__ forces the check itself to fail. Because the mock caption
// embeds the topic, a value written in the topic (or the description, the
// project briefing, a project document) is a STATED value and is not flagged.
// Serial. Two projects for the whole suite (A: no sources; B: a briefing and
// a document that state values), never one per case.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'
const NOT_MOCKED = 'requires MOCK_AI + MOCK_PUPPETEER'

test.describe.configure({ mode: 'serial' })

const tag = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

let admin: ApiClient
let editor: ApiClient
let projA: string
let projB: string
let kitId: string

interface FlagJson {
  kind: string
  value: string
  where: string
}
interface FactsJson {
  status: 'clear' | 'flagged' | 'error'
  flagged: FlagJson[]
  reason?: string
}
interface DraftJson {
  id: string
  status: string
  factsCheck: FactsJson | null
  postStyle: { key: string; label: string; version: number } | null
  failureReason: string | null
}

function briefBody(extra: Record<string, unknown> = {}) {
  return {
    topic: `PS base ${tag()}`,
    channels: ['INSTAGRAM', 'LINKEDIN'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    ...extra,
  }
}

async function postBrief(api: ApiClient, extra: Record<string, unknown> = {}) {
  return api.post('/api/briefs', briefBody(extra))
}

// A brief through generation to a settled draft.
async function generate(api: ApiClient, extra: Record<string, unknown> = {}): Promise<DraftJson> {
  const res = await postBrief(api, extra)
  expect(res.status(), await res.text()).toBe(201)
  const brief = await res.json()
  const assembled = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembled.status()).toBe(202)
  const { draftId } = await assembled.json()
  return (await waitForDraft(api, draftId)) as unknown as DraftJson
}

const pairs = (check: FactsJson | null) => (check?.flagged ?? []).map((f) => `${f.where}:${f.value}`).sort()
const values = (check: FactsJson | null) => [...new Set((check?.flagged ?? []).map((f) => f.value))].sort()

test.beforeAll(async ({ request }) => {
  admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
  editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
  const kit = await (await admin.post('/api/admin/brandkits', { name: `PS Kit ${tag()}`, colors: ['#0284c7'] })).json()
  kitId = kit.id
  projA = (await (await admin.post('/api/projects', { name: `PS Proj A ${tag()}`, defaultBrandKitId: kitId })).json()).id
  projB = (await (await admin.post('/api/projects', { name: `PS Proj B ${tag()}`, defaultBrandKitId: kitId })).json()).id
})

test.afterAll(async () => {
  await admin?.dispose()
  await editor?.dispose()
})

// ── The inputs: POST /api/briefs ────────────────────────────────────────────

test.describe('Post style inputs: briefs', () => {
  test('TC-PS-01: a style is stored with the style goal, the resolved tone and the default image of the style; the goal sent is ignored', async () => {
    // 028 T7: hiring now defaults to full-bleed-scene (TC-LOOK-13 to 16); 031 T18: promotion and milestone default to spotlight (OP-031); tip still defaults to classic.
    const res = await postBrief(admin, { postStyle: 'promotion', goal: 'x-ignored' })
    expect(res.status()).toBe(201)
    const brief = await res.json()
    expect(brief.postStyle).toBe('promotion')
    expect(brief.goal).toBeTruthy()
    expect(brief.goal).not.toBe('x-ignored')
    expect(brief.tone).toBeTruthy()
    expect(brief.imageStyle).toBe('spotlight')
    expect((await (await postBrief(admin, { postStyle: 'milestone' })).json()).imageStyle).toBe('spotlight')
    expect((await (await postBrief(admin, { postStyle: 'tip' })).json()).imageStyle).toBe('classic')

    // An explicit tone is kept as sent.
    const toned = await (await postBrief(admin, { postStyle: 'event', tone: 'casual' })).json()
    expect(toned.postStyle).toBe('event')
    expect(toned.tone).toBe('casual')
  })

  test('TC-PS-02: with no style, a legacy goal of hiring or announcement picks one; anything else, and nothing, is General', async () => {
    const pick = async (extra: Record<string, unknown>) => (await (await postBrief(admin, extra)).json()).postStyle
    expect(await pick({ goal: 'hiring' })).toBe('hiring')
    expect(await pick({ goal: 'Announcement' })).toBe('announcement')
    expect(await pick({ goal: 'conversion' })).toBe('general')
    expect(await pick({ goal: 'a free-text goal' })).toBe('general')
    expect(await pick({})).toBe('general')
    // An explicit style wins over the legacy goal.
    expect(await pick({ postStyle: 'tip', goal: 'hiring' })).toBe('tip')
  })

  test('TC-PS-03: a pre-027 body (goal and tone, no style) is 201 and keeps its tone', async () => {
    const res = await postBrief(admin, { goal: 'Awareness', tone: 'professional' })
    expect(res.status()).toBe(201)
    const brief = await res.json()
    expect(brief.postStyle).toBe('general')
    expect(brief.tone).toBe('professional')
  })

  test('TC-PS-04: an unknown key is 400 UNKNOWN_POST_STYLE and creates nothing; a non-string is 400; a blank one is absent', async () => {
    const before = dbAvailable ? await prisma!.brief.count() : 0
    const unknown = await postBrief(admin, { postStyle: 'nope' })
    expect(unknown.status()).toBe(400)
    const body = await unknown.json()
    expect(body.code).toBe('UNKNOWN_POST_STYLE')
    expect(body.error).toContain('nope')
    for (const bad of ['constructor', '__proto__', 'GENERAL', 'launch-x']) {
      const res = await postBrief(admin, { postStyle: bad })
      expect(res.status(), `postStyle ${bad}`).toBe(400)
    }
    const notString = await postBrief(admin, { postStyle: 7 })
    expect(notString.status()).toBe(400)
    expect((await notString.json()).error).toContain('postStyle must be a string')
    if (dbAvailable) expect(await prisma!.brief.count()).toBe(before)

    const blank = await postBrief(admin, { postStyle: '  ' })
    expect(blank.status()).toBe(201)
    expect((await blank.json()).postStyle).toBe('general')
  })
})

// ── The project default style ──────────────────────────────────────────────

test.describe('Post style inputs: the project default', () => {
  // Project A is shared by later cases that expect no default (TC-PS-17 reads
  // a General stamp), so every case here leaves it cleared, pass or fail.
  test.afterEach(async () => {
    await admin.patch(`/api/projects/${projA}`, { defaultPostStyle: null })
  })

  test('TC-PS-05: an admin sets it, a brief on that project uses it, another project is unaffected, an editor gets 403', async () => {
    const set = await admin.patch(`/api/projects/${projA}`, { defaultPostStyle: 'event' })
    expect(set.status()).toBe(200)
    expect((await set.json()).defaultPostStyle).toBe('event')

    const onA = await (await postBrief(admin, { projectId: projA })).json()
    expect(onA.postStyle).toBe('event')
    const onB = await (await postBrief(admin, { projectId: projB })).json()
    expect(onB.postStyle).toBe('general')
    // An explicit style still wins over the default.
    expect((await (await postBrief(admin, { projectId: projA, postStyle: 'tip' })).json()).postStyle).toBe('tip')

    const denied = await editor.patch(`/api/projects/${projA}`, { defaultPostStyle: 'launch' })
    expect(denied.status()).toBe(403)
    expect((await (await admin.get(`/api/projects/${projA}`)).json()).defaultPostStyle).toBe('event')

    const unknown = await admin.patch(`/api/projects/${projA}`, { defaultPostStyle: 'nope' })
    expect(unknown.status()).toBe(400)
    expect((await unknown.json()).code).toBe('UNKNOWN_POST_STYLE')
    expect((await (await admin.get(`/api/projects/${projA}`)).json()).defaultPostStyle).toBe('event')
  })

  test('TC-PS-06: project create takes a default and refuses an unknown one; null clears it', async () => {
    const bad = await admin.post('/api/projects', { name: `PS bad ${tag()}`, defaultPostStyle: 'nope' })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).code).toBe('UNKNOWN_POST_STYLE')

    // The one extra project this case needs; it is not reused.
    const created = await admin.post('/api/projects', { name: `PS C ${tag()}`, defaultBrandKitId: kitId, defaultPostStyle: 'milestone' })
    expect(created.status()).toBe(201)
    const camp = await created.json()
    expect(camp.defaultPostStyle).toBe('milestone')
    expect((await (await postBrief(admin, { projectId: camp.id })).json()).postStyle).toBe('milestone')

    const cleared = await admin.patch(`/api/projects/${camp.id}`, { defaultPostStyle: null })
    expect(cleared.status()).toBe(200)
    expect((await cleared.json()).defaultPostStyle).toBeNull()
    expect((await (await postBrief(admin, { projectId: camp.id })).json()).postStyle).toBe('general')
    await admin.del(`/api/projects/${camp.id}`)

    // Restore project A for the cases below that read its default.
    await admin.patch(`/api/projects/${projA}`, { defaultPostStyle: null })
  })
})

// ── Generation: the style on the draft, and the facts check ─────────────────

test.describe('Generation and the facts check', () => {
  test.skip(!MOCKED(), NOT_MOCKED)

  test('TC-PS-10: the draft carries the post style and a facts check; GET returns { key, label, version }', async () => {
    const draft = await generate(admin, { postStyle: 'promotion' })
    expect(draft.status).toBe('EXPORTED')
    expect(draft.postStyle).toMatchObject({ key: 'promotion', version: 2 })
    expect(draft.postStyle!.label).toBeTruthy()
    expect(draft.factsCheck).toMatchObject({ status: 'clear', flagged: [] })
  })

  test('TC-PS-11: each invented value is flagged exactly, with where; nothing else is', async () => {
    const cases: [string, string[]][] = [
      // sentinel → the flagged set as `where:value`
      ['__MOCK_FACT_PRICE__', ['GENERAL:$49', 'headline:$49']],
      ['__MOCK_FACT_PCT__', ['GENERAL:35%', 'headline:35%']],
      ['__MOCK_FACT_DATE__', ['GENERAL:30 March 2027', 'headline:30 March 2027']],
      ['__MOCK_FACT_NUM__', ['GENERAL:1,250', 'headline:1,250']],
      ['__MOCK_FACT_HEADLINE__', ['headline:$49']],
    ]
    for (const [sentinel, expected] of cases) {
      const draft = await generate(admin, { topic: `${sentinel} PS facts ${tag()}`, projectId: projA })
      expect(draft.status, sentinel).toBe('EXPORTED')
      expect(draft.factsCheck?.status, sentinel).toBe('flagged')
      expect(pairs(draft.factsCheck), sentinel).toEqual([...expected].sort())
    }
  })

  test('TC-PS-12: a value stated in the topic, the description, the project briefing or a project document is not flagged; the same value elsewhere is', async () => {
    // Project B states 35% and 1,250 in its briefing and 30 March 2027 in a document; it never states $49.
    const briefing = await admin.post(`/api/projects/${projB}/briefing`, {
      content: 'We now serve 1,250 customers. Launch offer: 35% off for the first month.',
    })
    expect(briefing.status()).toBe(201)
    const doc = await admin.multipart(`/api/projects/${projB}/documents`, {
      file: { name: 'event.txt', mimeType: 'text/plain', buffer: Buffer.from('The webinar is on 30 March 2027 at the main hall.') },
    })
    expect(doc.status()).toBe(201)

    const inTopic = await generate(admin, { topic: `__MOCK_FACT_PRICE__ Only $49 today ${tag()}` })
    expect(inTopic.factsCheck?.status).toBe('clear')

    const inDescription = await generate(admin, {
      topic: `__MOCK_FACT_PRICE__ PS desc ${tag()}`,
      description: 'The price is $49 per seat.',
    })
    expect(inDescription.factsCheck?.status).toBe('clear')

    const inBriefing = await generate(admin, { topic: `__MOCK_FACT_PCT__ __MOCK_FACT_NUM__ PS brf ${tag()}`, projectId: projB })
    expect(inBriefing.factsCheck).toMatchObject({ status: 'clear', flagged: [] })

    const inDocument = await generate(admin, { topic: `__MOCK_FACT_DATE__ PS doc ${tag()}`, projectId: projB })
    expect(inDocument.factsCheck).toMatchObject({ status: 'clear', flagged: [] })

    // Negative control on the same project: $49 is stated nowhere there.
    const control = await generate(admin, { topic: `__MOCK_FACT_PRICE__ PS ctl ${tag()}`, projectId: projB })
    expect(values(control.factsCheck)).toEqual(['$49'])

    // The same values on an unassigned post, which has no briefing and no documents, are flagged.
    const bare = await generate(admin, { topic: `__MOCK_FACT_PCT__ __MOCK_FACT_DATE__ PS bare ${tag()}` })
    expect(values(bare.factsCheck)).toEqual(['30 March 2027', '35%'])
  })

  test('TC-PS-13: an ordinary brief (24/7, a list marker, a step count) is clear', async () => {
    const draft = await generate(admin, { topic: `Support is open 24/7. Three steps: 1. plan 2. write 3. ship ${tag()}` })
    expect(draft.factsCheck).toMatchObject({ status: 'clear', flagged: [] })
  })

  test('TC-PS-14: a check that cannot run is stored as error and the draft still finishes', async () => {
    const draft = await generate(admin, { topic: `__MOCK_FACT_ERROR__ PS err ${tag()}` })
    expect(draft.status).toBe('EXPORTED')
    expect(draft.factsCheck?.status).toBe('error')
    expect(draft.factsCheck?.flagged).toEqual([])
  })

  test('TC-PS-15: a manual caption edit recomputes the check; so does a regenerate', async () => {
    const draft = await generate(admin, { topic: `__MOCK_FACT_PRICE__ PS edit ${tag()}`, projectId: projA })
    expect(values(draft.factsCheck)).toEqual(['$49'])

    // Replace the general caption with one that states no number: its flag goes.
    const clean = await admin.patch(`/api/drafts/${draft.id}`, { kind: 'GENERAL', text: 'A caption with no figures at all.' })
    expect(clean.status()).toBe(200)
    let after = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson
    expect(pairs(after.factsCheck)).toEqual(['headline:$49'])

    // Type an invented value into it: flagged again, with the new value.
    const dirty = await admin.patch(`/api/drafts/${draft.id}`, { kind: 'GENERAL', text: 'Now only $99 for everyone.' })
    expect(dirty.status()).toBe(200)
    after = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson
    expect(pairs(after.factsCheck)).toEqual(['GENERAL:$99', 'headline:$49'])

    // A headline edit recomputes too.
    expect((await admin.patch(`/api/drafts/${draft.id}`, { headline: 'No numbers here' })).status()).toBe(200)
    after = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson
    expect(pairs(after.factsCheck)).toEqual(['GENERAL:$99'])

    // Regenerating the general caption brings back the mock's own text: $99 goes, the $49 returns.
    const regen = await admin.post(`/api/drafts/${draft.id}/regenerate-copy`, { kind: 'GENERAL' })
    expect(regen.status()).toBe(202)
    let settled: DraftJson
    for (let i = 0; ; i++) {
      settled = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson & { pendingAction: string | null }
      if ((settled as unknown as { pendingAction: string | null }).pendingAction == null || i > 60) break
      await new Promise((r) => setTimeout(r, 250))
    }
    expect(pairs(settled.factsCheck)).toEqual(['GENERAL:$49'])
  })

  test('TC-PS-16: a brief with no style (a pre-027 row) gets no checklist stamp but still gets a facts check', async () => {
    test.skip(!dbAvailable, 'needs the test database to age a brief')
    const res = await postBrief(admin, { topic: `__MOCK_FACT_PRICE__ PS legacy ${tag()}`, projectId: projA })
    const brief = await res.json()
    await prisma!.brief.update({ where: { id: brief.id }, data: { postStyle: null } })
    const assembled = await admin.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(assembled.status()).toBe(202)
    const draft = (await waitForDraft(admin, (await assembled.json()).draftId)) as unknown as DraftJson
    expect(draft.status).toBe('EXPORTED')
    expect(draft.postStyle).toBeNull()
    expect(values(draft.factsCheck)).toEqual(['$49'])
    const row = await prisma!.draft.findUnique({ where: { id: draft.id }, select: { postStyle: true } })
    expect(row!.postStyle).toBeNull()
  })
})

// ── MCP and ACP ─────────────────────────────────────────────────────────────
// The MCP stdio server has no HTTP surface; its tool is the same generatePost
// function the ACP route calls (covered in tests/unit/mcpGetDraft.test.ts).

test.describe('ACP generate_post', () => {
  test.skip(!MOCKED(), NOT_MOCKED)
  let key: string
  let keyId: string

  test.beforeAll(async () => {
    const created = await (await admin.post('/api/team/api-keys', { label: `PS ACP ${tag()}` })).json()
    key = created.plaintext
    keyId = created.id
  })
  test.afterAll(async () => {
    if (keyId) await admin.del(`/api/team/api-keys/${keyId}`)
  })

  const run = (request: APIRequestContext, input: Record<string, unknown>) =>
    request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': key },
      data: { capability: 'generate_post', input: { channels: ['INSTAGRAM'], designMode: 'GENERATE', ...input } },
    })

  test('TC-PS-25: goal and tone are optional; the result names the style and carries the check', async ({ request }) => {
    const res = await run(request, { topic: `PS acp plain ${tag()}` })
    expect(res.status(), await res.text()).toBe(200)
    const out = (await res.json()).output
    expect(out.postStyle).toBe('general')
    expect(out.factsCheck).toEqual({ status: 'clear', flagged: [] })
    expect(out.draftId).toBeTruthy()
  })

  test('TC-PS-26: an explicit postStyle wins over the legacy goal; a legacy goal alone picks hiring or announcement', async ({ request }) => {
    const styled = (await (await run(request, { topic: `PS acp styled ${tag()}`, postStyle: 'event', goal: 'hiring', tone: 'casual' })).json()).output
    expect(styled.postStyle).toBe('event')
    const legacy = (await (await run(request, { topic: `PS acp legacy ${tag()}`, goal: 'hiring', tone: 'professional' })).json()).output
    expect(legacy.postStyle).toBe('hiring')
    const other = (await (await run(request, { topic: `PS acp other ${tag()}`, goal: 'Drive signups', tone: 'professional' })).json()).output
    expect(other.postStyle).toBe('general')
  })

  test('TC-PS-27: an invented value comes back as a flagged check', async ({ request }) => {
    const out = (await (await run(request, { topic: `__MOCK_FACT_PRICE__ PS acp facts ${tag()}` })).json()).output
    expect(out.factsCheck.status).toBe('flagged')
    expect(values(out.factsCheck)).toEqual(['$49'])
  })

  test('TC-PS-28: an unknown key is the named error (422); a non-string key is a 400', async ({ request }) => {
    const unknown = await run(request, { topic: `PS acp bad ${tag()}`, postStyle: 'nope' })
    expect(unknown.status()).toBe(422)
    expect((await unknown.json()).error).toBe("Unknown post style 'nope'")
    const notString = await run(request, { topic: `PS acp bad ${tag()}`, postStyle: 5 })
    expect(notString.status()).toBe(400)
    const noTopic = await run(request, { postStyle: 'tip' })
    expect(noTopic.status()).toBe(400)
  })

  test('TC-PS-29: the manifest is 2.2.0, lists postStyle, and no longer requires goal or tone', async ({ request }) => {
    const res = await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': key } })
    expect(res.status()).toBe(200)
    const manifest = await res.json()
    expect(manifest.version).toBe('2.2.0')
    const cap = manifest.capabilities.find((c: { name: string }) => c.name === 'generate_post')
    expect(cap.input.required).toEqual(['topic', 'designMode'])
    expect(cap.input.properties.postStyle.enum).toContain('general')
    expect(Object.keys(cap.output.properties)).toEqual(expect.arrayContaining(['postStyle', 'factsCheck']))
  })
})

// ── The UI cases (027 T6): the wizard, the project default and the draft page ──

const WIZARD_PROMPT = 'Announce the new post styles with a short call to action for the team.'

const nextPost = (page: Page, suffix: string) =>
  page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix))

const summary = (page: Page, label: string) =>
  page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

// Step 0 -> step 1 (Size & Design), optionally under a project, with the suite's kit.
async function openStepOne(page: Page, projectName?: string) {
  await pageLogin(page)
  await page.goto('/brief')
  await expect(page.getByRole('heading', { name: 'Select a project' })).toBeVisible({ timeout: 20_000 })
  if (projectName) await page.getByRole('button', { name: new RegExp(projectName) }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
  const kit = page.getByRole('combobox', { name: 'Brand kit' })
  await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
  await kit.selectOption(kitId)
}

const styleCard = (page: Page, key: string) => page.getByTestId(`post-style-${key}`)
const lookCard = (page: Page, key: string) => page.getByTestId(`image-style-${key}`)

async function toContentStep(page: Page) {
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
}

async function fillContent(page: Page, topic: string) {
  await page.getByPlaceholder('e.g. Q3 product launch').fill(topic)
  await page.locator('textarea').fill(WIZARD_PROMPT)
}

test.describe('The wizard: the post style picker on step 1', () => {
  test.skip(!MOCKED(), NOT_MOCKED)
  let before: Set<string>
  test.beforeEach(async () => {
    before = new Set(await briefDraftIds(admin))
  })
  test.afterEach(async () => {
    for (const id of await briefDraftIds(admin)) if (!before.has(id)) await admin.del(`/api/brief-drafts/${id}`)
  })

  test('TC-PS-30: the picker sits above the size choices with General selected, moves by arrow keys, and the Content step has no Goal select', async ({ page }) => {
    await openStepOne(page)
    const picker = page.getByTestId('post-style-picker')
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('radio')).toHaveCount(8)
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')

    // Above the size choices.
    const pickerBox = (await picker.boundingBox())!
    const sizeBox = (await page.getByText('Post size', { exact: true }).boundingBox())!
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(sizeBox.y)

    // One tab stop; the arrow keys move the choice and the focus.
    await styleCard(page, 'general').focus()
    await page.keyboard.press('ArrowRight')
    await expect(styleCard(page, 'launch')).toHaveAttribute('aria-checked', 'true')
    await expect(styleCard(page, 'launch')).toBeFocused()
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'false')
    await expect(styleCard(page, 'general')).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('ArrowLeft')
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('End')
    await expect(styleCard(page, 'milestone')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Home')
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')

    await expectNoAxeViolations(page, 'brief step 1 with the post style picker', { settle: true })
    await page.setViewportSize({ width: 390, height: 900 })
    await expectNoHorizontalScroll(page, 'brief step 1 with the picker at 390px')
    await page.setViewportSize({ width: 1440, height: 900 })

    // The Content step: Tone, and no Goal.
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await toContentStep(page)
    await expect(page.getByRole('combobox', { name: 'Tone' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Goal' })).toHaveCount(0)
  })

  test('TC-PS-31: the image style on step 1 is pre-filled from the style, a look picked by hand is kept (also across 9:16), Path A has none', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('image-style-from-style')).toHaveCount(0)

    await styleCard(page, 'launch').click()
    await expect(lookCard(page, 'product-showcase')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('image-style-from-style')).toBeVisible()
    await styleCard(page, 'announcement').click()
    await expect(lookCard(page, 'editorial-split')).toHaveAttribute('aria-pressed', 'true')

    // A look picked by hand is kept when the style changes.
    await lookCard(page, 'product-showcase').click()
    await expect(page.getByTestId('image-style-from-style')).toHaveCount(0)
    await styleCard(page, 'event').click()
    await expect(lookCard(page, 'product-showcase')).toHaveAttribute('aria-pressed', 'true')
    // Choosing Classic by hand is a choice too.
    await lookCard(page, 'classic').click()
    await styleCard(page, 'launch').click()
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')

    // 9:16 (028): the looks are available there too, so a hand-picked Classic
    // stays Classic across the size change, both ways.
    await lookCard(page, 'classic').click()
    await styleCard(page, 'announcement').click()
    await page.getByRole('button', { name: /9:16 Story/ }).click()
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')
    await expect(lookCard(page, 'editorial-split')).toBeEnabled()
    await page.getByRole('button', { name: /1:1 Square/ }).click()
    // The size change dropped nothing: the hand-pick is still Classic.
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')

    // Path A has no image style at all.
    await page.getByRole('button', { name: /^Template/ }).click()
    await expect(page.getByTestId('image-style-section')).toHaveCount(0)
  })

  test('TC-PS-32: the style pre-fills the Tone, a Tone changed by hand is kept, and the Review shows the resolved rows', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await styleCard(page, 'promotion').click()
    await toContentStep(page)
    const tone = page.getByRole('combobox', { name: 'Tone' })
    await expect(tone).toHaveValue('bold')
    await expect(page.getByTestId('tone-from-style')).toBeVisible()

    // A tone changed by hand survives a different style.
    await tone.selectOption('casual')
    await expect(page.getByTestId('tone-from-style')).toHaveCount(0)
    await page.getByRole('button', { name: /back/i }).click()
    await styleCard(page, 'launch').click()
    await toContentStep(page)
    await expect(tone).toHaveValue('casual')
    await fillContent(page, `PS wizard rows ${tag()}`)
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(summary(page, 'Post style')).toHaveText('Launch / new offer')
    await expect(summary(page, 'Tone')).toHaveText('casual')
    await expect(summary(page, 'Image style')).toHaveText('Product showcase (from the post style)')
    await expect(page.getByRole('term').filter({ hasText: /^Goal$/ })).toHaveCount(0)

    // 9:16 (028): the Launch style still pre-fills its look on the Review (Path A has no image-style field to read: TC-PS-31).
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    await page.getByRole('button', { name: /9:16 Story/ }).click()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(summary(page, 'Image style')).toHaveText('Product showcase (from the post style)')
  })

  test('TC-PS-33: the request carries postStyle always, and tone and imageStyle only when touched', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await styleCard(page, 'launch').click()
    await toContentStep(page)
    await fillContent(page, `PS wizard body ${tag()}`)
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()

    // The brief POST is stubbed so no generation starts: this case is about what is sent.
    const bodies: Record<string, unknown>[] = []
    await page.route('**/api/briefs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      bodies.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'stubbed' }) })
    })
    // The listener is created before the click that triggers the request.
    let posted = nextPost(page, '/api/briefs')
    await page.getByRole('button', { name: 'Generate Post' }).click()
    await posted
    expect(bodies[0].postStyle).toBe('launch')
    expect('tone' in bodies[0]).toBe(false)
    expect('imageStyle' in bodies[0]).toBe(false)
    expect('goal' in bodies[0]).toBe(false)

    // Touch the tone and the look, then send again.
    await expect(page.getByRole('button', { name: 'Generate Post' })).toBeEnabled()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /back/i }).click()
    await lookCard(page, 'editorial-split').click()
    await toContentStep(page)
    await page.getByRole('combobox', { name: 'Tone' }).selectOption('casual')
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    posted = nextPost(page, '/api/briefs')
    await page.getByRole('button', { name: 'Generate Post' }).click()
    await posted
    expect(bodies[1]).toMatchObject({ postStyle: 'launch', tone: 'casual', imageStyle: 'editorial-split' })
    await page.unroute('**/api/briefs')
  })

  test('TC-PS-34: the stored style resumes (an unknown key and an old row open as General)', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await styleCard(page, 'event').click()
    await toContentStep(page)
    await fillContent(page, `PS wizard resume ${tag()}`)
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname === '/api/brief-drafts' &&
        (r.request().postDataJSON() as { payload: Record<string, unknown> }).payload.postStyle === 'event',
    )
    const draftId = ((await (await saved).json()) as { id: string }).id

    const row = (await (await admin.get(`/api/brief-drafts/${draftId}`)).json()) as { payload: Record<string, unknown> }
    expect(row.payload.postStyle).toBe('event')
    expect('goal' in row.payload).toBe(false)
    const put = (payload: Record<string, unknown>) => admin.put('/api/brief-drafts', { id: draftId, payload: { ...payload, step: 4 } })
    const reviewStyle = async () => {
      await page.goto(`/brief?resume=${draftId}`)
      await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible({ timeout: 20_000 })
      return summary(page, 'Post style')
    }

    expect((await put(row.payload)).status()).toBe(200)
    await expect(await reviewStyle()).toHaveText('Event')
    expect((await put({ ...row.payload, postStyle: 'ghost-style' })).status()).toBe(200)
    await expect(await reviewStyle()).toHaveText('General')

    // An old row: a goal, no style.
    const { postStyle: _gone, ...old } = row.payload
    expect((await put({ ...old, goal: 'hiring' })).status()).toBe(200)
    await expect(await reviewStyle()).toHaveText('General')
  })
})

test.describe('The project default post style', () => {
  test.skip(!MOCKED(), NOT_MOCKED)
  let name = ''
  let nameB = ''
  test.beforeAll(async () => {
    name = ((await (await admin.get(`/api/projects/${projA}`)).json()) as { name: string }).name
    nameB = ((await (await admin.get(`/api/projects/${projB}`)).json()) as { name: string }).name
  })
  test.afterEach(async () => {
    await admin.patch(`/api/projects/${projA}`, { defaultPostStyle: null })
  })

  test('TC-PS-35: the wizard opens with the project default selected; a project with none gives General', async ({ page }) => {
    const set = await admin.patch(`/api/projects/${projA}`, { defaultPostStyle: 'hiring' })
    expect(set.status()).toBe(200)
    await openStepOne(page, name)
    await expect(styleCard(page, 'hiring')).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: /back/i }).click()
    await page.getByRole('button', { name: new RegExp(nameB) }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')
  })

  test('TC-PS-36: an admin sets and clears the default on the project page; an editor sees text only', async ({ page, browser }) => {
    await pageLogin(page)
    await page.goto(`/projects/${projA}`)
    const select = page.getByTestId('project-default-post-style')
    await expect(select).toBeVisible()
    await expect(select).toHaveValue('')
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/projects/${projA}`)
    await select.selectOption('event')
    expect((await patched).status()).toBe(200)
    expect(((await (await admin.get(`/api/projects/${projA}`)).json()) as { defaultPostStyle: string }).defaultPostStyle).toBe('event')

    // An editor: the value as text, no select.
    const ctx = await browser.newContext()
    const editorPage = await ctx.newPage()
    await editorPage.goto('/login')
    await editorPage.getByPlaceholder('Username').fill(EDITOR_EMAIL)
    await editorPage.getByPlaceholder('Password').fill(PASSWORD)
    await editorPage.getByRole('button', { name: 'Sign in' }).click()
    await editorPage.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
    await editorPage.goto(`/projects/${projA}`)
    await expect(editorPage.getByTestId('project-default-post-style-text')).toHaveText('Event')
    await expect(editorPage.getByTestId('project-default-post-style')).toHaveCount(0)
    await ctx.close()

    // Clearing it.
    await page.goto(`/projects/${projA}`)
    const cleared = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/projects/${projA}`)
    await page.getByTestId('project-default-post-style').selectOption('')
    expect((await cleared).status()).toBe(200)
    expect(((await (await admin.get(`/api/projects/${projA}`)).json()) as { defaultPostStyle: string | null }).defaultPostStyle).toBeNull()
  })

  // The project create form has no post style select (the project page does, TC-PS-36),
  // so the create route is checked directly.
  test('TC-PS-37: the create route takes a default post style and refuses an unknown one', async () => {
    const created = await admin.post('/api/projects', { name: `PS created ${tag()}`, defaultPostStyle: 'tip' })
    expect(created.status()).toBe(201)
    const body = (await created.json()) as { id: string; defaultPostStyle: string }
    expect(body.defaultPostStyle).toBe('tip')
    await admin.del(`/api/projects/${body.id}`)

    const refused = await admin.post('/api/projects', { name: `PS refused ${tag()}`, defaultPostStyle: 'nope' })
    expect(refused.status()).toBe(400)
    expect((await refused.json()).code).toBe('UNKNOWN_POST_STYLE')
  })
})

test.describe('The draft page: the facts notice and the style line', () => {
  test.skip(!MOCKED(), NOT_MOCKED)

  test('TC-PS-39: a flagged draft shows the notice, a clear one does not, the check that could not run says so, and Download stays enabled', async ({ page }) => {
    await pageLogin(page)
    await page.setViewportSize({ width: 1440, height: 900 })

    const flagged = await generate(admin, { topic: `__MOCK_FACT_PRICE__ __MOCK_FACT_DATE__ PS notice ${tag()}`, postStyle: 'promotion' })
    expect(flagged.factsCheck?.status).toBe('flagged')
    await page.goto(`/drafts/${flagged.id}`)
    const notice = page.getByTestId('facts-check-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toHaveAttribute('data-status', 'flagged')
    await expect(notice).toContainText('$49')
    await expect(notice).toContainText('30 March 2027')
    await expect(notice).toContainText('(general caption)')
    await expect(notice).toContainText('These are not in your brief, project or brand voice. Check them before you download it.')
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
    await expect(page.getByTestId('post-style-line')).toHaveText('Post style: Promotion / deal')
    await expectNoAxeViolations(page, '/drafts/[id] with the facts notice', { settle: true })
    await page.setViewportSize({ width: 390, height: 900 })
    await expect(notice).toBeVisible()
    await expectNoHorizontalScroll(page, '/drafts/[id] with the facts notice at 390px')
    await page.setViewportSize({ width: 1440, height: 900 })

    // A clear check shows nothing.
    const clear = await generate(admin, { topic: `PS clear ${tag()}` })
    expect(clear.factsCheck?.status).toBe('clear')
    await page.goto(`/drafts/${clear.id}`)
    await expect(page.getByTestId('post-style-line')).toBeVisible()
    await expect(page.getByTestId('facts-check-notice')).toHaveCount(0)

    // A null check (never checked) shows nothing.
    if (dbAvailable) {
      await prisma!.draft.update({ where: { id: clear.id }, data: { factsCheck: Prisma.DbNull } })
      await page.reload()
      await expect(page.getByTestId('post-style-line')).toBeVisible()
      await expect(page.getByTestId('facts-check-notice')).toHaveCount(0)
    }

    // A check that could not run.
    const errored = await generate(admin, { topic: `__MOCK_FACT_ERROR__ PS error ${tag()}` })
    expect(errored.factsCheck?.status).toBe('error')
    await page.goto(`/drafts/${errored.id}`)
    await expect(page.getByTestId('facts-check-notice')).toContainText('The facts check could not run for this post.')
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  })
})

test.describe('The insights page: Post styles', () => {
  test.skip(!MOCKED(), NOT_MOCKED)

  const SEAM = '/api/test/analytics-events'
  test.afterAll(async () => {
    if (admin) await admin.del(SEAM)
  })

  test('TC-PS-40: the section equals a hand count over seeded events, an unchosen style shows zeros, and an editor is refused', async ({ page }) => {
    expect((await admin.del(SEAM)).status()).toBe(204)
    const team = await findTeamIdByName(admin, 'Bistec')
    const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
    const row = (name: string, postStyle: string | null, outcome: string | null, extra: Record<string, unknown> = {}, h = 1) => ({
      name, source: 'web', teamId: team, userId: null, outcome, at: at(h),
      payload: { postStyle, ...extra },
    })
    const gen = (style: string | null, factsStatus: string | null) =>
      row('generation.finished', style, 'ok', factsStatus ? { factsStatus, factsFlagCount: factsStatus === 'flagged' ? 2 : 0 } : {})
    const rows = [
      // launch: chosen 3, generations 4 (2 flagged, 1 error, 1 clear)
      ...Array.from({ length: 3 }, () => row('brief.submitted', 'launch', null)),
      gen('launch', 'flagged'), gen('launch', 'flagged'), gen('launch', 'error'), gen('launch', 'clear'),
      // tip: chosen 1, generations 1 (clear)
      row('brief.submitted', 'tip', null), gen('tip', 'clear'),
      // hiring: generations 2 with no chosen brief (an MCP one), 1 flagged
      gen('hiring', 'flagged'), gen('hiring', 'clear'),
      // not counted: no style, and out of the range
      gen(null, 'flagged'),
      { ...gen('event', 'flagged'), at: at(100 * 24) },
    ]
    expect((await admin.post(SEAM, { seed: rows })).status()).toBe(200)

    const api = await (await admin.get('/api/admin/insights?range=30d')).json()
    const byKey = Object.fromEntries(api.postStyles.map((r: { style: string }) => [r.style, r]))
    expect(api.postStyles).toHaveLength(8)
    expect(byKey.launch).toMatchObject({ chosen: 3, generations: 4, flagged: 2, flagRate: 0.5 })
    expect(byKey.tip).toMatchObject({ chosen: 1, generations: 1, flagged: 0, flagRate: 0 })
    expect(byKey.hiring).toMatchObject({ chosen: 0, generations: 2, flagged: 1, flagRate: 0.5 })
    for (const k of ['general', 'promotion', 'event', 'announcement', 'milestone']) {
      expect(byKey[k]).toMatchObject({ chosen: 0, generations: 0, flagged: 0, flagRate: null })
    }

    await pageLogin(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/insights')
    const section = page.getByTestId('section-post-styles')
    await expect(section).toBeVisible()
    // 037 AC-16: no Held column.
    await expect(section.getByRole('columnheader', { name: 'Held' })).toHaveCount(0)
    await expect(section.getByRole('columnheader', { name: 'Flagged' })).toHaveCount(1)
    await expect(page.getByTestId('post-style-launch')).toContainText('3')
    await expect(page.getByTestId('post-style-rate-launch')).toHaveText('50%')
    await expect(page.getByTestId('post-style-rate-tip')).toHaveText('0%')
    await expect(page.getByTestId('post-style-rate-milestone')).toHaveText('–')
    await expect(page.getByTestId('post-style-milestone')).toContainText('0')
    await expectNoAxeViolations(page, '/admin/insights post styles', { settle: true })

    // The review captures (gitignored): 1440 px and 390 px, light and dark.
    for (const [width, height] of [[1440, 900], [390, 900]]) {
      await page.setViewportSize({ width, height })
      if (width === 390) await expectNoHorizontalScroll(page, '/admin/insights post styles at 390px')
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await section.screenshot({ path: `ui-captures/027/post-styles-${width}-${scheme}.png` })
      }
    }

    const ed = await loginAs(page.request, EDITOR_EMAIL, PASSWORD)
    try {
      expect((await ed.get('/api/admin/insights')).status()).toBe(403)
    } finally {
      await ed.dispose()
    }
    expect((await admin.del(SEAM)).status()).toBe(204)
  })
})
