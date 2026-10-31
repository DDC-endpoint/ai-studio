import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/ui'

// §AL — Projects hold the inputs (038 T2: FR-05, FR-06, FR-13 filter, D9, D15; docs/e2e-test-plan.md).
//
// A project carries a default brand kit, post style and tone, a versioned
// briefing and source documents (the routes under /api/projects/[id]/…). An
// admin creates, edits and deletes; every member reads; another team gets 404 on
// every surface. Deleting soft-deletes and unassigns its posts in one step.
// Cases that need a post assigned to a project come with the brief route (T3)
// and the assign route (T4). The 200-project cap is covered by the unit suite
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
})
