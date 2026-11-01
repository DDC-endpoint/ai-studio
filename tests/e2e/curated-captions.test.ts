import { createHash } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, curate, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable, seedCuratedCaption, setBriefTopic } from '../helpers/db'
import { ADMIN_EMAIL, ADMIN_PASSWORD, pageLogin } from '../helpers/ui'

// §AN — Curated captions (change 039 T3: AC-08 to AC-16, AC-23, AC-24 (the curate
// clauses); docs/e2e-test-plan.md).
//
// A post has one general caption. Under it, the author or a team admin curates
// a caption for Instagram, LinkedIn or Facebook: one model call, one
// curated row per channel, made on request. Edit, regenerate and delete each
// keep one step of undo, on the server.
//
// Deterministic seams (MOCK_AI + MOCK_PUPPETEER):
//   - the mock curated caption is "Mock <Label> caption [<topic>] [from general]"
//     when the prompt carried the general caption;
//   - "__FAIL_CURATED__" in the topic omits every curated key (the brief's topic
//     is set through the test DB, as it flows into the next call);
//   - the mock Facebook caption is 50 words with 2 hashtags and no link; "__MOCK_CURATE_LINK__"
//     puts a link in it (refused: link-in-reply), "__MOCK_CURATE_SHORT__" makes it 12 words and
//     "__MOCK_CURATE_HASHTAGS__" gives it 5 hashtags (stored, with a notice);
//   - "__MOCK_FACT_PRICE__" appends "$49" to every caption (the facts check);
//   - POST /api/test/caption-limit sets the per-user caption limit (admin only);
//     cases that set it clear it in `finally`.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const CALLS = '/api/test/model-calls'
const LIMIT = '/api/test/caption-limit'

type Caption = {
  kind: 'GENERAL' | 'CURATED'
  channel: 'INSTAGRAM' | 'LINKEDIN' | 'FACEBOOK' | null
  target: 'GENERAL' | 'INSTAGRAM' | 'LINKEDIN' | 'FACEBOOK'
  text: string
  status: 'PENDING' | 'READY' | 'FAILED'
  failureReason: string | null
  updatedAt: string
  deleted: boolean
  canUndo: boolean
  rules: { met: boolean; unmet: string[] }
}
type Draft = Record<string, unknown>
type Flag = { where: string; kind: string; value: string }

const captionsOf = (draft: Draft) => draft.captions as Caption[]
const captionOf = (draft: Draft, target: Caption['target']) => captionsOf(draft).find((c) => c.target === target)
const flagsOf = (draft: Draft, where: string) =>
  ((draft.factsCheck as { flagged: Flag[] } | null)?.flagged ?? []).filter((f) => f.where === where)
const sha16 = (text: string) => createHash('sha256').update(text.trim()).digest('hex').slice(0, 16)

// One kit per worker, shared by every generation in this suite.
let suiteKitId: string | null = null
async function suiteKit(api: ApiClient): Promise<string> {
  if (suiteKitId) return suiteKitId
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `Curated Kit ${Date.now()}`, colors: ['#0b6e4f'] })
  ).json()
  suiteKitId = kit.id as string
  return suiteKitId
}

// A Path B post as `who`, polled until EXPORTED. Returns the draft (with briefId).
async function mint(who: ApiClient, topic: string, kitId?: string): Promise<Draft> {
  const brief = await (
    await who.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      brandKitId: kitId ?? (await suiteKit(who)),
    })
  ).json()
  const res = await who.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  const draft = await waitForDraft(who, draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

test.describe('§AN — curated captions', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  const read = async (id: unknown) => (await (await api.get(`/api/drafts/${id}`)).json()) as Draft
  const row = (draftId: string, channel: 'INSTAGRAM' | 'LINKEDIN' | 'FACEBOOK') =>
    prisma!.draftCaption.findFirstOrThrow({ where: { draftId, kind: 'CURATED', channel } })

  // TC-CUR-01 — AC-08: curate makes the row, from the general caption.
  test('curating Instagram makes a READY curated row written from the general caption', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cur One ${Date.now()}`
    const draft = await mint(api, topic)
    const id = draft.id as string
    const general = await prisma!.draftCaption.findFirstOrThrow({ where: { draftId: id, kind: 'GENERAL' } })
    expect(await prisma!.draftCaption.count({ where: { draftId: id } })).toBe(1)

    expect((await api.del(CALLS)).status()).toBe(204)
    const res = await api.post(`/api/drafts/${id}/regenerate-copy`, { channel: 'INSTAGRAM' })
    expect(res.status()).toBe(202)
    const done = await waitForAction(api, id)
    expect(done.pendingActionError).toBeNull()

    const ig = await row(id, 'INSTAGRAM')
    expect(ig).toMatchObject({ kind: 'CURATED', channel: 'INSTAGRAM', status: 'READY', deletedAt: null })
    expect(ig.text).toBe(`Mock Instagram caption [${topic}] [from general]`)
    expect(ig.text).toContain('[from general]')
    expect(ig.generalHash).toBe(sha16(general.text))
    expect(captionsOf(done).map((c) => c.target)).toEqual(['GENERAL', 'INSTAGRAM'])

    const calls = (await (await api.get(CALLS)).json()).calls as { surface: string }[]
    expect(calls.filter((c) => c.surface === 'CAPTION')).toHaveLength(1)

    // The general caption is untouched.
    const after = await prisma!.draftCaption.findFirstOrThrow({ where: { draftId: id, kind: 'GENERAL' } })
    expect(after.text).toBe(general.text)
    expect(after.updatedAt.getTime()).toBe(general.updatedAt.getTime())
  })

  // TC-CUR-02 — AC-09: a curate replaces after a successful settle only.
  test('a second curate replaces the text and keeps the earlier one; a failed curate leaves it alone', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cur Replace ${Date.now()}`
    const draft = await mint(api, topic)
    const id = draft.id as string
    await curate(api, id, 'INSTAGRAM')

    // A hand edit, so the second curate's text differs from what it replaces.
    const edited = await api.patch(`/api/drafts/${id}`, { channel: 'INSTAGRAM', text: 'Hand edit' })
    expect(edited.status()).toBe(200)
    const second = await curate(api, id, 'INSTAGRAM')
    const ig = captionOf(second, 'INSTAGRAM')!
    expect(ig.text).toBe(`Mock Instagram caption [${topic}] [from general]`)
    expect(ig.canUndo).toBe(true)
    const stored = await row(id, 'INSTAGRAM')
    expect((stored.previous as { text: string }).text).toBe('Hand edit')

    // The topic now makes the mock omit every curated key: the next curate fails.
    await setBriefTopic(draft.briefId as string, `${topic} __FAIL_CURATED__`)
    const third = await curate(api, id, 'INSTAGRAM')
    const failed = captionOf(third, 'INSTAGRAM')!
    expect(failed.text).toBe(ig.text)
    expect(failed.status).toBe('READY')
    expect(failed.failureReason).toMatch(/^Regenerate failed:/)
    expect((await row(id, 'INSTAGRAM')).previous).toEqual(stored.previous)
  })

  // TC-CUR-03 — AC-10: edit and undo.
  test('an edit and an undo swap the text, a second undo swaps it back, and the general caption edits too', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cur Undo ${Date.now()}`
    const draft = await mint(api, topic)
    const id = draft.id as string
    const curated = captionOf(await curate(api, id, 'INSTAGRAM'), 'INSTAGRAM')!
    expect(curated.canUndo).toBe(false)

    const edit = await api.patch(`/api/drafts/${id}`, { channel: 'INSTAGRAM', text: 'Hand edit' })
    expect(edit.status()).toBe(200)
    expect(captionOf((await edit.json()) as Draft, 'INSTAGRAM')!.canUndo).toBe(true)

    const undo = await api.post(`/api/drafts/${id}/captions/undo`, { channel: 'INSTAGRAM' })
    expect(undo.status()).toBe(200)
    expect(captionOf((await undo.json()) as Draft, 'INSTAGRAM')!.text).toBe(curated.text)

    const redo = await api.post(`/api/drafts/${id}/captions/undo`, { channel: 'INSTAGRAM' })
    expect(redo.status()).toBe(200)
    expect(captionOf((await redo.json()) as Draft, 'INSTAGRAM')!.text).toBe('Hand edit')

    const general = await api.patch(`/api/drafts/${id}`, { kind: 'GENERAL', text: 'A hand-written general caption' })
    expect(general.status()).toBe(200)
    expect(captionOf((await general.json()) as Draft, 'GENERAL')!.text).toBe('A hand-written general caption')
    const generalUndo = await api.post(`/api/drafts/${id}/captions/undo`, { kind: 'GENERAL' })
    expect(generalUndo.status()).toBe(200)
    expect(captionOf((await generalUndo.json()) as Draft, 'GENERAL')!.text).toBe(`Mock General caption [${topic}]`)

    // A channel with no row, and a row with nothing to undo.
    const missing = await api.patch(`/api/drafts/${id}`, { channel: 'LINKEDIN', text: 'x' })
    expect(missing.status()).toBe(404)
    expect((await missing.json()).code).toBe('caption-not-found')
    const noRow = await api.post(`/api/drafts/${id}/captions/undo`, { channel: 'LINKEDIN' })
    expect(noRow.status()).toBe(404)
    const fresh = await mint(api, `Cur Nothing ${Date.now()}`)
    const nothing = await api.post(`/api/drafts/${fresh.id}/captions/undo`, { kind: 'GENERAL' })
    expect(nothing.status()).toBe(409)
    expect((await nothing.json()).code).toBe('nothing-to-undo')
  })

  // TC-CUR-04 — AC-11: delete is soft, leaves the facts check and the general caption, and can be undone.
  test('a delete hides the caption from the facts check and the editor, and undo brings it back', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cur Delete __MOCK_FACT_PRICE__ ${Date.now()}`
    const draft = await mint(api, topic)
    const id = draft.id as string
    const curated = await curate(api, id, 'INSTAGRAM')
    expect(flagsOf(curated, 'INSTAGRAM').map((f) => f.value)).toEqual(['$49'])

    const deleted = await api.del(`/api/drafts/${id}/captions?channel=INSTAGRAM`)
    expect(deleted.status()).toBe(200)
    const body = (await deleted.json()) as Draft
    expect(captionOf(body, 'INSTAGRAM')).toMatchObject({ deleted: true, canUndo: true })
    expect(flagsOf(await read(id), 'INSTAGRAM')).toEqual([])
    expect(flagsOf(await read(id), 'GENERAL')).toHaveLength(1)

    const edit = await api.patch(`/api/drafts/${id}`, { channel: 'INSTAGRAM', text: 'x' })
    expect(edit.status()).toBe(409)
    expect((await edit.json()).code).toBe('caption-deleted')
    // A deleted row cannot be deleted again.
    expect((await api.del(`/api/drafts/${id}/captions?channel=INSTAGRAM`)).status()).toBe(404)

    const undo = await api.post(`/api/drafts/${id}/captions/undo`, { channel: 'INSTAGRAM' })
    expect(undo.status()).toBe(200)
    expect(captionOf((await undo.json()) as Draft, 'INSTAGRAM')).toMatchObject({ deleted: false })
    expect(flagsOf(await read(id), 'INSTAGRAM').map((f) => f.value)).toEqual(['$49'])

    // The general caption is never deleted.
    for (const query of ['channel=GENERAL', 'kind=GENERAL']) {
      const res = await api.del(`/api/drafts/${id}/captions?${query}`)
      expect(res.status(), query).toBe(400)
      expect((await res.json()).code).toBe('general-not-deletable')
    }

    // A failed first curate has no text and nothing to undo: it is removed.
    await seedCuratedCaption(id, 'LINKEDIN', '', 'FAILED')
    expect(captionOf(await read(id), 'LINKEDIN')).toMatchObject({ status: 'FAILED' })
    const removed = await api.del(`/api/drafts/${id}/captions?channel=LINKEDIN`)
    expect(removed.status()).toBe(200)
    expect(captionOf((await removed.json()) as Draft, 'LINKEDIN')).toBeUndefined()
    expect(await prisma!.draftCaption.count({ where: { draftId: id, channel: 'LINKEDIN' } })).toBe(0)
  })

  // TC-CUR-05 — AC-12: one caption action at a time.
  test('while a curate holds the post, another curate and a delete of its PENDING row get 409', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await mint(api, `Cur Flight ${Date.now()}`)
    const id = draft.id as string
    // A curated Instagram caption already written; a re-curate is now in flight.
    await curate(api, id, 'INSTAGRAM')
    await prisma!.draft.update({ where: { id }, data: { pendingAction: 'REGENERATE_COPY' } })
    await prisma!.draftCaption.updateMany({ where: { draftId: id, channel: 'INSTAGRAM' }, data: { status: 'PENDING' } })
    try {
      const other = await api.post(`/api/drafts/${id}/regenerate-copy`, { channel: 'LINKEDIN' })
      expect(other.status()).toBe(409)
      expect(await prisma!.draftCaption.count({ where: { draftId: id, channel: 'LINKEDIN' } })).toBe(0)

      const del = await api.del(`/api/drafts/${id}/captions?channel=INSTAGRAM`)
      expect(del.status()).toBe(409)
      expect((await del.json()).error).toBe('This caption is being generated')
      const undo = await api.post(`/api/drafts/${id}/captions/undo`, { channel: 'INSTAGRAM' })
      expect(undo.status()).toBe(409)
    } finally {
      await prisma!.draftCaption.updateMany({ where: { draftId: id, channel: 'INSTAGRAM' }, data: { status: 'READY' } })
      await prisma!.draft.update({ where: { id }, data: { pendingAction: null } })
    }
  })

  // TC-CUR-06 — AC-13: the per-user limit, through the seam.
  test('a curate over the per-user limit gets 429 with Retry-After, and nothing is claimed or called', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await mint(api, `Cur Limit ${Date.now()}`)
    const id = draft.id as string
    try {
      expect((await api.post(LIMIT, { limit: 2 })).status()).toBe(200)
      await curate(api, id, 'INSTAGRAM')
      await curate(api, id, 'LINKEDIN')

      expect((await api.del(CALLS)).status()).toBe(204)
      const third = await api.post(`/api/drafts/${id}/regenerate-copy`, { channel: 'INSTAGRAM' })
      expect(third.status()).toBe(429)
      expect((await third.json()).code).toBe('rate-limited')
      expect(Number(third.headers()['retry-after'])).toBeGreaterThanOrEqual(1)
      const calls = (await (await api.get(CALLS)).json()).calls as unknown[]
      expect(calls).toHaveLength(0)
      expect((await read(id)).pendingAction).toBeNull()
    } finally {
      expect((await api.post(LIMIT, { limit: null })).status()).toBe(200)
    }
    // Cleared: the same call is admitted again.
    expect((await curate(api, id, 'INSTAGRAM')).pendingActionError).toBeNull()
  })

  // TC-CUR-06b — the seam itself (AC-13): admin only.
  test('the caption-limit seam answers 403 to a non-admin and rejects a bad body', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      expect((await editor.post(LIMIT, { limit: 1 })).status()).toBe(403)
    } finally {
      await editor.dispose()
    }
    expect((await api.post(LIMIT, { limit: 0 })).status()).toBe(400)
    expect((await api.post(LIMIT, {})).status()).toBe(400)
  })

  // TC-CUR-07 — AC-16: a value in the general caption is flagged there and in a curated caption.
  test('a value the sources do not state is flagged on the general caption and on a curated one, and the page says so', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await mint(api, `Cur Facts __MOCK_FACT_PRICE__ ${Date.now()}`)
    const id = draft.id as string
    await curate(api, id, 'INSTAGRAM')
    const after = await read(id)
    expect(flagsOf(after, 'GENERAL').map((f) => f.value)).toEqual(['$49'])
    expect(flagsOf(after, 'INSTAGRAM').map((f) => f.value)).toEqual(['$49'])
    expect(captionOf(after, 'INSTAGRAM')).toMatchObject({ facts: { status: 'flagged' } })

    await openDraft(page, id)
    const line = page.getByTestId('general-flagged')
    await expect(line).toHaveText(/The general caption has values your sources don.t state/)
    // The flagged-general line sits above the curate controls.
    const lineBox = (await line.boundingBox())!
    const curateBox = (await page.getByRole('button', { name: 'Curate for LinkedIn' }).boundingBox())!
    expect(lineBox.y).toBeLessThan(curateBox.y)
    // The Instagram card shows $49 in its own facts line.
    const card = page.getByRole('textbox', { name: 'Instagram caption', exact: true }).locator('..')
    await expect(card.getByTestId('caption-facts')).toContainText('$49')
  })

  // A kit of its own (the suite kit stays without a website), optionally with one.
  async function ownKit(label: string, website: string | null): Promise<string> {
    const kit = await (
      await api.post('/api/admin/brandkits', { name: `Cur ${label} Kit ${Date.now()}`, colors: ['#0b6e4f'] })
    ).json()
    if (website) expect((await api.patch(`/api/admin/brandkits/${kit.id}`, { website })).status()).toBe(200)
    return kit.id as string
  }
  const fiftyWords = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')

  // TC-CUR-08 — AC-17: the kit has a website, and a Facebook curate carries it exactly once, on its own line.
  test('a Facebook curate carries the kit website once, on its own line, before the hashtags', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const site = 'https://acme.example/shop'
    const draft = await mint(api, `Cur Fb Link ${Date.now()}`, await ownKit('Site', site))
    const id = draft.id as string
    expect(draft.kitWebsite).toBe(site)
    const done = await curate(api, id, 'FACEBOOK')
    const fb = captionOf(done, 'FACEBOOK')!
    expect(fb).toMatchObject({ kind: 'CURATED', channel: 'FACEBOOK', status: 'READY', deleted: false })
    expect(fb.text.split(site)).toHaveLength(2)
    const lines = fb.text.split('\n')
    expect(lines.filter((l) => l === site)).toHaveLength(1)
    // After the body and before the closing hashtag line.
    expect(lines.indexOf(site)).toBeLessThan(lines.indexOf('#mock #facebook'))
    expect(lines.at(-1)).toBe('#mock #facebook')
    expect((await row(id, 'FACEBOOK')).text).toBe(fb.text)
    expect(fb.rules).toEqual({ met: true, unmet: [] })
    expect(done.kitWebsite).toBe(site)
  })

  // TC-CUR-09 — AC-17: the kit has no website; the text has no link, and the button and the card say so.
  test('a Facebook curate on a kit with no website has no link, and the button and the card show the line', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await mint(api, `Cur Fb None ${Date.now()}`, await ownKit('None', null))
    const id = draft.id as string
    expect(draft.kitWebsite).toBeNull()
    await openDraft(page, id)
    const line = 'This brand kit has no website, so the call to action has no link. A team admin can add one in Brand kits.'
    await expect(page.getByRole('button', { name: 'Curate for Facebook' })).toBeVisible()
    await expect(page.getByTestId('curate-no-website')).toHaveText(line)

    const curated = page.waitForResponse(
      (r) => r.url().endsWith(`/api/drafts/${id}/regenerate-copy`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Curate for Facebook' }).click()
    expect((await curated).status()).toBe(202)
    const field = page.getByRole('textbox', { name: 'Facebook caption', exact: true })
    await expect(field).not.toHaveValue('', { timeout: 20_000 })
    expect(await field.inputValue()).not.toMatch(/https?:|www\./)
    await expect(page.getByTestId('caption-no-website')).toHaveText(line)
    // The curate button is gone with its row, and so is its line.
    await expect(page.getByTestId('curate-no-website')).toHaveCount(0)
    const stored = captionOf(await (await api.get(`/api/drafts/${id}`)).json(), 'FACEBOOK')!
    expect(stored.text).not.toMatch(/https?:|www\./)
  })

  // TC-CUR-10 — AC-17: a link in the model's reply is refused; a first curate fails, a regenerate keeps the text.
  test('a Facebook reply with a link is refused: the first curate is FAILED with no text, and a regenerate keeps the text', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cur Fb Refuse ${Date.now()}`
    const draft = await mint(api, `${topic} __MOCK_CURATE_LINK__`, await ownKit('Refuse', 'https://acme.example'))
    const id = draft.id as string
    const first = await curate(api, id, 'FACEBOOK')
    const failed = captionOf(first, 'FACEBOOK')!
    expect(failed).toMatchObject({ status: 'FAILED', text: '', failureReason: 'link-in-reply' })
    expect(await row(id, 'FACEBOOK')).toMatchObject({ status: 'FAILED', text: '', failureReason: 'link-in-reply' })

    // The topic is fixed through the test DB, and a curate succeeds.
    await setBriefTopic(draft.briefId as string, topic)
    const ok = captionOf(await curate(api, id, 'FACEBOOK'), 'FACEBOOK')!
    expect(ok.status).toBe('READY')
    expect(ok.text).toContain('https://acme.example')

    // The sentinel is set again: the regenerate is refused and the old text stays.
    await setBriefTopic(draft.briefId as string, `${topic} __MOCK_CURATE_LINK__`)
    const again = captionOf(await curate(api, id, 'FACEBOOK'), 'FACEBOOK')!
    expect(again.text).toBe(ok.text)
    expect(again.status).toBe('READY')
    expect(again.failureReason).toBe('Regenerate failed: link-in-reply')
  })

  // TC-CUR-11 — AC-18: an out-of-range Facebook caption is stored with a notice (Q3), and the notice clears when fixed.
  test('a short Facebook caption is stored with its rule notice, which clears after an edit to 50 words', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await mint(api, `Cur Fb Short ${Date.now()} __MOCK_CURATE_SHORT__`, await ownKit('Short', null))
    const id = draft.id as string
    const done = await curate(api, id, 'FACEBOOK')
    const fb = captionOf(done, 'FACEBOOK')!
    expect(fb.status).toBe('READY')
    expect(fb.text).not.toBe('')
    expect(fb.rules).toEqual({ met: false, unmet: ['words-under'] })

    await openDraft(page, id)
    const field = page.getByRole('textbox', { name: 'Facebook caption', exact: true })
    const card = field.locator('..')
    await expect(card.getByTestId('caption-rule')).toHaveText('Facebook asks for 40 to 120 words. This has 12.')

    const edited = await api.patch(`/api/drafts/${id}`, { channel: 'FACEBOOK', text: fiftyWords })
    expect(edited.status()).toBe(200)
    const after = captionOf(await (await api.get(`/api/drafts/${id}`)).json(), 'FACEBOOK')!
    expect(after.rules).toEqual({ met: true, unmet: [] })
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Facebook caption', exact: true })).toHaveValue(fiftyWords, { timeout: 20_000 })
    await expect(page.getByTestId('caption-rule')).toHaveCount(0)
  })

  // 039 D9: more than 3 hashtags is stored too, with the notice.
  test('a Facebook caption with 5 hashtags is stored with the hashtag notice', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await mint(api, `Cur Fb Tags ${Date.now()} __MOCK_CURATE_HASHTAGS__`, await ownKit('Tags', null))
    const fb = captionOf(await curate(api, draft.id as string, 'FACEBOOK'), 'FACEBOOK')!
    expect(fb.status).toBe('READY')
    expect(fb.rules).toEqual({ met: false, unmet: ['hashtags-over'] })
  })

  // TC-CUR-12 — AC-23: the caption desk.
  test('the caption desk: curate, copy, delete and undo from the page', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const topic = `Cur Desk ${Date.now()}`
    const draft = await mint(api, topic)
    const id = draft.id as string
    await openDraft(page, id)

    // The general caption, with Copy and Regenerate, and the curate buttons.
    await expect(page.getByRole('heading', { name: 'General caption', level: 3 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy general caption' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Regenerate general caption' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Curated captions', level: 3 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Curate for Instagram' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Curate for LinkedIn' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Curate for Facebook' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Regenerate all/ })).toHaveCount(0)

    // Curate LinkedIn: the card appears with its own controls, and its button goes.
    const curated = page.waitForResponse(
      (r) => r.url().endsWith(`/api/drafts/${id}/regenerate-copy`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Curate for LinkedIn' }).click()
    expect((await curated).status()).toBe(202)
    const linkedin = page.getByRole('textbox', { name: 'LinkedIn caption', exact: true })
    const text = `Mock LinkedIn caption [${topic}] [from general]`
    await expect(linkedin).toHaveValue(text, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Copy LinkedIn caption' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Regenerate LinkedIn caption' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete LinkedIn caption' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Curate for LinkedIn' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Curate for Instagram' })).toBeVisible()

    // Copy puts the text on the clipboard.
    await page.getByRole('button', { name: 'Copy LinkedIn caption' }).click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text)

    // Delete: "Deleted" with Undo, and the field is gone.
    const removed = page.waitForResponse(
      (r) => r.url().includes(`/api/drafts/${id}/captions?channel=LINKEDIN`) && r.request().method() === 'DELETE',
    )
    await page.getByRole('button', { name: 'Delete LinkedIn caption' }).click()
    expect((await removed).status()).toBe(200)
    await expect(page.getByText('Deleted', { exact: true })).toBeVisible()
    await expect(linkedin).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo LinkedIn caption' })).toBeVisible()

    // Undo brings the card back.
    const undone = page.waitForResponse(
      (r) => r.url().endsWith(`/api/drafts/${id}/captions/undo`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Undo LinkedIn caption' }).click()
    expect((await undone).status()).toBe(200)
    await expect(page.getByRole('textbox', { name: 'LinkedIn caption', exact: true })).toHaveValue(text)
    await expect(page.getByText('Deleted', { exact: true })).toHaveCount(0)
  })

  // 039 FR-16: a rules miss shows under the field and clears once the text is fixed.
  test('an Instagram caption with too many hashtags shows its rule line, which clears when fixed', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await mint(api, `Cur Rules ${Date.now()}`)
    const id = draft.id as string
    await curate(api, id, 'INSTAGRAM')
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ')
    await prisma!.draftCaption.updateMany({
      where: { draftId: id, channel: 'INSTAGRAM' },
      data: { text: `Body\n${tags}` },
    })
    await openDraft(page, id)
    const card = page.getByRole('textbox', { name: 'Instagram caption', exact: true }).locator('..')
    await expect(card.getByTestId('caption-rule')).toContainText('allows at most 30 hashtags. This has 31.')
    await page.getByRole('textbox', { name: 'Instagram caption', exact: true }).fill('Body\n#one')
    await expect(card.getByTestId('caption-rule')).toHaveCount(0)
  })

  async function openDraft(page: Page, id: unknown) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })
  }
})
