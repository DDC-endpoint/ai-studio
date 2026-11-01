import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planClear } from '../../scripts/lib/clearCampaigns.mjs'

// 038 AC-18: the pure plan of scripts/clear-campaign-data.mjs, and its DATABASE_URL guard.

type Plan = { lines: string[]; statements: string[]; exitCode: number }
const plan = (counts: Record<string, number>, yes: boolean, migrated = false) =>
  planClear(counts, { yes, migrated }) as Plan

const ROWS = {
  Campaign: 3,
  CampaignBriefing: 5,
  CampaignDocument: 2,
  ProjectCampaign: 1,
  briefsWithCampaign: 7,
  privatePosts: 11,
}
const NONE = { Campaign: 0, CampaignBriefing: 0, CampaignDocument: 0, ProjectCampaign: 0, briefsWithCampaign: 0, privatePosts: 4 }

describe('planClear', () => {
  it('a dry run with rows prints the five counts, the document count and the team-visible post count, runs nothing, exits 3', () => {
    const p = plan(ROWS, false)
    expect(p.exitCode).toBe(3)
    expect(p.statements).toEqual([])
    const text = p.lines.join('\n')
    expect(text).toContain('Campaign rows: 3')
    expect(text).toContain('CampaignBriefing rows: 5')
    expect(text).toContain('CampaignDocument rows: 2')
    expect(text).toContain('ProjectCampaign rows: 1')
    expect(text).toContain('Briefs with a campaign: 7')
    expect(text).toMatch(/visible to every member of their team.*: 11/)
    expect(text).toContain('sweep-campaign-documents.mjs')
  })

  it('--yes issues the unassign and the four deletes in order, and exits 0', () => {
    const p = plan(ROWS, true)
    expect(p.exitCode).toBe(0)
    expect(p.statements).toEqual([
      `UPDATE "Brief" SET "campaignId" = NULL WHERE "campaignId" IS NOT NULL`,
      'DELETE FROM "ProjectCampaign"',
      'DELETE FROM "CampaignDocument"',
      'DELETE FROM "CampaignBriefing"',
      'DELETE FROM "Campaign"',
    ])
  })

  it('with no rows it exits 0 with no statements, with or without --yes', () => {
    for (const yes of [false, true]) {
      const p = plan(NONE, yes)
      expect(p.exitCode).toBe(0)
      expect(p.statements).toEqual([])
      expect(p.lines.join('\n')).toContain('Nothing to clear.')
    }
  })

  it('an already migrated database exits 0 and reads no counts', () => {
    const p = plan({}, true, true)
    expect(p.exitCode).toBe(0)
    expect(p.statements).toEqual([])
    expect(p.lines.join('\n')).toContain('already migrated')
  })
})

describe('clear-campaign-data.mjs', () => {
  const script = join(process.cwd(), 'scripts', 'clear-campaign-data.mjs')
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
