import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { pageLogin } from '../helpers/ui'

// §AL (docs/e2e-test-plan.md): 031 FR-33, FR-34. TC-AS-04 to TC-AS-06: the brand-kit assistant
// proposes and applies fonts. (TC-AS-01 to TC-AS-03, the briefing assistant's schedule plan, were
// removed with scheduled generation, 037 T2.)

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'

test.describe.configure({ mode: 'serial' })

// ── TC-AS-04 to TC-AS-06: the brand-kit assistant fonts (FR-33, FR-34) ──────────────────────────
//
// Under MOCK_AI the reply proposes heading Playfair Display, body Inter and a Sinhala font
// Noto Sans Sinhala. The sentinel __MOCK_FONT_UNKNOWN__ in the chat message swaps the body for a
// name that is not in the font list.

const UNKNOWN_BODY = '__MOCK_FONT_UNKNOWN__'

async function makeKit(api: ApiClient, label: string) {
  const name = `AS Kit ${label} ${Date.now()}`
  const res = await api.post('/api/admin/brandkits', {
    name,
    colors: [],
    fonts: [
      { name: 'Roboto', url: '' },
      { name: 'Lora', url: '' },
    ],
  })
  expect(res.status()).toBe(201)
  return { ...(await res.json()), name } as { id: string; name: string }
}

async function openAssistant(page: import('@playwright/test').Page, kitName: string, message: string) {
  await pageLogin(page)
  await page.goto('/admin/brandkits')
  await page
    .getByRole('region', { name: 'Brand kits', exact: true })
    .getByRole('button', { name: new RegExp(`^${kitName}`) })
    .click()
  await expect(page.getByRole('heading', { name: kitName, level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Extract from references' }).click()
  const drawer = page.getByRole('dialog', { name: 'Extract brand from references' })
  await expect(drawer).toBeVisible()
  const ask = drawer.getByLabel('Message', { exact: true })
  await ask.fill(message)
  const replied = page.waitForResponse(
    (r) => r.url().endsWith('/assistant/chat') && r.request().method() === 'POST',
  )
  await ask.press('Enter')
  expect((await replied).status()).toBe(200)
  const proposed = drawer.getByRole('region', { name: 'Proposed brand' })
  await expect(proposed).toBeVisible({ timeout: 30_000 })
  return { drawer, proposed }
}

test.describe('Brand-kit assistant fonts (031)', () => {
  let admin: ApiClient
  const kits: string[] = []
  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of kits.splice(0)) await admin.del(`/api/admin/brandkits/${id}`)
    await admin.dispose()
  })

  test('TC-AS-04: the accept view shows current versus proposed, and a name not in the list is off', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const kit = await makeKit(admin, '04')
    kits.push(kit.id)
    const { proposed } = await openAssistant(page, kit.name, `Extract the style ${UNKNOWN_BODY}`)
    await expect(proposed.getByText('Current: Roboto → Proposed: Playfair Display')).toBeVisible()
    await expect(proposed.getByText('Current: none → Proposed: Noto Sans Sinhala')).toBeVisible()
    await expect(
      proposed.getByText("Zzyzx Mock Sans is not in the font list and won't be applied"),
    ).toBeVisible()
    await expect(proposed.getByRole('checkbox', { name: /Heading font/ })).toBeChecked()
    const body = proposed.getByRole('checkbox', { name: /Body font/ })
    await expect(body).not.toBeChecked()
    await expect(body).toBeDisabled()
  })

  test('TC-AS-05: Apply changes the kit heading, body and Sinhala fonts in one call', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const kit = await makeKit(admin, '05')
    kits.push(kit.id)
    const { drawer, proposed } = await openAssistant(page, kit.name, 'Extract the style')
    await expect(proposed.getByText('Current: Lora → Proposed: Inter')).toBeVisible()

    const apply = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/brandkits/${kit.id}/assistant/apply`) && r.request().method() === 'POST',
    )
    await proposed.getByRole('button', { name: 'Apply to brand kit' }).click()
    expect((await apply).status()).toBe(200)
    await expect(drawer).toBeHidden()

    const after = (await (await admin.get(`/api/admin/brandkits/${kit.id}`)).json()) as {
      fonts: Array<{ name: string; url: string }>
      scriptFonts: Record<string, string> | null
    }
    expect(after.fonts.map((f) => f.name)).toEqual(['Playfair Display', 'Inter'])
    expect(after.fonts[0].url).toContain('fonts.googleapis.com')
    expect(after.scriptFonts).toEqual({ sinhala: 'Noto Sans Sinhala' })
  })

  test('TC-AS-06: the History shows the previous fonts on the new version', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const kit = await makeKit(admin, '06')
    kits.push(kit.id)
    const { proposed } = await openAssistant(page, kit.name, 'Extract the style')
    await expect(proposed.getByText('Current: Roboto → Proposed: Playfair Display')).toBeVisible()
    const apply = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/brandkits/${kit.id}/assistant/apply`) && r.request().method() === 'POST',
    )
    await proposed.getByRole('button', { name: 'Apply to brand kit' }).click()
    expect((await apply).status()).toBe(200)

    const versions = (await (await admin.get(`/api/admin/brandkits/${kit.id}/prompts`)).json()) as Array<{
      version: number
      previousFonts: { fonts: Array<{ name: string }> } | null
    }>
    expect(versions).toHaveLength(1)
    expect(versions[0].previousFonts?.fonts.map((f) => f.name)).toEqual(['Roboto', 'Lora'])

    // The kit detail refreshes after Apply; open the History tab of the voice prompt.
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByTestId('previous-fonts')).toHaveText('Fonts before this version: Roboto, Lora')
  })
})
