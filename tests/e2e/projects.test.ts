import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD, briefDraftIds, expectNoHorizontalScroll, pageLogin } from '../helpers/ui'

// §AL — Projects hold the inputs (038 T2: FR-05, FR-06, FR-13 filter, D9, D15; docs/e2e-test-plan.md).
//
// A project carries a default brand kit, post style and tone, a versioned
// briefing and source documents (the routes under /api/projects/[id]/…). An
// admin creates, edits and deletes; every member reads; another team gets 404 on
// every surface. Deleting soft-deletes and unassigns its posts in one step.
// T3 adds the post's recorded inputs (the draft GET's `inputs`) and the wizard's
// project step. The cases that move a post come with the assign route (T4). The 200-project cap is covered by the unit suite
// (projectLimits.test.ts); minting 200 projects here would not add to it.

const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'

test.describe.configure({ mode: 'serial' })

test.describe('Projects (038 T2)', () => {
  let admin: ApiClient
  let editor: ApiClient
  let clientx: ApiClient
  const stamp = `${Date.now()}`

  test.beforeAll(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    clientx = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
  })
  test.afterAll(async () => {
    await admin.dispose()
    await editor.dispose()
    await clientx.dispose()
  })

  async function mint(name: string, extra: Record<string, unknown> = {}) {
    const res = await admin.post('/api/projects', { name: `${name} ${stamp}`, ...extra })
    expect(res.status()).toBe(201)
    return (await res.json()) as { id: string; name: string; postCount: number; defaultPostStyle: string | null }
  }

  // TC-PROJ-01: create, read, list, update, clear the defaults.
  test('an admin creates a project with defaults, lists and reads it with postCount, and updates and clears them', async () => {
    const created = await mint('Proj CRUD', { defaultPostStyle: 'launch', defaultTone: 'bold' })
    expect(created.defaultPostStyle).toBe('launch')
    expect(created.postCount).toBe(0)

    const list = (await (await admin.get('/api/projects')).json()) as Array<{ id: string; postCount: number; defaultPostStyle: string | null }>
    const row = list.find((p) => p.id === created.id)!
    expect(row.postCount).toBe(0)
    expect(row.defaultPostStyle).toBe('launch')

    const detail = await (await admin.get(`/api/projects/${created.id}`)).json()
    expect(detail).toMatchObject({ id: created.id, postCount: 0, defaultPostStyle: 'launch', defaultTone: 'bold' })
    expect(detail.campaigns).toBeUndefined()

    const patched = await admin.patch(`/api/projects/${created.id}`, { name: `Renamed ${stamp}`, defaultPostStyle: 'event' })
    expect(patched.status()).toBe(200)
    expect(await patched.json()).toMatchObject({ name: `Renamed ${stamp}`, defaultPostStyle: 'event' })

    const cleared = await admin.patch(`/api/projects/${created.id}`, { defaultPostStyle: null })
    expect((await cleared.json()).defaultPostStyle).toBeNull()
  })

  // TC-PROJ-02: an unknown style or kit is refused, never stored.
  test('an unknown post style is 400 on create and update, and a foreign brand kit is 400', async () => {
    const bad = await admin.post('/api/projects', { name: `Proj Bad ${stamp}`, defaultPostStyle: 'not-a-style' })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).code).toBe('UNKNOWN_POST_STYLE')

    const project = await mint('Proj Style')
    const badPatch = await admin.patch(`/api/projects/${project.id}`, { defaultPostStyle: 'not-a-style' })
    expect(badPatch.status()).toBe(400)
    expect((await (await admin.get(`/api/projects/${project.id}`)).json()).defaultPostStyle).toBeNull()

    const kit = await admin.patch(`/api/projects/${project.id}`, { defaultBrandKitId: 'no-such-kit' })
    expect(kit.status()).toBe(400)
  })

  // TC-PROJ-03: editors read; only admins write.
  test('an editor reads a project, its briefing and its documents, but cannot create, update or delete', async () => {
    const project = await mint('Proj Roles')
    expect((await editor.get('/api/projects')).status()).toBe(200)
    expect((await editor.get(`/api/projects/${project.id}`)).status()).toBe(200)
    expect((await editor.get(`/api/projects/${project.id}/briefing`)).status()).toBe(200)
    expect((await editor.get(`/api/projects/${project.id}/documents`)).status()).toBe(200)

    expect((await editor.post('/api/projects', { name: 'Editor project' })).status()).toBe(403)
    expect((await editor.patch(`/api/projects/${project.id}`, { name: 'x' })).status()).toBe(403)
    expect((await editor.del(`/api/projects/${project.id}`)).status()).toBe(403)
    expect((await editor.post(`/api/projects/${project.id}/briefing`, { content: 'x' })).status()).toBe(403)
    expect((await (await admin.get(`/api/projects/${project.id}`)).json()).id).toBe(project.id)
  })

  // TC-PROJ-04: another team gets the same 404 everywhere (NFR-07).
  test('another team gets 404 on a project, its briefing, its documents and the library filter, and never lists it', async () => {
    const project = await mint('Proj Isolated')
    const base = `/api/projects/${project.id}`
    const responses = [
      await clientx.get(base),
      await clientx.patch(base, { name: 'x' }),
      await clientx.del(base),
      await clientx.get(`${base}/briefing`),
      await clientx.post(`${base}/briefing`, { content: 'x' }),
      await clientx.get(`${base}/documents`),
      await clientx.post(`${base}/briefing/chat`, { messages: [{ role: 'user', content: 'hi' }] }),
      await clientx.get(`/api/library?projectId=${project.id}`),
      await admin.get('/api/library?projectId=no-such-project'),
    ]
    for (const res of responses) {
      expect(res.status()).toBe(404)
      expect(await res.json()).toEqual({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' })
    }
    const list = (await (await clientx.get('/api/projects')).json()) as Array<{ id: string }>
    expect(list.map((p) => p.id)).not.toContain(project.id)

    expect((await admin.get(base)).status()).toBe(200)
  })

  // TC-PROJ-05: the briefing is versioned inside the project.
  test('the briefing is versioned per project and restore re-activates an older version', async () => {
    const project = await mint('Proj Briefing')
    const base = `/api/projects/${project.id}/briefing`
    expect((await admin.post(base, { content: 'First briefing' })).status()).toBe(201)
    expect((await admin.post(base, { content: 'Second briefing' })).status()).toBe(201)
    const versions = (await (await admin.get(base)).json()) as Array<{ id: string; version: number; isActive: boolean }>
    expect(versions.map((v) => [v.version, v.isActive])).toEqual([
      [2, true],
      [1, false],
    ])
    const first = versions.find((v) => v.version === 1)!
    expect((await admin.post(`${base}/${first.id}/activate`)).status()).toBe(200)
    const after = (await (await admin.get(base)).json()) as Array<{ version: number; isActive: boolean }>
    expect(after.find((v) => v.isActive)!.version).toBe(1)
  })

  // TC-PROJ-06: the library filter.
  test('the library takes projectId: a live project lists its posts, "none" lists the unassigned ones', async () => {
    const project = await mint('Proj Library')
    const ofProject = await admin.get(`/api/library?projectId=${project.id}`)
    expect(ofProject.status()).toBe(200)
    expect(await ofProject.json()).toMatchObject({ drafts: [], total: 0 })
    expect((await admin.get('/api/library?projectId=none')).status()).toBe(200)
    expect((await admin.get('/api/library?projectId=no-such-project')).status()).toBe(404)
  })

  // TC-PROJ-07: delete soft-deletes, reports how many posts it unassigned, and keeps the briefing.
  test('delete soft-deletes the project and answers { unassigned }; it is then a 404 everywhere and gone from the list', async () => {
    const project = await mint('Proj Delete')
    const base = `/api/projects/${project.id}`
    expect((await admin.post(`${base}/briefing`, { content: 'Kept briefing' })).status()).toBe(201)

    const del = await admin.del(base)
    expect(del.status()).toBe(200)
    expect(await del.json()).toEqual({ unassigned: 0 })

    expect((await admin.get(base)).status()).toBe(404)
    expect((await admin.get(`${base}/briefing`)).status()).toBe(404)
    expect((await admin.get(`/api/library?projectId=${project.id}`)).status()).toBe(404)
    const list = (await (await admin.get('/api/projects')).json()) as Array<{ id: string }>
    expect(list.map((p) => p.id)).not.toContain(project.id)
    expect((await admin.del(base)).status()).toBe(404)
  })

  // TC-PROJ-08 (AC-10): the draft records the project, the briefing version and the kit it was made with.
  test('a post generated in a project records that project, its briefing version and its kit on the draft', async () => {
    test.skip(!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER), 'needs MOCK_AI and MOCK_PUPPETEER')
    const kit = await (await admin.post('/api/admin/brandkits', { name: `Proj Stamp Kit ${stamp}`, colors: ['#0284c7'] })).json()
    const project = await mint('Proj Stamp', { defaultBrandKitId: kit.id })
    expect((await admin.post(`/api/projects/${project.id}/briefing`, { content: 'v1 briefing' })).status()).toBe(201)
    expect((await admin.post(`/api/projects/${project.id}/briefing`, { content: 'v2 briefing' })).status()).toBe(201)

    const brief = await (
      await admin.post('/api/briefs', {
        topic: `Stamp ${stamp}`, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
        designMode: 'GENERATE', copyProviderKey: 'cli', projectId: project.id,
      })
    ).json()
    expect(brief.projectId).toBe(project.id)
    const assembled = await admin.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(assembled.status()).toBe(202)
    const draft = await waitForDraft(admin, (await assembled.json()).draftId)
    expect(draft.status).toBe('EXPORTED')
    expect(draft.inputs).toEqual({
      project: { id: project.id, name: project.name },
      briefingVersion: 2,
      kitName: kit.name,
      kitSource: 'project',
    })
    expect(draft.brandKitName).toBe(kit.name)

    // The project's post count now includes it.
    expect((await (await admin.get(`/api/projects/${project.id}`)).json()).postCount).toBe(1)
  })

  // TC-PROJ-09 (AC-21): the wizard's first step is the project, with "No project" selected.
  test.describe('the wizard’s project step', () => {
    let before: Set<string>
    test.beforeEach(async () => {
      before = new Set(await briefDraftIds(admin))
    })
    test.afterEach(async () => {
      for (const id of await briefDraftIds(admin)) if (!before.has(id)) await admin.del(`/api/brief-drafts/${id}`)
    })

    test('"No project" is selected; choosing a project preselects its kit and post style and shows its briefing read-only', async ({ page }) => {
      const kit = await (await admin.post('/api/admin/brandkits', { name: `Wiz Kit ${stamp}`, colors: ['#0284c7'] })).json()
      const project = await mint('Wiz Project', { defaultBrandKitId: kit.id, defaultPostStyle: 'event' })
      expect((await admin.post(`/api/projects/${project.id}/briefing`, { content: 'Wizard briefing text' })).status()).toBe(201)

      await pageLogin(page)
      await page.goto('/brief')
      await expect(page.getByRole('heading', { name: 'Select a project' })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('button', { name: /^No project/ })).toHaveAttribute('aria-pressed', 'true')
      await expectNoHorizontalScroll(page, 'brief: project step')

      // The project row, then its briefing, read-only and collapsed until opened.
      await page.getByRole('button', { name: new RegExp(project.name) }).click()
      await expect(page.getByRole('button', { name: new RegExp(project.name) })).toHaveAttribute('aria-pressed', 'true')
      const preview = page.getByRole('button', { name: 'Project briefing (applies to every post)' })
      await expect(preview).toBeVisible()
      await preview.click()
      await expect(page.getByText('Wizard briefing text')).toBeVisible()
      await expect(page.locator('textarea')).toHaveCount(0)

      // Step 2: the project's kit and style are already chosen.
      await page.getByRole('button', { name: /continue/i }).click()
      await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Brand kit' })).toHaveValue(kit.id)
      await expect(page.getByTestId('post-style-event')).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByText(new RegExp(`Defaulted from .?${project.name}`))).toBeVisible()

      // Back and clear: the project is gone from the review row too.
      await page.getByRole('button', { name: /back/i }).click()
      await page.getByRole('button', { name: /^No project/ }).click()
      await expect(page.getByRole('button', { name: /^No project/ })).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
