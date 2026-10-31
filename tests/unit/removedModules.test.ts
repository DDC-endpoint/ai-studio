// 037 AC-12 and 038 AC-20: the removed publishing, scheduling and held-generation modules
// stay removed. No file under src/ may import them or name the held reason, so
// a revert or a stray copy fails here.
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx|mjs)$/.test(d.name))
    .map((d) => relative(ROOT, join(d.parentPath, d.name)).split(sep).join('/'))
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const FORBIDDEN: Array<[label: string, pattern: RegExp]> = [
  ['jobRunner', /\bjobRunner\b/],
  ['generationRunner', /\bgenerationRunner\b/],
  ['heldReason', /\bheldReason\b/],
  ['src/lib/social', /lib\/social(?:\/|['"])/],
  ['src/lib/publish', /lib\/publish(?:\/|['"])/],
  ['@/lib/campaign', /lib\/campaign(?:\/|['"])/],
  ['@/components/campaigns', /components\/campaigns(?:\/|['"])/],
]

describe('removed modules (037 AC-12)', () => {
  const files = sourceFiles('src')

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it.each(FORBIDDEN)('no src file refers to %s', (label, pattern) => {
    const hits = files.filter((f) => pattern.test(stripComments(readFileSync(join(ROOT, f), 'utf8'))))
    expect(hits, label).toEqual([])
  })

  it('the removed directories and files are gone', () => {
    for (const path of [
      'src/lib/social',
      'src/lib/publish',
      'src/lib/scheduler/jobRunner.ts',
      'src/mcp/tools/publish.ts',
      'src/app/api/posts',
      'src/app/api/team/channels',
      'src/app/api/test/scheduler-tick',
      'src/lib/campaign',
      'src/components/campaigns',
      'src/app/api/campaigns',
      'src/app/(app)/campaigns',
    ]) {
      expect(existsSync(join(ROOT, path)), path).toBe(false)
    }
  })
})
