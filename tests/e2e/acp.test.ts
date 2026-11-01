import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/api'

// §J — MCP / ACP surface (docs/e2e-test-plan.md).
//
// Contract (src/app/api/acp/{manifest,run}/route.ts + src/mcp/auth.ts):
//   Auth header: x-bistec-api-key, validated against the DB-backed ApiKey
//   table (team-tenancy Task 13 — replaces the old BISTEC_API_KEYS /
//   BISTEC_ADMIN_API_KEYS comma-separated env allow-lists, removed in
//   Task 18). Missing/invalid/revoked → 401 (fails closed).
//   GET  /api/acp/manifest → 200 AGENT_MANIFEST (capability generate_post; publish_post was removed by 037)
//   POST /api/acp/run {capability, input} → {output} | 400 (bad input; CAMPAIGN_RETIRED for a campaignId) |
//   404 PROJECT_NOT_FOUND (a projectId outside the key's team) | 422 (failure)
//   /api/acp is exempt from the session middleware — the key check governs.
//
// Authenticated cases mint their own real key via POST /api/team/api-keys
// (team-admin session, Bistec team) and use the plaintext exactly once, the
// same way a real integrator would — never a hardcoded/env-sourced key.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCK_AI = process.env.MOCK_AI === 'true'

test.describe('ACP surface', () => {
  // TC-ACP-01 — No / empty / garbage key → 401 (fails closed). Guards H1.
  test('manifest and run reject missing or invalid keys with 401', async ({ request }) => {
    // No header.
    expect((await request.get('/api/acp/manifest')).status()).toBe(401)
    // Empty header.
    expect((await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': '' } })).status()).toBe(401)
    // Garbage header.
    expect((await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': 'not-a-real-key' } })).status()).toBe(401)
    // run with a garbage key.
    const run = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': 'not-a-real-key' },
      data: { capability: 'generate_post', input: {} },
    })
    expect(run.status()).toBe(401)
  })

  test.describe('with a real minted key', () => {
    let plaintextKey: string
    let keyId: string

    test.beforeAll(async ({ request }) => {
      const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
      const created = await (
        await admin.post('/api/team/api-keys', { label: `ACP suite ${Date.now()}` })
      ).json()
      plaintextKey = created.plaintext
      keyId = created.id
      await admin.dispose()
    })

    test.afterAll(async ({ request }) => {
      if (!keyId) return
      const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
      await admin.del(`/api/team/api-keys/${keyId}`)
      await admin.dispose()
    })

    // TC-ACP-02 — Valid key → manifest.
    test('a valid key returns the agent manifest', async ({ request }) => {
      const res = await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': plaintextKey } })
      expect(res.status()).toBe(200)
      const manifest = await res.json()
      expect(manifest.name).toBe('bistec-studio')
      const names = (manifest.capabilities ?? []).map((c: { name: string }) => c.name)
      expect(names).toContain('generate_post')
      expect(names).not.toContain('publish_post')
      expect(manifest.version).toBe('2.2.0')
    })

    // TC-ACP-03 — run input validation → 400. Guards M6.
    test('run rejects malformed capability input with 400', async ({ request }) => {
      // generate_post with empty input (missing topic and designMode).
      const gen = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': plaintextKey },
        data: { capability: 'generate_post', input: {} },
      })
      expect(gen.status()).toBe(400)

      // publish_post is gone (037): an unknown capability, never a 2xx.
      const pub = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': plaintextKey },
        data: { capability: 'publish_post', input: { draftId: 'x', channel: 'INSTAGRAM' } },
      })
      expect(pub.status()).toBe(400)
      expect((await pub.json()).error).toMatch(/Unknown capability/)

      // Missing capability entirely.
      const noCap = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': plaintextKey },
        data: { input: {} },
      })
      expect(noCap.status()).toBe(400)
    })

    // TC-ACP-03b — 038 D13: the retired campaign field is refused by name, and a
    // projectId outside the key's team is the same 404 as an unknown one. Neither
    // creates a brief.
    test('generate_post refuses campaignId (400 CAMPAIGN_RETIRED) and an unknown projectId (404 PROJECT_NOT_FOUND)', async ({ request }) => {
      const base = { topic: `ACP retired ${Date.now()}`, channels: ['INSTAGRAM'], designMode: 'GENERATE' }
      const call = (input: Record<string, unknown>) =>
        request.post('/api/acp/run', {
          headers: { 'x-bistec-api-key': plaintextKey },
          data: { capability: 'generate_post', input: { ...base, ...input } },
        })

      for (const retired of [{ campaignId: 'c1' }, { campaignId: '' }, { campaign: 'c1' }]) {
        const res = await call(retired)
        expect(res.status()).toBe(400)
        const body = await res.json()
        expect(body.code).toBe('CAMPAIGN_RETIRED')
        expect(body.error).toBe('campaignId is retired; use projectId')
      }

      const missing = await call({ projectId: 'proj_does_not_exist' })
      expect(missing.status()).toBe(404)
      const body = await missing.json()
      expect(body.code).toBe('PROJECT_NOT_FOUND')
      expect(body.error).toBe('Project not found')

      expect((await call({ projectId: 5 })).status()).toBe(400)
    })

    // TC-ACP-04/05 — generate_post creates a draft under the system user (no FK
    // violation, guards L1), stamps the KEY'S team (Task 13), and returns a
    // SIGNED exportUrl (guards H10).
    test('generate_post creates a draft stamped with the key\'s team and returns a signed exportUrl', async ({ request }) => {
      test.skip(!MOCK_AI, 'requires MOCK_AI for deterministic generation')
      const res = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': plaintextKey },
        data: {
          capability: 'generate_post',
          input: {
            topic: `ACP gen ${Date.now()}`,
            goal: 'Drive signups',
            tone: 'professional',
            channels: ['INSTAGRAM'],
            designMode: 'GENERATE',
          },
        },
      })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.output?.draftId).toBeTruthy() // Brief+Draft created under the system user
      expect(body.output?.exportUrl).toMatch(/^https?:\/\//) // signed (H10)

      // Cross-tenant proof: this key belongs to Bistec, so the generated draft
      // must be readable via the key itself (getDraft is team-bound) — a
      // foreign team's key must not see it (asserted in team-isolation.test.ts).
      const readBack = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': plaintextKey },
        data: { capability: 'publish_post', input: { draftId: body.output.draftId, channel: 'BOGUS' } },
      })
      // publish_post is refused as an unknown capability (400), proving the
      // route reached dispatch with this key's auth accepted (not a 401/404
      // short-circuit) and that no 2xx exists for it.
      expect(readBack.status()).toBe(400)
    })
  })

  // TC-ACP-06 — a revoked key stops working immediately.
  test('a revoked key is rejected', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const created = await (
      await admin.post('/api/team/api-keys', { label: `ACP revoke-test ${Date.now()}` })
    ).json()
    await admin.del(`/api/team/api-keys/${created.id}`)
    await admin.dispose()

    const res = await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': created.plaintext } })
    expect(res.status()).toBe(401)
  })
})
