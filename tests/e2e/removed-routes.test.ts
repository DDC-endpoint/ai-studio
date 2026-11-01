import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/ui'

// Removed routes (037 AC-04, 038 AC-20).
//
// The scheduling and publishing API is gone. Each route below answers 404 or
// 405 to a logged-in admin, never a 2xx. The test seams under /api/test are
// 404 whatever the method, so scheduler-tick and generation-tick are covered
// too (they were removed with the loops they drove).

let api: ApiClient
test.beforeEach(async ({ request }) => {
  api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
})
test.afterEach(async () => {
  await api.dispose()
})

const REMOVED: Array<[method: 'GET' | 'POST', path: string]> = [
  ['GET', '/api/posts'],
  ['POST', '/api/posts'],
  ['GET', '/api/team/channels'],
  ['GET', '/api/scheduler/status'],
  ['GET', '/api/campaigns/any-id/queue'],
  ['POST', '/api/test/scheduler-tick'],
  ['POST', '/api/test/generation-tick'],
  ['POST', '/api/generate/export'],
  // 038 AC-20: campaigns are gone.
  ['GET', '/api/campaigns'],
  ['POST', '/api/campaigns'],
  ['GET', '/api/campaigns/x'],
  ['GET', '/api/campaigns/x/brandkit'],
  ['GET', '/api/campaigns/x/briefing'],
  ['GET', '/api/campaigns/x/documents'],
  ['GET', '/campaigns'],
]

test.describe('037 and 038 removed routes', () => {
  for (const [method, path] of REMOVED) {
    test(`TC-RM-${method}-${path}: answers 404 or 405, never a 2xx`, async () => {
      const res = method === 'GET' ? await api.get(path) : await api.post(path, {})
      expect([404, 405], `${method} ${path} -> ${res.status()}`).toContain(res.status())
    })
  }
})
