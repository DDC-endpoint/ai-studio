// 038 D6 / AC-09: the project context is the one way a generation reaches the
// kit and the project briefing.
//   1. Only src/lib/projects/context.ts can build a PostContext (the brand is
//      private there), and nothing else casts to it.
//   2. Every caller of the functions that take a context gets it from
//      newPostContext or postContext, or is on a short pass-through list.
//   3. Nothing outside src/lib/projects/ and src/app/api/projects/ reads the
//      briefing or the documents tables.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}
const rel = (p: string) => relative(root, p).split(sep).join('/')
const files = walk(join(root, 'src')).map((p) => ({ path: rel(p), code: stripComments(readFileSync(p, 'utf8')) }))

const CONTEXT = 'src/lib/projects/context.ts'

// Rule 1.
export function buildsPostContext(code: string): boolean {
  return /\bas\s+(unknown\s+as\s+)?PostContext\b/.test(code) || /\bunique\s+symbol\b/.test(code)
}

// Rule 3.
export function readsProjectInputs(code: string): boolean {
  return /\b(prisma|tx|db)\s*\.\s*(projectBriefing|projectDocument)\b/.test(code)
}

// Rule 2: the callers of the functions that take a context.
const TAKES_CONTEXT = ['buildBriefInput', 'runPathADesign', 'runPathBDesign', 'generateBackgroundForBrief', 'loadFactsSources']
const DEFINES = new Set([
  'src/lib/agent/briefInput.ts',
  'src/lib/agent/pathA.ts',
  'src/lib/agent/pathB.ts',
  'src/lib/agent/background.ts',
  'src/lib/factsCheck/sources.ts',
])
// A caller that receives the run's context as a parameter and passes it on.
const PASS_THROUGH: Record<string, string> = {
  'src/lib/agent/pathB.ts': 'runPathBDesign receives the run’s context and hands it to the background step',
  'src/lib/factsCheck/refresh.ts': 'computeFactsCheck receives the generation’s context; refreshFactsCheck loads it with postContext',
}
const CALL = new RegExp(`(?<![\\w.])(?:${TAKES_CONTEXT.join('|')})\\s*\\(`)
const GETS_CONTEXT = /\b(newPostContext|postContext)\s*\(/

export function callerBreaksContextRule(path: string, code: string): boolean {
  if (DEFINES.has(path) && !(path in PASS_THROUGH)) return false
  if (!CALL.test(code)) return false
  return !GETS_CONTEXT.test(code) && !(path in PASS_THROUGH)
}

describe('rule 1: only context.ts builds a PostContext', () => {
  it('no other file in src names the brand or casts to PostContext', () => {
    const offenders = files.filter((f) => f.path !== CONTEXT && buildsPostContext(f.code)).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('context.ts holds the brand and builds the value in one place', () => {
    const ctx = files.find((f) => f.path === CONTEXT)!
    expect(ctx.code).toMatch(/declare const brand: unique symbol/)
    expect(ctx.code.match(/\bas PostContext\b/g)).toHaveLength(1)
  })

  it('the matcher catches a hand-built context and ignores a type import', () => {
    expect(buildsPostContext('const c = { kit } as PostContext')).toBe(true)
    expect(buildsPostContext('const c = x as unknown as PostContext')).toBe(true)
    expect(buildsPostContext("import type { PostContext } from '@/lib/projects/context'")).toBe(false)
  })
})

describe('rule 2: every caller gets its context from newPostContext or postContext', () => {
  it('holds across src', () => {
    const offenders = files.filter((f) => callerBreaksContextRule(f.path, f.code)).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('finds the real callers (the rule is not vacuous)', () => {
    const callers = files.filter((f) => CALL.test(f.code) && !DEFINES.has(f.path)).map((f) => f.path)
    expect(callers).toEqual(
      expect.arrayContaining([
        'src/lib/agent/generateDraft.ts',
        'src/app/api/drafts/[id]/regenerate-copy/route.ts',
        'src/app/api/drafts/[id]/regenerate-design/route.ts',
        'src/app/api/generate/copy/route.ts',
        'src/app/api/admin/look-probe/route.ts',
      ]),
    )
  })

  it('the matcher fails a caller with no context source', () => {
    expect(callerBreaksContextRule('src/app/x/route.ts', 'const i = buildBriefInput(brief, kit)')).toBe(true)
    expect(
      callerBreaksContextRule('src/app/x/route.ts', 'const c = await postContext(d); buildBriefInput(brief, c)'),
    ).toBe(false)
  })
})

describe('rule 3: the briefing and document tables are read only by the context module and the project routes', () => {
  it('holds across src', () => {
    const offenders = files
      .filter((f) => !f.path.startsWith('src/lib/projects/') && !f.path.startsWith('src/app/api/projects/'))
      .filter((f) => readsProjectInputs(f.code))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('the matcher catches a read', () => {
    expect(readsProjectInputs('await prisma.projectBriefing.findFirst({})')).toBe(true)
    expect(readsProjectInputs('await prisma.project.findFirst({})')).toBe(false)
  })
})
