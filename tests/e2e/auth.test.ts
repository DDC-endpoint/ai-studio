import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs } from '../helpers/api'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'

// §A — Authentication & RBAC (docs/e2e-test-plan.md).
//
// Contract notes verified against src/middleware.ts + src/lib/auth.ts:
//   - The session gate is MIDDLEWARE-level and REDIRECTS unauthenticated requests
//     to /login (302/307) — it does NOT return 401 — for every path except the
//     public prefixes (/login, /api/auth, /api/acp, /api/health). So an
//     unauthenticated API call is blocked by redirect, not by a 401 body.
//     (/api/acp fails closed with a route-level 401 — see acp.test.ts. /api/health
//     is a genuinely public 200 — see TC-AUTH-08.)
//   - /api/me returns the role LOWER-CASED ('admin' | 'editor'); the DB enum is
//     ADMIN/EDITOR and requireRole compares case-insensitively.
//   - Admin-only mutations return 403 for an editor (requireRole('admin')).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

test.describe('Authentication & RBAC', () => {
  // TC-AUTH-01 — Login success sets a session cookie.
  test('login with valid admin credentials sets a session cookie', async ({ request }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['set-cookie'] ?? '').toContain('better-auth.session_token=')
  })

  // TC-AUTH-02 — Login failure: wrong password, no session cookie.
  test('login with a wrong password is rejected without a session cookie', async ({ request }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      data: { email: ADMIN_EMAIL, password: 'wrong-password' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    // No usable session token issued.
    const setCookie = res.headers()['set-cookie'] ?? ''
    expect(/better-auth\.session_token=[^;]+/.test(setCookie) && !setCookie.includes('session_token=;')).toBe(false)
  })

  // TC-AUTH-03 — Unauthenticated access is blocked. The middleware redirects to
  // /login (it is NOT a 401 for these routes). Assert the redirect rather than 401.
  test('unauthenticated requests are redirected to /login', async ({ request }) => {
    for (const path of ['/api/library', '/api/drafts/anything']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect([301, 302, 303, 307, 308]).toContain(res.status())
      expect(res.headers()['location'] ?? '').toContain('/login')
    }
  })

  // TC-AUTH-04 — /api/me returns the lower-cased role. Guards H13.
  // The seeded admin is SUPER_ADMIN since the user-management feature.
  test('/api/me reports the role lower-cased for admin and editor', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const adminMe = await (await admin.get('/api/me')).json()
    expect(adminMe.role).toBe('super_admin')
    expect(adminMe.userId).toBeTruthy()

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const editorMe = await (await editor.get('/api/me')).json()
    expect(editorMe.role).toBe('editor')
  })

  // TC-AUTH-05 — Admin-only mutations are gated for an editor → 403. Guards H4.
  test('an editor is forbidden from admin-only mutations', async ({ request }) => {
    // Seed a project as admin to target.
    const { post: adminPost } = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const proj = await (await adminPost('/api/projects', { name: 'RBAC Project' })).json()

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    expect((await editor.patch(`/api/projects/${proj.id}`, { name: 'hijack' })).status()).toBe(403)
    expect((await editor.del(`/api/projects/${proj.id}`)).status()).toBe(403)
    // Any /api/admin/* write.
    expect((await editor.post('/api/admin/brandkits', { name: 'nope' })).status()).toBe(403)
  })

  // TC-AUTH-06 — requireRole is case-insensitive: the admin (ADMIN in DB) reaches
  // an admin route (200, not 403). Guards the role-casing fix.
  test('admin (ADMIN in DB) is allowed through requireRole', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const res = await admin.get('/api/admin/brandkits')
    expect(res.status()).toBe(200)
  })

  // TC-AUTH-07 — The public-prefix check is exact: a sibling path that merely
  // prefixes a public route is NOT exempted, so an unauthenticated request to it
  // is redirected to /login. Guards M9.
  test('a path that only prefixes a public route is still protected', async ({ request }) => {
    // "/api/authsomething" is not "/api/auth" and not under "/api/auth/".
    const res = await request.get('/api/authsomething', { maxRedirects: 0 })
    expect([301, 302, 303, 307, 308]).toContain(res.status())
    expect(res.headers()['location'] ?? '').toContain('/login')
  })

  // TC-AUTH-08 — /api/health is public (no session) and returns exactly
  // { ok: true, commit } — no other keys. Guards FR-P0-4 / AC-P0-3.
  test('/api/health is public and returns exactly {ok, commit}', async ({ request }) => {
    const res = await request.get('/api/health', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['commit', 'ok'])
    expect(json.ok).toBe(true)
    expect(typeof json.commit).toBe('string')
  })

  // Each probe below gets a FRESH context: a stale cookie in a shared jar makes
  // better-auth answer 403 MISSING_OR_NULL_ORIGIN and would mask the status
  // under test (the 404 must come from the allow-list).
  async function probe(method: 'GET' | 'POST', path: string, data?: unknown): Promise<number> {
    const ctx = await pwRequest.newContext({ baseURL: BASE })
    try {
      const res =
        method === 'GET'
          ? await ctx.get(path, { maxRedirects: 0 })
          : await ctx.post(path, { data, maxRedirects: 0 })
      return res.status()
    } finally {
      await ctx.dispose()
    }
  }

  // TC-AUTH-09 — Open self-registration is closed (change 034, AC-01).
  test('anonymous sign-up is refused and creates no user', async ({ request }) => {
    const username = `su${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const email = `${username}@example.com`
    const password = 'SignUpProbe1!'
    const status = await probe('POST', '/api/auth/sign-up/email', {
      name: 'Probe',
      email,
      username,
      password,
    })
    expect(status).toBe(404)

    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const users = (await (await sa.get('/api/admin/users')).json()) as { username?: string; email: string }[]
    expect(users.some((u) => u.email === email || u.username === username)).toBe(false)
    await sa.dispose()

    expect(await probe('POST', '/api/auth/sign-in/username', { username, password })).toBeGreaterThanOrEqual(400)
    expect(await probe('POST', '/api/auth/sign-in/email', { email, password })).toBeGreaterThanOrEqual(400)
  })

  // TC-AUTH-10 — The allow-list is exact (change 034, AC-02 + AC-03).
  test('allowed auth paths reach better-auth; everything else is 404', async () => {
    // Allowed: username sign-in 200 with a cookie, get-session 200 with that cookie.
    const ctx = await pwRequest.newContext({ baseURL: BASE })
    try {
      const signIn = await ctx.post('/api/auth/sign-in/username', {
        data: { username: 'adminBTG', password: ADMIN_PASSWORD },
      })
      expect(signIn.status()).toBe(200)
      expect(signIn.headers()['set-cookie'] ?? '').toContain('better-auth.session_token=')
      const session = await ctx.get('/api/auth/get-session')
      expect(session.status()).toBe(200)
      expect((await session.json())?.user).toBeTruthy()
    } finally {
      await ctx.dispose()
    }

    // Not allowed: wrong method, trailing slash, case, and an unused better-auth path.
    expect(await probe('GET', '/api/auth/sign-up/email')).toBe(404)
    // Next answers a trailing slash with its own 308 to the canonical path before the route
    // runs; the redirect is not followed here, so the slash path itself never signs anyone in.
    expect([308, 404]).toContain(
      await probe('POST', '/api/auth/sign-in/username/', { username: 'adminBTG', password: ADMIN_PASSWORD }),
    )
    expect(await probe('POST', '/api/auth/SIGN-UP/email', {})).toBe(404)
    expect(await probe('POST', '/api/auth/update-user', { name: 'x' })).toBe(404)
  })

  // TC-AUTH-11 — The brief image upload needs a team (change 034, AC-04).
  test('brief image upload: a user in no team gets 403, a team member 200', async ({ request }) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    const file = { name: 'a034.png', mimeType: 'image/png', buffer: png }

    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const username = `nt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const password = 'NoTeamUser1!'
    const created = await sa.post('/api/admin/users', { name: 'No Team', username, password })
    expect(created.status()).toBe(201)
    const { email } = await created.json()

    const noTeam = await loginAs(request, email, password)
    expect(((await noTeam.get('/api/me')).status())).toBe(200)
    expect((await noTeam.multipart('/api/briefs/images', { file })).status()).toBe(403)
    await noTeam.dispose()

    const member = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const ok = await member.multipart('/api/briefs/images', { file })
    expect(ok.status()).toBe(200)
    expect((await ok.json()).url).toBeTruthy()
    await member.dispose()
    await sa.dispose()
  })
})
