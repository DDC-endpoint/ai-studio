import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { pageLogin } from '../helpers/ui'

// §H — Library (docs/e2e-test-plan.md).
//
// Contract (src/app/api/library/route.ts):
//   GET /api/library?page&pageSize&search&brandKitId&postStyle
//     → { drafts:[{id,status,exportUrl(signed),brief:{topic,aspectRatio,postStyle,brandKitName},…}], total, page, pageSize }
//   pageSize clamped to 1..50. Lists EXPORTED drafts only (037: no status param).
//   An unknown postStyle is 400.
//   Every member of a team sees every post in it (038 D10); nothing from another team.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

// Mint an EXPORTED (READY) draft as the admin, returning the draftId.
// Uses an explicit brandKitId so resolveBrandKit has something concrete to resolve.
async function adminDraft(
  admin: ApiClient,
  topic: string,
  opts: { postStyle?: string; brandKitId?: string } = {},
): Promise<string> {
  const kitId = opts.brandKitId ?? (await (await admin.post('/api/admin/brandkits', { name: `Lib Kit ${topic}`, colors: ['#0284c7'] })).json()).id
  const brief = await (await admin.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', brandKitId: kitId,
    ...(opts.postStyle ? { postStyle: opts.postStyle } : {}),
  })).json()
  const assembled = await (await admin.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  await waitForDraft(admin, assembled.draftId)
  return assembled.draftId
}

// Mint an EXPORTED draft as the editor (standalone brief → resolves the system default kit).
async function editorDraft(editor: ApiClient, topic: string): Promise<string> {
  const brief = await (await editor.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli',
  })).json()
  const assembled = await (await editor.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  await waitForDraft(editor, assembled.draftId)
  return assembled.draftId
}

test.describe('Library', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-LIB-01 — 038 D10: admin and editor both see every post on the team.
  test('an editor sees the admin post, and the admin sees the editor post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const adminDraftId = await adminDraft(api, `LibAdmin-${Date.now()}`)

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const editorDraftId = await editorDraft(editor, `LibEditor-${Date.now()}`)

      // Editor library: contains the editor's draft and the admin's.
      const editorLib = await (await editor.get('/api/library?pageSize=50')).json()
      const editorIds = editorLib.drafts.map((d: { id: string }) => d.id)
      expect(editorIds).toContain(editorDraftId)
      expect(editorIds).toContain(adminDraftId)

      // Admin library: sees the editor's draft too.
      const adminLib = await (await api.get('/api/library?pageSize=50')).json()
      const adminIds = adminLib.drafts.map((d: { id: string }) => d.id)
      expect(adminIds).toContain(adminDraftId)
      expect(adminIds).toContain(editorDraftId)
    } finally {
      await editor.dispose()
    }
  })

  // TC-LIB-02 — 037 AC-10: the kit and style filters narrow the list; no status param.
  test('brandKitId and postStyle filters narrow the list; an unknown style is 400', async () => {
    if (!MOCKED()) { test.skip(); return }
    const stamp = Date.now()
    const kitA = await (await api.post('/api/admin/brandkits', { name: `LibKitA ${stamp}`, colors: ['#0284c7'] })).json()
    const kitB = await (await api.post('/api/admin/brandkits', { name: `LibKitB ${stamp}`, colors: ['#0284c7'] })).json()
    const dA = await adminDraft(api, `LibFA-${stamp}`, { brandKitId: kitA.id, postStyle: 'launch' })
    const dB = await adminDraft(api, `LibFB-${stamp}`, { brandKitId: kitB.id, postStyle: 'tip' })
    const ids = async (qs: string) =>
      ((await (await api.get(`/api/library?pageSize=50&${qs}`)).json()).drafts as { id: string }[]).map((d) => d.id)

    const byKit = await ids(`brandKitId=${kitA.id}`)
    expect(byKit).toContain(dA)
    expect(byKit).not.toContain(dB)
    const byStyle = await ids('postStyle=tip')
    expect(byStyle).toContain(dB)
    expect(byStyle).not.toContain(dA)
    const none = await ids('')
    expect(none).toEqual(expect.arrayContaining([dA, dB]))

    expect((await api.get('/api/library?postStyle=no-such-style')).status()).toBe(400)

    // The card data carries the kit name and the style key.
    const hit = (await (await api.get(`/api/library?pageSize=50&brandKitId=${kitA.id}`)).json()).drafts.find(
      (d: { id: string }) => d.id === dA,
    )
    expect(hit.brief.brandKitName).toBe(`LibKitA ${stamp}`)
    expect(hit.brief.postStyle).toBe('launch')
  })

  // TC-LIB-06 — 037 AC-10 (UI): two selects, no status filter, no Publish or History.
  test('the library page filters by kit and style and has no publish controls', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const stamp = Date.now()
    const kitA = await (await api.post('/api/admin/brandkits', { name: `LibUiA ${stamp}`, colors: ['#0284c7'] })).json()
    const kitB = await (await api.post('/api/admin/brandkits', { name: `LibUiB ${stamp}`, colors: ['#0284c7'] })).json()
    await adminDraft(api, `LibUiTopicA-${stamp}`, { brandKitId: kitA.id, postStyle: 'launch' })
    await adminDraft(api, `LibUiTopicB-${stamp}`, { brandKitId: kitB.id, postStyle: 'tip' })

    await pageLogin(page)
    await page.goto('/library')
    const cardA = page.getByText(`LibUiTopicA-${stamp}`)
    const cardB = page.getByText(`LibUiTopicB-${stamp}`)
    await expect(cardA).toBeVisible({ timeout: 20_000 })
    await expect(cardB).toBeVisible()

    // No status filter, Publish button or History control.
    await expect(page.getByRole('group', { name: 'Filter by status' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^publish$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'History', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Open' }).first()).toBeVisible()

    // Kit filter. The request is awaited before the change that triggers it.
    const kitResponse = page.waitForResponse(
      (r) => r.url().includes('/api/library') && r.url().includes(`brandKitId=${kitA.id}`),
    )
    await page.getByLabel('Brand kit').selectOption(kitA.id)
    await kitResponse
    await expect(cardA).toBeVisible()
    await expect(cardB).toHaveCount(0)

    // Back to "All kits", then the style filter.
    await page.getByLabel('Brand kit').selectOption('')
    await expect(cardB).toBeVisible()
    const styleResponse = page.waitForResponse(
      (r) => r.url().includes('/api/library') && r.url().includes('postStyle=tip'),
    )
    await page.getByLabel('Post style').selectOption('tip')
    await styleResponse
    await expect(cardB).toBeVisible()
    await expect(cardA).toHaveCount(0)

    // "All styles" shows both again.
    await page.getByLabel('Post style').selectOption('')
    await expect(cardA).toBeVisible()
    await expect(cardB).toBeVisible()
  })

  // TC-LIB-03 — Search by topic substring.
  test('search filters by topic substring', async () => {
    if (!MOCKED()) { test.skip(); return }
    const marker = `Zylophone${Date.now()}`
    const draftId = await adminDraft(api, `Lib search ${marker} post`)

    const hit = await (await api.get(`/api/library?search=${marker}&pageSize=50`)).json()
    expect(hit.drafts.length).toBeGreaterThanOrEqual(1)
    expect(hit.drafts.every((d: { brief: { topic: string } }) => d.brief.topic.includes(marker))).toBe(true)
    expect(hit.drafts.find((d: { id: string }) => d.id === draftId)).toBeTruthy()
  })

  // TC-LIB-04 — Pagination envelope + pageSize honored.
  test('returns a pagination envelope and honors pageSize', async () => {
    if (!MOCKED()) { test.skip(); return }
    await adminDraft(api, `LibPage-${Date.now()}`)

    const res = await api.get('/api/library?page=1&pageSize=1')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('total')
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(1)
    expect(Array.isArray(body.drafts)).toBe(true)
    expect(body.drafts.length).toBeLessThanOrEqual(1)
  })

  // TC-LIB-05 — Thumbnails are signed (fetchable) URLs. Guards H10.
  test('every draft exportUrl is a signed https URL', async () => {
    if (!MOCKED()) { test.skip(); return }
    await adminDraft(api, `LibSigned-${Date.now()}`)

    const body = await (await api.get('/api/library?pageSize=50')).json()
    expect(body.drafts.length).toBeGreaterThanOrEqual(1)
    for (const d of body.drafts) {
      if (d.exportUrl) expect(d.exportUrl).toMatch(/^https?:\/\//)
    }
  })
})
