/**
 * Pure planning for scripts/clear-publishing-data.mjs (037 FR-02, AC-03).
 *
 * `counts` holds the row counts the script read; `accounts` lists the connected
 * channel accounts as { team, channel }. `opts.yes` is the --yes flag. It returns
 * the lines to print, the SQL statements to run (in order, in one transaction;
 * empty on a dry run) and the exit code:
 *   0 nothing to clear, or cleared; 3 rows exist and this was a dry run.
 */
export const TABLES = ['Post', 'ScheduledGeneration', 'ChannelToken']

export const CLEAR_STATEMENTS = [
  { label: 'Post rows deleted', key: 'Post', sql: 'DELETE FROM "Post"' },
  { label: 'ScheduledGeneration rows deleted', key: 'ScheduledGeneration', sql: 'DELETE FROM "ScheduledGeneration"' },
  { label: 'ChannelToken rows deleted', key: 'ChannelToken', sql: 'DELETE FROM "ChannelToken"' },
  {
    label: 'PUBLISHED drafts set to EXPORTED',
    key: 'publishedDrafts',
    sql: `UPDATE "Draft" SET status = 'EXPORTED' WHERE status = 'PUBLISHED'`,
  },
]

export function planClear(counts, accounts = [], { yes = false } = {}) {
  const c = (k) => counts[k] ?? 0
  const total = c('Post') + c('ScheduledGeneration') + c('ChannelToken') + c('publishedDrafts')
  const lines = [
    `Post rows: ${c('Post')}`,
    `ScheduledGeneration rows: ${c('ScheduledGeneration')}`,
    `ChannelToken rows: ${c('ChannelToken')}`,
    `PUBLISHED drafts: ${c('publishedDrafts')}`,
  ]
  if (accounts.length > 0) {
    lines.push('Connected channel accounts:')
    for (const a of accounts) lines.push(`  - ${a.team}: ${a.channel}`)
    lines.push(
      'Dropping a stored token does not revoke the grant. Revoke this app\'s access on Instagram and LinkedIn by hand, for each account above.',
    )
  }
  if (total === 0) {
    lines.push('Nothing to clear.')
    return { lines, statements: [], exitCode: 0 }
  }
  if (!yes) {
    lines.push('Dry run: nothing deleted. Run again with --yes to delete these rows and set PUBLISHED drafts to EXPORTED.')
    return { lines, statements: [], exitCode: 3 }
  }
  return { lines, statements: CLEAR_STATEMENTS.map((s) => s.sql), exitCode: 0 }
}
