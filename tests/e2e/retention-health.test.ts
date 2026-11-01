import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { pageLogin } from '../helpers/ui'

// §Z (037 AC-13): the retention loop's health on /admin/insights. It replaces the
// 023 scheduler-heartbeat suite: the worker now runs one loop, `retention`, and
// Insights reads its heartbeat row. The table is global and no worker runs in
// E2E, so the row is seeded through POST /api/test/worker-heartbeat (gated on
// MOCK_AI + admin, 404 in prod). Serial; the row is cleared before each case and
// after the file, so every other suite sees the default "no row".
//
// Insights (a super admin only) shows the chip "Retention running" (a row seen
// within three missed 60 s polls), "Retention stalled" (an older row) or
// "Retention never ran" (no row).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!process.env.MOCK_AI

const SEC = 1000
const MIN = 60_000

test.describe.configure({ mode: 'serial' })

test.describe('Retention health (§Z)', () => {
  let admin: ApiClient

  async function seed(startedAgoMs: number, endedAgoMs: number | null) {
    const res = await admin.post('/api/test/worker-heartbeat', { loop: 'retention', startedAgoMs, endedAgoMs })
    expect(res.status()).toBe(200)
  }
  async function clear() {
    expect((await admin.post('/api/test/worker-heartbeat', { clear: true })).status()).toBe(200)
  }

  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    if (MOCKED()) await clear()
  })
  test.afterEach(async () => {
    await admin.dispose()
  })
  test.afterAll(async ({ playwright }) => {
    if (!MOCKED()) return
    const ctx = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL })
    try {
      const a = await loginAs(ctx, ADMIN_EMAIL, ADMIN_PASSWORD)
      await a.post('/api/test/worker-heartbeat', { clear: true })
      await a.dispose()
    } finally {
      await ctx.dispose()
    }
  })

  test('a fresh row reads "Retention running"', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await seed(20 * SEC, 10 * SEC)
    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByText('Retention running')).toBeVisible()
    await expect(page.getByTestId('retention-loop-state')).toHaveText('online')
  })

  test('an old row reads "Retention stalled"', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await seed(60 * MIN, 59 * MIN)
    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByText('Retention stalled')).toBeVisible()
    await expect(page.getByTestId('retention-loop-state')).toHaveText('stale')
  })

  test('no row reads "Retention never ran"', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByText('Retention never ran')).toBeVisible()
    await expect(page.getByTestId('retention-loop-state')).toHaveText('never')
  })

  test('the seam refuses any loop other than retention with 400, and writes nothing', async () => {
    if (!MOCKED()) { test.skip(); return }
    for (const loop of ['scheduler', 'generation']) {
      const res = await admin.post('/api/test/worker-heartbeat', { loop, startedAgoMs: 1000, endedAgoMs: 500 })
      expect(res.status(), loop).toBe(400)
    }
  })

  test('a call with no session is refused (the seam stays admin-gated)', async ({ playwright }) => {
    if (!MOCKED()) { test.skip(); return }
    // The proxy redirects a cookie-less request to /login, so a bogus session
    // cookie is what reaches the route's own check.
    const anon = await playwright.request.newContext({
      baseURL: process.env.TEST_BASE_URL,
      extraHTTPHeaders: { cookie: 'better-auth.session_token=not-a-real-session' },
    })
    try {
      const res = await anon.post('/api/test/worker-heartbeat', { data: { clear: true } })
      expect([401, 403]).toContain(res.status())
    } finally {
      await anon.dispose()
    }
  })
})
