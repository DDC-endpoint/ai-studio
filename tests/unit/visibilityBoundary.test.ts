// 038 D10: src/lib/authz/visibility.ts is pure (a type import only), so no
// route can end up with a predicate that reads the database or another module.
// A campaign id never reaches an access decision.
//
// 038 FR-04: every file under src/app and src/mcp that queries prisma.draft or
// prisma.brief imports @/lib/authz/visibility, or is on the allow-list below
// with its reason.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const source = readFileSync(join(root, 'src/lib/authz/visibility.ts'), 'utf8')
const code = stripComments(source)

describe('visibility.ts boundary', () => {
  it('imports nothing but a type', () => {
    const imports = [...code.matchAll(/^\s*import\s+([^\n]*?)\s+from\s+['"]([^'"]+)['"]/gm)]
    expect(imports.length).toBeGreaterThan(0)
    for (const [, clause] of imports) expect(clause.startsWith('type ')).toBe(true)
    expect(code).not.toMatch(/\brequire\s*\(|\bimport\s*\(/)
  })

  it('does not read a campaign or the database', () => {
    expect(code).not.toMatch(/campaign/i)
    expect(code).not.toMatch(/prisma/i)
  })
})

// Files that query drafts or briefs without the visibility module, and why.
// The dashboard's "Posts this month" (037 D11) lives in src/app/(app)/page.tsx,
// which imports the module for "Drafts Ready", so it needs no entry.
// src/lib/agent/** is outside the walk: it receives an already authorized id.
const ALLOW: Record<string, string> = {
  'src/app/api/briefs/route.ts': 'creates the caller’s own brief; reads no existing post',
  'src/mcp/tools/generate.ts': 'MCP tool, scoped by the API key’s team',
  'src/app/api/test/draft-rendered-text/route.ts': 'MOCK_AI test seam, 404 in a prod build',
}

const QUERY = /\bprisma\s*\.\s*(draft|brief)\b/
const IMPORT = /from\s+['"]@\/lib\/authz\/visibility['"]/

/** True when the file breaks FR-04: it queries drafts or briefs without the module. */
function breaksReadBoundary(text: string): boolean {
  const c = stripComments(text)
  return QUERY.test(c) && !IMPORT.test(c)
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

const files = ['src/app', 'src/mcp'].flatMap((d) => walk(join(root, d)))
const rel = (p: string) => relative(root, p).split(sep).join('/')

describe('read boundary (FR-04)', () => {
  it('every draft or brief query imports the visibility module or is allow-listed', () => {
    const offenders = files
      .filter((p) => breaksReadBoundary(readFileSync(p, 'utf8')))
      .map(rel)
      .filter((p) => !(p in ALLOW))
    expect(offenders).toEqual([])
  })

  it('every allow-list entry still exists and still needs its entry', () => {
    for (const p of Object.keys(ALLOW)) {
      const text = readFileSync(join(root, p), 'utf8')
      expect(breaksReadBoundary(text), p).toBe(true)
    }
  })

  it('catches a route that filters drafts by teamId without the import (AC-04)', () => {
    const fixture = `
      import { prisma } from '@/lib/prisma'
      export const GET = async () => prisma.draft.findMany({ where: { teamId: 't1' } })
    `
    expect(breaksReadBoundary(fixture)).toBe(true)
    expect(breaksReadBoundary(`import { canView } from '@/lib/authz/visibility'\n${fixture}`)).toBe(false)
  })

  it('canAccessContent and briefVisibilityWhere are gone from src/', () => {
    const hits = walk(join(root, 'src'))
      .filter((p) => /\b(canAccessContent|briefVisibilityWhere)\b/.test(readFileSync(p, 'utf8')))
      .map(rel)
    expect(hits).toEqual([])
  })
})

// 039 T3 (FR-10): the new caption routes query drafts, so each imports the module.
describe('the caption delete and undo routes (039)', () => {
  it.each(['src/app/api/drafts/[id]/captions/route.ts', 'src/app/api/drafts/[id]/captions/undo/route.ts'])(
    '%s queries drafts and imports @/lib/authz/visibility',
    (p) => {
      const text = readFileSync(join(root, p), 'utf8')
      expect(text).toMatch(/from '@\/lib\/authz\/visibility'/)
      expect(text).toMatch(/prisma\.draft\./)
      expect(breaksReadBoundary(text)).toBe(false)
    },
  )
})
