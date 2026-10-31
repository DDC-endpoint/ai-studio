// 038 FR-03: every handler in the post-keyed route files has a tier in
// POST_ACTION_TIERS, every tier names a real handler, the predicate in the file
// matches the tier, and every DraftAction value has a route.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { DraftAction } from '@prisma/client'
import { POST_ACTION_TIERS, DRAFT_ACTION_ROUTES } from '@/lib/authz/postActionTiers'

const ROOT = process.cwd()
const DIRS = ['src/app/api/drafts', 'src/app/api/generate', 'src/app/api/briefs']
const HANDLER = /^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/gm

function routeFiles(): string[] {
  return DIRS.flatMap((d) =>
    readdirSync(join(ROOT, d), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name === 'route.ts')
      .map((e) => relative(ROOT, join(e.parentPath, e.name)).split(sep).join('/')),
  )
}

const handlers: Record<string, string> = {}
for (const file of routeFiles()) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  // A file with several handlers is judged handler by handler (from one export
  // to the next); a file with one handler is judged whole, so a helper above
  // the handler counts.
  const found = [...src.matchAll(HANDLER)]
  found.forEach((m, i) => {
    handlers[`${file} ${m[1]}`] =
      found.length === 1 ? src : src.slice(m.index, found[i + 1]?.index ?? src.length)
  })
}

// Handlers with no tier, and tiers with no handler (AC-03's matcher).
function untiered(found: Record<string, string>, tiers: Record<string, string>) {
  return {
    missing: Object.keys(found).filter((k) => !(k in tiers)),
    stale: Object.keys(tiers).filter((k) => !(k in found)),
  }
}

describe('POST_ACTION_TIERS', () => {
  it('finds the handlers', () => {
    expect(Object.keys(handlers).length).toBeGreaterThan(15)
  })

  it('every handler has a tier', () => {
    expect(untiered(handlers, POST_ACTION_TIERS).missing).toEqual([])
  })

  it('every tier names a handler that exists', () => {
    expect(untiered(handlers, POST_ACTION_TIERS).stale).toEqual([])
  })

  it('a fixture handler with no entry fails the matcher (AC-03)', () => {
    const key = 'src/app/api/drafts/[id]/fixture/route.ts POST'
    const fixture = { ...handlers, [key]: 'export const POST = withTeamAuth(async () => {})' }
    expect(untiered(fixture, POST_ACTION_TIERS).missing).toEqual([key])
  })

  it('the predicate in the file matches the tier', () => {
    const wrong: string[] = []
    for (const [key, tier] of Object.entries(POST_ACTION_TIERS)) {
      const src = handlers[key]
      if (!src) continue
      // A view handler may call canEditPost to report `canEdit`; it must never
      // answer 403 with NOT_AUTHOR.
      const edit = /canEditPost\(/.test(src) && /NOT_AUTHOR/.test(src)
      const view = /canView\(/.test(src)
      if (tier === 'edit' && !(edit && view)) wrong.push(`${key}: edit needs canView, canEditPost and NOT_AUTHOR`)
      if (tier === 'view' && !(view && !edit)) wrong.push(`${key}: view needs canView and no NOT_AUTHOR`)
      if (tier === 'none' && edit) wrong.push(`${key}: none must not refuse with NOT_AUTHOR`)
    }
    expect(wrong).toEqual([])
  })

  it('every DraftAction value has an edit-tier route', () => {
    expect(Object.keys(DRAFT_ACTION_ROUTES).sort()).toEqual(Object.values(DraftAction).sort())
    for (const route of Object.values(DRAFT_ACTION_ROUTES)) expect(POST_ACTION_TIERS[route]).toBe('edit')
  })
})
