import { test, expect, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD, briefDraftIds, pageLogin } from '../helpers/ui'

// Change 040 — template viewer. AC-03 (kit page dialog), AC-04 (wizard preview),
// and the read route's own-team contract (FR-03).

const html = (marker: string) => `<!DOCTYPE html><html><body><p>${marker}</p>{{headline}}</body></html>`

test.describe('Template viewer (040)', () => {
  let api: ApiClient
  let before: Set<string>
  let kit: { id: string; name: string }
  let a: { id: string; name: string; marker: string }
  let b: { id: string; name: string; marker: string }

  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    kit = await (await api.post('/api/admin/brandkits', { name: `TV Kit ${stamp}`, colors: ['#0b6e4f'] })).json()
    const mk = async (label: string) => {
      const marker = `TV-MARK-${label}-${stamp}`
      const name = `TV tpl ${label} ${stamp}`
      const res = await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
        name,
        htmlTemplate: html(marker),
        aspectRatio: 'SQUARE',
      })
      expect(res.ok()).toBe(true)
      const created = await res.json()
      return { id: created.id as string, name, marker }
    }
    a = await mk('A')
    b = await mk('B')
  })

  test.afterEach(async () => {
    for (const id of await briefDraftIds(api)) {
      if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    await api.del(`/api/admin/brandkits/${kit.id}`)
    await api.dispose()
  })

  test('FR-03: own-team GET /api/templates/<id> returns the four fields; unknown id is 404', async () => {
    const res = await api.get(`/api/templates/${a.id}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['aspectRatio', 'htmlTemplate', 'id', 'name'])
    expect(body.id).toBe(a.id)
    expect(body.name).toBe(a.name)
    expect(body.aspectRatio).toBe('SQUARE')
    expect(body.htmlTemplate).toContain(a.marker)
    const missing = await api.get('/api/templates/does-not-exist')
    expect(missing.status()).toBe(404)
    expect((await missing.json()).error).toBe('Not found')
  })

  test('AC-03: a template name opens the viewer dialog with its HTML; Escape closes it', async ({ page }) => {
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    await expect(page.getByRole('heading', { name: 'Brand kits', level: 1 })).toBeVisible()
    await page
      .getByRole('region', { name: 'Brand kits', exact: true })
      .getByRole('button', { name: new RegExp(`^${kit.name}`) })
      .click()
    await expect(page.getByRole('heading', { name: kit.name, level: 2 })).toBeVisible()
    await page.getByRole('button', { name: `View template ${a.name}`, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const frame = dialog.locator(`iframe[title="Preview of ${a.name}"]`)
    await expect(frame).toHaveAttribute('srcdoc', new RegExp(a.marker))
    await expect(frame).toHaveAttribute('sandbox', '')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  async function toDesignStep(page: Page) {
    await page.goto('/brief')
    await expect(page.getByRole('heading', { name: 'Select a project' })).toBeVisible()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    const kitSelect = page.getByRole('combobox', { name: 'Brand kit' })
    await expect(kitSelect.locator(`option[value="${kit.id}"]`)).toBeAttached()
    await kitSelect.selectOption(kit.id)
  }

  test('AC-04: the wizard previews the selected template and style reference', async ({ page }) => {
    await pageLogin(page)
    await toDesignStep(page)

    await page.getByRole('button', { name: /^Template/ }).first().click()
    const preview = page.getByTestId('template-preview')
    await expect(preview).toHaveCount(0)

    const fetchA = page.waitForResponse((r) => r.url().includes(`/api/templates/${a.id}`) && r.status() === 200)
    await page.getByRole('button', { name: new RegExp(a.name) }).click()
    await fetchA
    await expect(preview.locator('iframe')).toHaveAttribute('srcdoc', new RegExp(a.marker))

    const fetchB = page.waitForResponse((r) => r.url().includes(`/api/templates/${b.id}`) && r.status() === 200)
    await page.getByRole('button', { name: new RegExp(b.name) }).click()
    await fetchB
    await expect(preview.locator('iframe')).toHaveAttribute('srcdoc', new RegExp(b.marker))

    await page.getByRole('button', { name: /^Freeform/ }).click()
    await expect(preview).toHaveCount(0)
    const refPreview = page.getByTestId('reference-preview')
    await expect(refPreview).toHaveCount(0)
    // B was fetched already (cached per id), so no response to wait for here.
    await page.getByRole('button', { name: new RegExp(b.name) }).click()
    await expect(refPreview.locator('iframe')).toHaveAttribute('srcdoc', new RegExp(b.marker))

    await page.getByRole('button', { name: /No reference/ }).click()
    await expect(refPreview).toHaveCount(0)
  })
})
