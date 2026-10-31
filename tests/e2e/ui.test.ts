import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// §L — Critical UI browser flows (docs/e2e-test-plan.md). These drive a real
// browser (Playwright `page`), so the app must be serving on :3001 and a browser
// must be installed (`npx playwright install chromium`). Generation-dependent
// flows are gated behind MOCK_AI + MOCK_PUPPETEER.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

async function pageLogin(page: Page) {
  await page.goto('/login')
  // The login page takes a username; an email routes through the legacy flow.
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(url => url.pathname === '/' || url.pathname === '/choose-team')
  // ADMIN_EMAIL is a super admin, whose active-team auto-select depends on
  // exactly one team existing platform-wide (team tenancy) — with a second
  // team (ClientX) seeded, a session with no active-team cookie should land
  // on /choose-team instead of the dashboard. A fresh full navigation (not
  // the client router's soft nav, which can settle on a stale/optimistic "/"
  // before the server-evaluated redirect lands) forces a real SSR round-trip
  // so team resolution is evaluated against the cookie set moments ago by sign-in.
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL(url => url.pathname === '/')
  }
}

// Mint an EXPORTED draft via the API (owned by the admin, so the logged-in
// browser session can open it).
async function apiDraft(api: ApiClient, topic: string): Promise<string> {
  const kit = await (await api.post('/api/admin/brandkits', { name: `UI Kit ${topic}`, colors: ['#0284c7'] })).json()
  const brief = await (await api.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', brandKitId: kit.id,
  })).json()
  const assembled = await (await api.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  await waitForDraft(api, assembled.draftId)
  return assembled.draftId
}

test.describe('UI flows', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-UI-01 — Login form → dashboard with KPIs (no 404).
  test('login lands on the dashboard with KPIs', async ({ page }) => {
    await pageLogin(page)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Drafts Ready')).toBeVisible()
    await expect(page.getByText('Posts this month')).toBeVisible()
    // 037 AC-11: the publishing KPIs are gone.
    await expect(page.getByText('Posts Published')).toHaveCount(0)
    await expect(page.getByText('Active Campaigns')).toHaveCount(0)
  })

  // TC-UI-02 — Brief wizard renders its 5 steps and the primary action.
  test('the brief wizard renders its steps', async ({ page }) => {
    await pageLogin(page)
    await page.goto('/brief')
    // Step labels from src/app/(app)/brief/page.tsx STEPS.
    for (const label of ['Project', 'Size & Design', 'Content', 'Images', 'Review']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
    }
    // The wizard exposes a Continue affordance on the first step.
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible()
    // NOTE: a full Continue→Generate walk needs stable test ids on the step
    // controls (campaign/platform/template pickers); covered structurally by the
    // API-level generation tests (path-a/path-b).
  })

  // TC-UI-03 — 037 AC-09/AC-11: Download is the one primary action and there is no
  // Publish button; the dashboard's "Posts this month" counts the new draft.
  test('the draft page has no Publish button and the dashboard counts the post', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await pageLogin(page)
    const readKpi = async () =>
      Number(
        (
          await page
            .locator('div.border-b', { has: page.getByText('Posts this month', { exact: true }) })
            .locator('div.font-display')
            .innerText()
        ).trim(),
      )
    const before = await readKpi()

    const draftId = await apiDraft(api, `UI-Download-${Date.now()}`)
    await page.goto(`/drafts/${draftId}`)
    await expect(page.getByTestId('download-button')).toBeVisible({ timeout: 20_000 }) // client-rendered after fetch
    await expect(page.getByRole('button', { name: /^publish$/i })).toHaveCount(0)

    await page.goto('/')
    await expect(page.getByText('Posts this month', { exact: true })).toBeVisible()
    expect(await readKpi()).toBeGreaterThanOrEqual(before + 1)
  })

  // TC-UI-04 — The draft preview image loads in the browser (signed URL works). Guards H10.
  test('the draft preview image loads', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `UI-Preview-${Date.now()}`
    const draftId = await apiDraft(api, topic)
    await pageLogin(page)
    await page.goto(`/drafts/${draftId}`)

    // The draft page fetches client-side, so the preview appears after the fetch
    // (and a cold-route compile under `next dev` can be slow) — allow generous time.
    const img = page.locator(`img[alt="${topic}"]`)
    await expect(img).toBeVisible({ timeout: 20_000 })
    // The signed MinIO URL actually decoded to pixels (mock PNG is 1×1).
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0)
  })

  // TC-UI-05 — AGUI chat refine round-trip: typing an instruction fires /refine.
  test('the AGUI chat fires a refine request', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await apiDraft(api, `UI-AGUI-${Date.now()}`)
    await pageLogin(page)
    await page.goto(`/drafts/${draftId}`)

    // The refine chat input is identified by its placeholder; the send button is
    // icon-only (no accessible name), so submit via Enter (the input's onKeyDown).
    const input = page.getByPlaceholder('e.g. Make the logo larger…')
    await input.fill('Make the background darker')
    const [req] = await Promise.all([
      page.waitForRequest(r => r.url().includes(`/api/drafts/${draftId}/refine`) && r.method() === 'POST'),
      input.press('Enter'),
    ])
    expect(req).toBeTruthy()
    // The refine response drives a new revision in the history panel.
    await expect.poll(
      async () => (await (await api.get(`/api/drafts/${draftId}/revisions`)).json()).length,
      { timeout: 15_000 },
    ).toBeGreaterThanOrEqual(1)
  })
})
