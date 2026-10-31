/**
 * Pure planning for scripts/clear-campaign-data.mjs (038 FR-23, AC-18).
 *
 * `counts` holds the row counts the script read: Campaign, CampaignBriefing,
 * CampaignDocument, ProjectCampaign, briefsWithCampaign and privatePosts (drafts
 * whose brief has no campaign: under the old rule only their author saw them).
 * `opts.yes` is the --yes flag; `opts.migrated` is true when the Campaign table is
 * already gone. It returns the lines to print, the SQL statements to run (in
 * order, in one transaction; empty on a dry run) and the exit code:
 *   0 nothing to clear, already migrated, or cleared; 3 rows exist and this was a dry run.
 */
export const CLEAR_STATEMENTS = [
  {
    label: 'Briefs unassigned from their campaign',
    sql: `UPDATE "Brief" SET "campaignId" = NULL WHERE "campaignId" IS NOT NULL`,
  },
  { label: 'ProjectCampaign rows deleted', sql: 'DELETE FROM "ProjectCampaign"' },
  { label: 'CampaignDocument rows deleted', sql: 'DELETE FROM "CampaignDocument"' },
  { label: 'CampaignBriefing rows deleted', sql: 'DELETE FROM "CampaignBriefing"' },
  { label: 'Campaign rows deleted', sql: 'DELETE FROM "Campaign"' },
]

export function planClear(counts, { yes = false, migrated = false } = {}) {
  if (migrated) {
    return { lines: ['The Campaign table is gone: already migrated. Nothing to clear.'], statements: [], exitCode: 0 }
  }
  const c = (k) => counts[k] ?? 0
  const total =
    c('Campaign') + c('CampaignBriefing') + c('CampaignDocument') + c('ProjectCampaign') + c('briefsWithCampaign')
  const lines = [
    `Campaign rows: ${c('Campaign')}`,
    `CampaignBriefing rows: ${c('CampaignBriefing')}`,
    `CampaignDocument rows: ${c('CampaignDocument')} (their stored files are removed by scripts/sweep-campaign-documents.mjs after the migration)`,
    `ProjectCampaign rows: ${c('ProjectCampaign')}`,
    `Briefs with a campaign: ${c('briefsWithCampaign')}`,
    `Posts that become visible to every member of their team (private to their author today): ${c('privatePosts')}`,
  ]
  if (total === 0) {
    lines.push('Nothing to clear.')
    return { lines, statements: [], exitCode: 0 }
  }
  if (!yes) {
    lines.push('Dry run: nothing changed. Run again with --yes to unassign the briefs and delete these rows.')
    return { lines, statements: [], exitCode: 3 }
  }
  return { lines, statements: CLEAR_STATEMENTS.map((s) => s.sql), exitCode: 0 }
}
