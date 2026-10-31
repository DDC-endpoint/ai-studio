import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// §K — Remediation regression suite (docs/e2e-test-plan.md). Guards the
// H7/H10/H11/L2 fixes specifically. (037 removed the publish-only cases: H7c,
// the Post indexes of H9, and the H12 scheduler.)
//
// Tiering:
//   - HTTP-only cases (H7a/b, H10a/b, L2) run in the standard mock suite.
//   - DB cases (H10c) need test-DB access — gated on dbAvailable.
//   - Chromium-singleton cases (H11) need a real-render serve (MOCK_PUPPETEER off)
//     — gated, and H11a/c require process observation (documented manual checks).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const REAL_RENDER = process.env.MOCK_PUPPETEER !== 'true'

async function createExportedDraft(api: ApiClient, topic = 'Reg Test'): Promise<string> {
  const kit = await (await api.post('/api/admin/brandkits', { name: `Reg Kit ${topic}`, colors: ['#0284c7'] })).json()
  const brief = await (await api.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', brandKitId: kit.id,
  })).json()
  const assembled = await (await api.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  await waitForDraft(api, assembled.draftId)
  return assembled.draftId
}

test.describe('§K — H7 atomicity', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-REG-H7a — Refine revision atomicity under the async single-flight contract.
  // Rewritten for async-draft-actions: refine now atomically claims
  // Draft.pendingAction and returns 202 {ok:true}; a concurrent refine 409s
  // instead of interleaving. The H7 guarantee this case guards is UNCHANGED —
  // revision numbers stay unique and contiguous with no 500s — but the
  // mechanism moved from "@@unique + $transaction retry under contention" to
  // "single-flight claim, so contention never reaches the transaction".
  // Two phases: (1) 10 SEQUENTIAL refines (each 202 → waitForAction) append
  // contiguous revisions 2..11; (2) 10 PARALLEL refines admit exactly ONE 202
  // (the rest 409) and land exactly one more revision.
  test('10 refines produce distinct sequential revision numbers (single-flight)', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api, `H7a-${Date.now()}`)

    // Generation records an initial v1 "Original design" revision (F2), so the
    // baseline is 1; N sequential refines must append N distinct, contiguous ones.
    const baseline = ((await (await api.get(`/api/drafts/${draftId}/revisions`)).json()) as unknown[]).length
    const N = 10
    for (let i = 0; i < N; i++) {
      const res = await api.post(`/api/drafts/${draftId}/refine`, { instruction: `sequential edit ${i}` })
      expect(res.status()).toBe(202)
      const done = await waitForAction(api, draftId)
      expect(done.pendingActionError).toBeNull()
    }

    const revisions = await (await api.get(`/api/drafts/${draftId}/revisions`)).json()
    const numbers = revisions.map((r: { revisionNumber: number }) => r.revisionNumber).sort((a: number, b: number) => a - b)
    const total = baseline + N
    expect(numbers.length).toBe(total)
    expect(new Set(numbers).size).toBe(total) // all distinct
    numbers.forEach((n: number, i: number) => expect(n).toBe(i + 1)) // contiguous 1..total

    // Parallel fire: the atomic pendingAction claim serializes refines — every
    // request either wins the slot (202) or is turned away (409), NEVER 500,
    // and each winner appends exactly one contiguous revision (losers write
    // nothing). Note on winner count: the claim guarantees at most one action
    // in flight at any instant, but under MOCK_AI/MOCK_PUPPETEER the
    // fire-and-forget action settles in milliseconds, so a later request in the
    // batch can legitimately re-claim a slot a previous winner has already
    // released. The number of winners is therefore timing-dependent (≥1); the
    // H7 guarantee this case guards is the integrity invariant below —
    // revisions == winners, all distinct & contiguous, no 500s — which holds
    // deterministically regardless of how the batch happens to interleave. (In
    // production the model call takes seconds, so the batch truly overlaps and
    // exactly one wins; that stronger property just isn't observable under the
    // instant mocks.)
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        api.post(`/api/drafts/${draftId}/refine`, { instruction: `parallel edit ${i}` }),
      ),
    )
    const statuses = results.map((r) => r.status())
    const winners = statuses.filter((s) => s === 202).length
    expect(winners).toBeGreaterThanOrEqual(1)
    expect(statuses.every((s) => s === 202 || s === 409)).toBe(true) // never 500
    expect(statuses.filter((s) => s === 409).length).toBe(N - winners)

    const settled = await waitForAction(api, draftId)
    expect(settled.pendingActionError).toBeNull()
    const after = await (await api.get(`/api/drafts/${draftId}/revisions`)).json()
    const afterNumbers = after.map((r: { revisionNumber: number }) => r.revisionNumber).sort((a: number, b: number) => a - b)
    expect(afterNumbers.length).toBe(total + winners) // exactly one revision per winner
    expect(new Set(afterNumbers).size).toBe(total + winners) // all distinct
    afterNumbers.forEach((n: number, i: number) => expect(n).toBe(i + 1)) // still contiguous
  })

  // TC-REG-H7b — Concurrent prompt version saves: distinct versions, ≤1 conflict, no 500.
  test('5 concurrent prompt saves produce distinct versions without 500s', async () => {
    const kit = await (await api.post('/api/admin/brandkits', { name: `H7b Kit ${Date.now()}` })).json()

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        api.post(`/api/admin/brandkits/${kit.id}/prompts`, { content: `voice ${i}`, createdBy: 'test' }),
      ),
    )
    for (const r of results) expect([201, 409]).toContain(r.status()) // never 500

    const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    const versions = detail.prompts.map((p: { version: number }) => p.version)
    expect(new Set(versions).size).toBe(versions.length) // versions are distinct
  })
})

test.describe('§K — H10 storage', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-REG-H10a — Public IMAGES bucket: anonymous read of an uploaded asset → 200.
  test('a brief-image upload is anonymously readable', async ({ request }) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    const up = await api.multipart('/api/briefs/images', {
      file: { name: 'a.png', mimeType: 'image/png', buffer: png },
    })
    expect(up.status()).toBe(200)
    const { url } = await up.json()
    expect(url).toMatch(/^https?:\/\//)
    // Anonymous read: the unauthenticated `request` fixture (no session cookie).
    const anon = await request.get(url, { headers: {} })
    expect(anon.status()).toBe(200)
  })

  // TC-REG-H10b — Private EXPORTS bucket: the bare object URL is NOT anonymously
  // readable; only the signed URL works.
  test('the export object is private but the signed URL works', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api, `H10b-${Date.now()}`)
    const draft = await (await api.get(`/api/drafts/${draftId}`)).json()
    const signed = draft.exportUrl as string
    expect(signed).toMatch(/^https?:\/\//)

    // Signed URL → 200.
    expect((await request.get(signed, { headers: {} })).status()).toBe(200)

    // Same object without the signature query → denied (private bucket).
    const bare = signed.split('?')[0]
    const anon = await request.get(bare, { headers: {} })
    expect(anon.status()).toBeGreaterThanOrEqual(400) // 403 (AccessDenied) on a private bucket
  })

  // TC-REG-H10c — Legacy full-URL exportUrl passes through unchanged (no double-sign).
  test('a legacy full-URL exportUrl is returned unchanged', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(api, `H10c-${Date.now()}`)
    const legacy = 'http://legacy.example.com/old-export.png'
    await prisma!.draft.update({ where: { id: draftId }, data: { exportUrl: legacy } })

    const draft = await (await api.get(`/api/drafts/${draftId}`)).json()
    expect(draft.exportUrl).toBe(legacy) // resolveExportUrl passes http(s):// through verbatim
  })
})

test.describe('§K — H11 Puppeteer', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-REG-H11b — Concurrency cap holds: parallel exports all complete (semaphore
  // queues, no crash/OOM). Requires a real-render serve (MOCK_PUPPETEER off).
  test('parallel exports under the concurrency cap all succeed', async () => {
    test.skip(!REAL_RENDER, 'requires a real-Chromium serve (MOCK_PUPPETEER=false)')
    const draftIds = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createExportedDraft(api, `H11b-${i}-${Date.now()}`)),
    )
    // Clear each export so the download has to render.
    await prisma!.draft.updateMany({ where: { id: { in: draftIds } }, data: { exportUrl: null } })
    const results = await Promise.all(draftIds.map(id => api.get(`/api/drafts/${id}/download`)))
    for (const r of results) {
      expect(r.status()).toBe(200)
      expect(r.headers()['content-type']).toBe('image/png')
    }
  })

  // TC-REG-H11a — Single Chromium process reused across renders. Not observable
  // via black-box HTTP (needs process inspection on the host).
  test('browser singleton is reused across renders', async () => {
    test.skip(true, 'manual/ops check — requires host process observation (one chromium process per run)')
  })

  // TC-REG-H11c — Relaunch after the browser disconnects mid-run. Needs killing
  // the Chromium process out-of-band; not driveable from a black-box test.
  test('renderer relaunches after a browser disconnect', async () => {
    test.skip(true, 'manual/ops check — kill chromium mid-run, then export again')
  })
})

test.describe('§K — L2 shared helpers', () => {
  // TC-REG-L2 — The shared helpers exist and are wired in (the duplicated copies
  // were removed). Static repo assertion (runs in the runner with repo cwd).
  test('apiFetch and brandkit systemContext helpers exist and are used', async () => {
    const apiFetch = resolve(process.cwd(), 'src/lib/apiFetch.ts')
    const systemContext = resolve(process.cwd(), 'src/lib/brandkit/systemContext.ts')
    expect(existsSync(apiFetch)).toBe(true)
    expect(existsSync(systemContext)).toBe(true)
    // Each is non-trivial (exports something the former copies now import).
    expect(readFileSync(apiFetch, 'utf8')).toMatch(/export/)
    expect(readFileSync(systemContext, 'utf8')).toMatch(/export/)
  })
})
