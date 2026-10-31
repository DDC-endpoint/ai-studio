// 038 D5: one kit resolver. Only src/lib/projects/context.ts (every post) and the
// admin look probe (the team default, no project) may import resolveBrandKit at
// runtime, so the kit precedence has one copy. Type imports are free.
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

const ALLOWED = new Set(['src/lib/projects/context.ts', 'src/app/api/admin/look-probe/route.ts'])

/** True when the code imports the function (not only a type) from the resolver module. */
export function importsResolver(code: string): boolean {
  const imports = [...code.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]@\/lib\/brandkit\/resolve['"]/g)]
  return imports.some(([, isType, names]) => !isType && /\bresolveBrandKit\b(?!\s*:)/.test(names.replace(/\btype\s+\w+/g, '')))
}

describe('the kit resolver boundary', () => {
  it('only the context module and the look probe import resolveBrandKit', () => {
    const offenders = walk(join(root, 'src'))
      .map((p) => ({ path: relative(root, p).split(sep).join('/'), code: stripComments(readFileSync(p, 'utf8')) }))
      .filter((f) => importsResolver(f.code) && !ALLOWED.has(f.path))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('the context module does import it', () => {
    const code = stripComments(readFileSync(join(root, 'src/lib/projects/context.ts'), 'utf8'))
    expect(importsResolver(code)).toBe(true)
  })

  it('the matcher separates a value import from a type import', () => {
    expect(importsResolver("import { resolveBrandKit } from '@/lib/brandkit/resolve'")).toBe(true)
    expect(importsResolver("import { resolveBrandKit, type ResolvedBrandKit } from '@/lib/brandkit/resolve'")).toBe(true)
    expect(importsResolver("import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'")).toBe(false)
    expect(importsResolver("import { type ResolvedBrandKit } from '@/lib/brandkit/resolve'")).toBe(false)
  })

  it('the resolver has no campaign tier and the agent tool keeps no second copy of the chain', () => {
    const resolver = stripComments(readFileSync(join(root, 'src/lib/brandkit/resolve.ts'), 'utf8'))
    expect(resolver).not.toMatch(/campaign/i)
    const tools = stripComments(readFileSync(join(root, 'src/lib/agent/tools.ts'), 'utf8'))
    expect(tools).not.toMatch(/campaign/i)
    expect(tools).not.toMatch(/isDefault/)
  })
})
