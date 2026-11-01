/**
 * Operator clear for the publishing data (037 FR-02), run BEFORE the migration
 * 20261031120000_remove_scheduling_publishing, which refuses to run while any
 * of these rows exist.
 *
 *   DATABASE_URL=<url> node scripts/clear-publishing-data.mjs          (dry run)
 *   DATABASE_URL=<url> node scripts/clear-publishing-data.mjs --yes    (delete)
 *
 * The dry run prints the counts and every connected channel account (team and
 * channel). --yes deletes Post, ScheduledGeneration and ChannelToken rows and
 * sets PUBLISHED drafts to EXPORTED, in one transaction, and prints each count.
 * Dropping a token does not revoke the grant: revoke the app on Instagram and
 * LinkedIn by hand. Raw SQL only (the head Prisma client has no Post model).
 * After the migration the tables are gone and the script reports nothing to clear.
 *
 * Refuses to run without an explicit DATABASE_URL in the environment (it never
 * falls back to a .env file). Exit codes: 0 done or nothing to clear, 1 bad
 * usage, 2 no DATABASE_URL, 3 rows found on a dry run.
 */
import { CLEAR_STATEMENTS, planClear } from './lib/clearPublishing.mjs'

// The guard reads the environment BEFORE @prisma/client is imported: importing the
// client loads a .env file into process.env as a side effect (see purge-analytics.mjs).
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Refusing to run: DATABASE_URL must be set explicitly in the environment.')
  process.exit(2)
}

const args = process.argv.slice(2)
const unknown = args.filter((a) => a !== '--yes')
if (unknown.length > 0) {
  console.error(`Unknown argument: ${unknown.join(' ')}`)
  console.error('Usage: clear-publishing-data.mjs [--yes]')
  process.exit(1)
}
const yes = args.includes('--yes')

const { PrismaClient } = await import('@prisma/client')

let dbName
try {
  dbName = new URL(url).pathname.replace(/^\//, '') || '(unknown)'
} catch {
  dbName = '(unparseable DATABASE_URL)'
}

const prisma = new PrismaClient({ datasourceUrl: url })
let exitCode = 0
try {
  console.log(`Database: ${dbName}`)
  const exists = async (table) => {
    const [{ reg }] = await prisma.$queryRawUnsafe(`SELECT to_regclass('"${table}"')::text AS reg`)
    return reg !== null
  }
  const countOf = async (table) => {
    if (!(await exists(table))) return 0
    const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`)
    return n
  }
  const counts = {
    Post: await countOf('Post'),
    ScheduledGeneration: await countOf('ScheduledGeneration'),
    ChannelToken: await countOf('ChannelToken'),
  }
  // After the migration PUBLISHED is not a DraftStatus value: compare as text.
  const [{ n: published }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "Draft" WHERE status::text = 'PUBLISHED'`,
  )
  counts.publishedDrafts = published
  const accounts =
    counts.ChannelToken > 0
      ? (
          await prisma.$queryRawUnsafe(
            `SELECT t."name" AS team, c."channel"::text AS channel
             FROM "ChannelToken" c LEFT JOIN "Team" t ON t."id" = c."teamId"
             ORDER BY t."name", c."channel"`,
          )
        ).map((r) => ({ team: r.team ?? '(unknown team)', channel: r.channel }))
      : []

  const plan = planClear(counts, accounts, { yes })
  for (const line of plan.lines) console.log(line)
  if (plan.statements.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const s of CLEAR_STATEMENTS) {
        // A table that is already gone has nothing to delete.
        if (s.key !== 'publishedDrafts' && !(await exists(s.key))) continue
        const n = await tx.$executeRawUnsafe(s.sql)
        console.log(`${s.label}: ${n}`)
      }
    })
  }
  exitCode = plan.exitCode
} finally {
  await prisma.$disconnect()
}
process.exit(exitCode)
