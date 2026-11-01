import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planSweep, selectOrphans } from '../../scripts/lib/sweepCampaignDocs.mjs'

// 038 AC-19: the pure plan of scripts/sweep-campaign-documents.mjs, and its env guard.

type Plan = { lines: string[]; deletes: string[]; exitCode: number }
const plan = (keys: string[], state: { dropCommitted: boolean; documentTableExists: boolean }, yes: boolean) =>
  planSweep(keys, state, { yes }) as Plan

const DONE = { dropCommitted: true, documentTableExists: false }
const KEYS = [
  'clx1a2b3c4d5e6f7g8h9i0j1k/1730000000000-deck.pdf',
  'cmz9y8x7w6v5u4t3s2r1q0p9o/1730000000001-notes.docx',
  'brandkits/k1/doc.pdf',
  'screenshots/t1/u1/shot.png',
  'projects/p1/brief.pdf',
]

describe('planSweep', () => {
  it('refuses with exit 4 when the drop has not committed, and deletes nothing', () => {
    for (const state of [
      { dropCommitted: false, documentTableExists: false },
      { dropCommitted: true, documentTableExists: true },
      { dropCommitted: false, documentTableExists: true },
    ]) {
      for (const yes of [false, true]) {
        const p = plan(KEYS, state, yes)
        expect(p.exitCode).toBe(4)
        expect(p.deletes).toEqual([])
      }
    }
  })

  it('selects only keys outside brandkits/, screenshots/ and projects/', () => {
    expect(selectOrphans(KEYS)).toEqual(['clx1a2b3c4d5e6f7g8h9i0j1k/1730000000000-deck.pdf', 'cmz9y8x7w6v5u4t3s2r1q0p9o/1730000000001-notes.docx'])
    // only the old campaign key shape is selected; any other or future prefix is kept
    expect(selectOrphans(['brandkits-x/a.pdf', 'exports/1730000000000-x.png', 'clx1a2b3c4d5e6f7g8h9i0j1k/notes.pdf'])).toEqual([])
  })

  it('a dry run lists the keys and exits 3', () => {
    const p = plan(KEYS, DONE, false)
    expect(p.exitCode).toBe(3)
    expect(p.deletes).toEqual([])
    const text = p.lines.join('\n')
    expect(text).toContain('clx1a2b3c4d5e6f7g8h9i0j1k/1730000000000-deck.pdf')
    expect(text).toContain('cmz9y8x7w6v5u4t3s2r1q0p9o/1730000000001-notes.docx')
    expect(text).not.toContain('brandkits/k1/doc.pdf')
  })

  it('--yes deletes exactly those keys and exits 0', () => {
    const p = plan(KEYS, DONE, true)
    expect(p.exitCode).toBe(0)
    expect(p.deletes).toEqual(['clx1a2b3c4d5e6f7g8h9i0j1k/1730000000000-deck.pdf', 'cmz9y8x7w6v5u4t3s2r1q0p9o/1730000000001-notes.docx'])
  })

  it('with nothing to sweep it exits 0', () => {
    const p = plan(['brandkits/k1/doc.pdf'], DONE, true)
    expect(p.exitCode).toBe(0)
    expect(p.deletes).toEqual([])
    expect(p.lines.join('\n')).toContain('Nothing to sweep.')
  })
})

describe('sweep-campaign-documents.mjs', () => {
  const script = join(process.cwd(), 'scripts', 'sweep-campaign-documents.mjs')
  const run = (args: string[], env: Record<string, string>) => {
    const base = { ...process.env } as Record<string, string | undefined>
    for (const k of ['DATABASE_URL', 'MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET_DOCS']) delete base[k]
    return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...base, ...env } as NodeJS.ProcessEnv })
  }

  it('exits 2 without an explicit environment', () => {
    const res = run([], {})
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('must be set explicitly')
  })

  it('exits 2 for the minioadmin keys', () => {
    const res = run([], {
      DATABASE_URL: 'postgresql://x:y@127.0.0.1:1/none',
      MINIO_ENDPOINT: 'http://127.0.0.1:1',
      MINIO_ACCESS_KEY: 'minioadmin',
      MINIO_SECRET_KEY: 'minioadmin',
      MINIO_BUCKET_DOCS: 'b',
    })
    expect(res.status).toBe(2)
  })
})
