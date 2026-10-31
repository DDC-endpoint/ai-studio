import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// §C — Projects & brand-kit resolution (docs/e2e-test-plan.md), rewritten by 038 T3.
//
// Contract (src/lib/brandkit/resolve.ts, used only through src/lib/projects/context.ts):
//   precedence: explicit brief kit → the project's default kit → the team default kit
//   The draft records what resolved in its `inputs` (GET /api/drafts/[id]):
//     inputs.kitSource ∈ 'explicit' | 'project' | 'team', inputs.kitName, inputs.project
//   Soft-deleted kits are skipped at every tier.
// Needs MOCK_AI + MOCK_PUPPETEER (the brief is generated through assemble-b).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

type Inputs = {
  project: { id: string; name: string } | null
  briefingVersion: number | null
  kitName: string | null
  kitSource: 'explicit' | 'project' | 'team' | null
} | null

test.describe('Brand-kit resolution', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  async function makeKit(client: ApiClient, name: string) {
    return (await client.post('/api/admin/brandkits', { name, colors: ['#0284c7'] })).json()
  }

  // A Path B post, generated to the end; returns what the draft recorded.
  async function generate(body: Record<string, unknown>): Promise<{ inputs: Inputs; brandKitName: string | null }> {
    const brief = await api.post('/api/briefs', {
      topic: `Res ${Date.now()}`, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'GENERATE', copyProviderKey: 'cli', ...body,
    })
    expect(brief.status()).toBe(201)
    const assembled = await api.post('/api/generate/assemble-b', { briefId: (await brief.json()).id })
    expect(assembled.status()).toBe(202)
    const draft = await waitForDraft(api, (await assembled.json()).draftId)
    expect(draft.status).toBe('EXPORTED')
    return draft as unknown as { inputs: Inputs; brandKitName: string | null }
  }

  // TC-RES-01 — An explicit kit wins over the project default.
  test('an explicit kit takes precedence over the project default', async () => {
    test.skip(!MOCKED(), 'needs MOCK_AI and MOCK_PUPPETEER')
    const projKit = await makeKit(api, 'Project Kit X')
    const ownKit = await makeKit(api, 'Explicit Kit Y')
    const project = await (await api.post('/api/projects', { name: 'Res P1', defaultBrandKitId: projKit.id })).json()

    const draft = await generate({ projectId: project.id, brandKitId: ownKit.id })
    expect(draft.inputs?.kitSource).toBe('explicit')
    expect(draft.inputs?.kitName).toBe(ownKit.name)
    expect(draft.brandKitName).toBe(ownKit.name)
    expect(draft.inputs?.project).toEqual({ id: project.id, name: project.name })
  })

  // TC-RES-02 — With no explicit kit, the project default is used.
  test('a post in a project with a default kit uses it', async () => {
    test.skip(!MOCKED(), 'needs MOCK_AI and MOCK_PUPPETEER')
    const projKit = await makeKit(api, 'Project Kit X2')
    const project = await (await api.post('/api/projects', { name: 'Res P2', defaultBrandKitId: projKit.id })).json()

    const draft = await generate({ projectId: project.id })
    expect(draft.inputs?.kitSource).toBe('project')
    expect(draft.inputs?.kitName).toBe(projKit.name)
    expect(draft.brandKitName).toBe(projKit.name)
  })

  // TC-RES-03 — The team default when neither tier sets a kit.
  test('a post in a project with no kit, and a post with no project, fall back to the team default kit', async () => {
    test.skip(!MOCKED(), 'needs MOCK_AI and MOCK_PUPPETEER')
    const project = await (await api.post('/api/projects', { name: 'Res P3 no kit' })).json()
    const inProject = await generate({ projectId: project.id })
    expect(inProject.inputs?.kitSource).toBe('team')
    expect(inProject.inputs?.project?.id).toBe(project.id)
    expect(inProject.inputs?.kitName).toBeTruthy()

    const bare = await generate({})
    expect(bare.inputs?.kitSource).toBe('team')
    expect(bare.inputs?.project).toBeNull()
    // The seeded "Bistec" kit is the team default, for both.
    expect(bare.inputs?.kitName).toBe(inProject.inputs?.kitName)
  })

  // TC-RES-04 — A soft-deleted project kit is skipped; resolution falls through. Guards M4.
  test('a soft-deleted project kit is skipped and resolution falls to the team default', async () => {
    test.skip(!MOCKED(), 'needs MOCK_AI and MOCK_PUPPETEER')
    const deletedKit = await makeKit(api, 'Soon-Deleted Kit Y4')
    const project = await (await api.post('/api/projects', { name: 'Res P4', defaultBrandKitId: deletedKit.id })).json()

    // Soft-delete the project's kit.
    expect((await api.del(`/api/admin/brandkits/${deletedKit.id}`)).status()).toBe(204)

    const draft = await generate({ projectId: project.id })
    expect(draft.inputs?.kitName).not.toBe(deletedKit.name) // never resolves to the deleted kit
    expect(draft.inputs?.kitSource).toBe('team')
  })

  // TC-RES-05 — A brief names a live project of the caller's team only (D12).
  test('an unknown or deleted project id is a 404 PROJECT_NOT_FOUND, and the retired campaignId a 400', async () => {
    const unknown = await api.post('/api/briefs', {
      topic: 'x', goal: 'g', channels: ['INSTAGRAM'], designMode: 'GENERATE', copyProviderKey: 'cli', projectId: 'proj_missing',
    })
    expect(unknown.status()).toBe(404)
    expect((await unknown.json()).code).toBe('PROJECT_NOT_FOUND')

    const project = await (await api.post('/api/projects', { name: 'Res P5 deleted' })).json()
    expect((await api.del(`/api/projects/${project.id}`)).status()).toBe(200)
    const deleted = await api.post('/api/briefs', {
      topic: 'x', goal: 'g', channels: ['INSTAGRAM'], designMode: 'GENERATE', copyProviderKey: 'cli', projectId: project.id,
    })
    expect(deleted.status()).toBe(404)
    expect((await deleted.json()).code).toBe('PROJECT_NOT_FOUND')

    const retired = await api.post('/api/briefs', {
      topic: 'x', goal: 'g', channels: ['INSTAGRAM'], designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: 'c1',
    })
    expect(retired.status()).toBe(400)
    expect((await retired.json()).code).toBe('CAMPAIGN_RETIRED')
  })

  // TC-RES-06 — Project settings stay admin-only. Guards H4.
  test('an editor cannot change a project’s default kit', async ({ request }) => {
    const kit = await makeKit(api, 'Res Kit 6')
    const project = await (await api.post('/api/projects', { name: 'Res P6' })).json()

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.patch(`/api/projects/${project.id}`, { defaultBrandKitId: kit.id })
      expect(res.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })

  // TC-RES-07 — List endpoints are bounded (take:200). Guards M11.
  test('the project list is a bounded array', async () => {
    const projects = await (await api.get('/api/projects')).json()
    expect(Array.isArray(projects)).toBe(true)
    expect(projects.length).toBeLessThanOrEqual(200)
  })
})
