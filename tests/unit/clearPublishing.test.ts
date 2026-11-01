import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planClear } from '../../scripts/lib/clearPublishing.mjs'

// 037 AC-03: the pure plan of scripts/clear-publishing-data.mjs, and its
// DATABASE_URL guard.

type Plan = { lines: string[]; statements: string[]; exitCode: number }
const plan = (counts: Record<string, number>, accounts: { team: string; channel: string }[], yes: boolean) =>
  planClear(counts, accounts, { yes }) as Plan

const ROWS = { Post: 3, ScheduledGeneration: 2, ChannelToken: 1, publishedDrafts: 4 }
const ACCOUNTS = [{ team: 'Aloys', channel: 'INSTAGRAM' }]

describe('planClear', () => {
  it('a dry run with rows prints counts and accounts, runs nothing and exits 3', () => {
    const p = plan(ROWS, ACCOUNTS, false)
    expect(p.exitCode).toBe(3)
    expect(p.statements).toEqual([])
    const text = p.lines.join('\n')
    expect(text).toContain('Post rows: 3')
    expect(text).toContain('ScheduledGeneration rows: 2')
    expect(text).toContain('ChannelToken rows: 1')
    expect(text).toContain('PUBLISHED drafts: 4')
    expect(text).toContain('Aloys: INSTAGRAM')
    expect(text).toMatch(/Revoke .*Instagram and LinkedIn by hand/)
  })

  it('--yes issues the three deletes and the one remap, in order, and exits 0', () => {
    const p = plan(ROWS, ACCOUNTS, true)
    expect(p.exitCode).toBe(0)
    expect(p.statements).toEqual([
      'DELETE FROM "Post"',
      'DELETE FROM "ScheduledGeneration"',
      'DELETE FROM "ChannelToken"',
      `UPDATE "Draft" SET status = 'EXPORTED' WHERE status = 'PUBLISHED'`,
    ])
  })

  it('with nothing to clear it exits 0 with no statements, with or without --yes', () => {
    for (const yes of [false, true]) {
      const p = plan({ Post: 0, ScheduledGeneration: 0, ChannelToken: 0, publishedDrafts: 0 }, [], yes)
      expect(p.exitCode).toBe(0)
      expect(p.statements).toEqual([])
      expect(p.lines.join('\n')).toContain('Nothing to clear.')
    }
  })
})

describe('clear-publishing-data.mjs', () => {
  const script = join(process.cwd(), 'scripts', 'clear-publishing-data.mjs')
  const run = (args: string[], env: Record<string, string>) => {
    const base = { ...process.env } as Record<string, string | undefined>
    delete base.DATABASE_URL
    return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...base, ...env } as NodeJS.ProcessEnv })
  }

  it('exits 2 without DATABASE_URL, before any client is imported', () => {
    const res = run([], {})
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('DATABASE_URL must be set')
  })

  it('exits 1 on an unknown flag', () => {
    const res = run(['--nope'], { DATABASE_URL: 'postgresql://x:y@127.0.0.1:1/none' })
    expect(res.status).toBe(1)
  })
})
