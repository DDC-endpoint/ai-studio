import { test, expect } from '@playwright/test'
import { loginAs, findTeamIdByName, addTeamMember, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/ui'

// §AJ — Post permissions (038 AC-01 to AC-04; docs/e2e-test-plan.md).
//
// Every member of a team sees every post in it (D10). Only the author and a
// team admin change one (D11): a refused edit is 403 { code: 'not-author' }
// before any model call, and the draft is left as it was. A post of another
// team stays a 404. Requires MOCK_AI + MOCK_PUPPETEER to mint posts.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'
const CALLS = '/api/test/model-calls'

test.describe.configure({ mode: 'serial' })

// Mint an EXPORTED post as `who`; returns the draft id and its brief id.
async function mint(who: ApiClient, topic: string): Promise<{ draftId: string; briefId: string }> {
  const brief = await (
    await who.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
    })
  ).json()
  const res = await who.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  const draft = await waitForDraft(who, draftId)
  expect(draft.status).toBe('EXPORTED')
  return { draftId, briefId: brief.id }
}

async function snapshot(api: ApiClient, draftId: string) {
  const d = await (await api.get(`/api/drafts/${draftId}`)).json()
  return {
    headline: d.headline,
    status: d.status,
    pendingAction: d.pendingAction,
    revisionCount: d.revisionCount,
    currentRevisionNumber: d.currentRevisionNumber,
    captions: d.captions.map((c: { channel: string; text: string }) => [c.channel, c.text]),
  }
}

test.describe('Post permissions (038 D10, D11)', () => {
  let admin: ApiClient // super admin and Bistec team admin; the author of `adminPost`
  let editor: ApiClient
  let clientx: ApiClient
  let adminPost: { draftId: string; briefId: string }

  test.beforeAll(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    clientx = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    if (MOCKED()) adminPost = await mint(admin, `Perm Admin Post ${Date.now()}`)
  })
  test.afterAll(async () => {
    await admin.dispose()
    await editor.dispose()
    await clientx.dispose()
  })

  // TC-PERM-01 — AC-02: the editor is refused on every edit route, with nothing
  // changed and no model call.
  test('an editor gets 403 not-author on every edit route of the admin\'s post, and nothing changes', async () => {
    if (!MOCKED()) { test.skip(); return }
    const { draftId, briefId } = adminPost
    const before = await snapshot(admin, draftId)
    expect((await admin.del(CALLS)).status()).toBe(204)

    const d = `/api/drafts/${draftId}`
    const attempts: [string, () => ReturnType<ApiClient['post']>][] = [
      ['PATCH draft', () => editor.patch(d, { headline: 'Editor headline' })],
      ['DELETE draft', () => editor.del(d)],
      ['apply-text', () => editor.post(`${d}/apply-text`, { field: 'headline' })],
      ['inline-edit', () => editor.post(`${d}/inline-edit`, { html: '<html><body>x</body></html>' })],
      ['refine', () => editor.post(`${d}/refine`, { instruction: 'Make it pop' })],
      ['regenerate-copy', () => editor.post(`${d}/regenerate-copy`, {})],
      ['regenerate-design', () => editor.post(`${d}/regenerate-design`, {})],
      ['retry', () => editor.post(`${d}/retry`)],
      ['restore', () => editor.post(`${d}/revisions/1/restore`)],
      ['adopt', () => editor.post(`${d}/rejected/none/adopt`)],
      ['assemble-a', () => editor.post('/api/generate/assemble-a', { briefId, templateId: 'none' })],
      ['assemble-b', () => editor.post('/api/generate/assemble-b', { briefId })],
      ['generate copy', () => editor.post('/api/generate/copy', { briefId })],
      ['generate image', () => editor.post('/api/generate/image', { briefId, prompt: 'a prompt' })],
    ]
    for (const [name, run] of attempts) {
      const res = await run()
      expect(res.status(), name).toBe(403)
      expect((await res.json()).code, name).toBe('not-author')
    }

    expect(await snapshot(admin, draftId)).toEqual(before)
    const calls = (await (await admin.get(CALLS)).json()).calls as unknown[]
    expect(calls).toHaveLength(0)
  })

  // TC-PERM-02 — AC-01, AC-03: the editor sees the post, downloads it, and the
  // draft says whether the caller may edit.
  test('an editor can GET, list revisions of and download the admin\'s post; canEdit says who may edit', async () => {
    if (!MOCKED()) { test.skip(); return }
    const { draftId } = adminPost
    const asEditor = await editor.get(`/api/drafts/${draftId}`)
    expect(asEditor.status()).toBe(200)
    expect((await asEditor.json()).canEdit).toBe(false)
    expect((await (await admin.get(`/api/drafts/${draftId}`)).json()).canEdit).toBe(true)

    expect((await editor.get(`/api/drafts/${draftId}/revisions`)).status()).toBe(200)
    const download = await editor.get(`/api/drafts/${draftId}/download`)
    expect(download.status()).toBe(200)
    expect(download.headers()['content-type']).toBe('image/png')

    const library = await (await editor.get('/api/library?pageSize=50')).json()
    expect(library.drafts.map((x: { id: string }) => x.id)).toContain(draftId)
  })

  // TC-PERM-03 — AC-04: another team still gets a 404, not a 403.
  test('a member of another team gets 404 on the post, edit routes included', async () => {
    if (!MOCKED()) { test.skip(); return }
    const d = `/api/drafts/${adminPost.draftId}`
    expect((await clientx.get(d)).status()).toBe(404)
    expect((await clientx.patch(d, { headline: 'x' })).status()).toBe(404)
    expect((await clientx.post(`${d}/refine`, { instruction: 'x' })).status()).toBe(404)
    expect((await clientx.del(d)).status()).toBe(404)
    expect((await clientx.post('/api/generate/assemble-b', { briefId: adminPost.briefId })).status()).toBe(404)
  })

  // TC-PERM-04 — the author edits and deletes their own post (Q1: an editor may delete it).
  test('an editor refines, edits and deletes their own post', async () => {
    if (!MOCKED()) { test.skip(); return }
    const own = await mint(editor, `Perm Editor Post ${Date.now()}`)
    const d = `/api/drafts/${own.draftId}`
    expect((await (await editor.get(d)).json()).canEdit).toBe(true)

    const refine = await editor.post(`${d}/refine`, { instruction: 'Make it pop' })
    expect(refine.status()).toBe(202)
    await waitForAction(editor, own.draftId)

    const patch = await editor.patch(d, { headline: 'Edited by the author' })
    expect(patch.status()).toBe(200)
    expect((await patch.json()).headline).toBe('Edited by the author')

    expect((await editor.del(d)).status()).toBe(200)
    expect((await editor.get(d)).status()).toBe(404)
  })

  // TC-PERM-05 — a team admin and a super admin change a post they did not write.
  test('a team admin and a super admin can change and delete the editor\'s post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const teamId = await findTeamIdByName(admin, 'Bistec')
    const username = `permadmin${Date.now().toString(36)}`
    const created = await (
      await admin.post('/api/admin/users', {
        name: 'Perm Team Admin',
        username,
        role: 'editor', // a platform editor who is ADMIN of the team only
        password: 'PermAdminPass1!',
      })
    ).json()
    await addTeamMember(admin, teamId, created.id, 'ADMIN')
    const teamAdmin = await loginAs(request, `${username}@users.bistec.internal`, 'PermAdminPass1!', { team: 'Bistec' })
    try {
      const own = await mint(editor, `Perm Shared Post ${Date.now()}`)
      const d = `/api/drafts/${own.draftId}`

      // Team admin (not the author, not a super admin).
      expect((await (await teamAdmin.get(d)).json()).canEdit).toBe(true)
      const refine = await teamAdmin.post(`${d}/refine`, { instruction: 'Make it pop' })
      expect(refine.status()).toBe(202)
      await waitForAction(teamAdmin, own.draftId)

      // Super admin.
      const patch = await admin.patch(d, { headline: 'Edited by a super admin' })
      expect(patch.status()).toBe(200)

      expect((await teamAdmin.del(d)).status()).toBe(200)
    } finally {
      await teamAdmin.dispose()
    }
  })

  // TC-PERM-06 — AC-22 (view-only half): the page shows the note and no edit controls.
  test('the post page shows a view-only note and no edit controls to a non-author', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await page.goto('/login')
    await page.getByPlaceholder('Username').fill(EDITOR_EMAIL)
    await page.getByPlaceholder('Password').fill(EDITOR_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')

    await page.goto(`/drafts/${adminPost.draftId}`)
    await expect(page.getByTestId('download-button')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('view-only-note')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit inline' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Regenerate design' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Regenerate all' })).toHaveCount(0)
    await expect(page.getByPlaceholder('e.g. Make the logo larger…')).toHaveCount(0)
    // Copy stays.
    await expect(page.getByRole('button', { name: /^Copy .* caption$/ }).first()).toBeVisible()
  })
})
