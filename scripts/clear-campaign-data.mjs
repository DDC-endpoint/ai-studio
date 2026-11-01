/**
 * Operator clear for the campaign data (038 FR-23), run BEFORE the migration
 * 20261101130000_drop_campaigns, which refuses to run while any of these rows exist.
 *
 *   DATABASE_URL=<url> node scripts/clear-campaign-data.mjs          (dry run)
 *   DATABASE_URL=<url> node scripts/clear-campaign-data.mjs --yes    (clear)
 *
 * The dry run prints the counts and the number of posts that become visible to
 * every member of their team. --yes sets Brief.campaignId to NULL and deletes the
 * ProjectCampaign, CampaignDocument, CampaignBriefing and Campaign rows, in one
 * transaction. The stored document files stay until scripts/sweep-campaign-documents.mjs
 * runs after the migration. Raw SQL only (the head Prisma client has no campaign models).
 *
 * Refuses to run without an explicit DATABASE_URL in the environment (it never
 * falls back to a .env file). Exit codes: 0 done, nothing to clear or already
 * migrated, 1 bad usage, 2 no DATABASE_URL, 3 rows found on a dry run.
 */
import { CLEAR_STATEMENTS, planClear } from './lib/clearCampaigns.mjs'

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
  console.error('Usage: clear-campaign-data.mjs [--yes]')
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
  const [{ reg }] = await prisma.$queryRawUnsafe(`SELECT to_regclass('"Campaign"')::text AS reg`)
  const migrated = reg === null
  const countOf = async (sql) => {
    const [{ n }] = await prisma.$queryRawUnsafe(sql)
    return n
  }
  let counts = {}
  if (!migrated) {
    counts = {
      Campaign: await countOf('SELECT count(*)::int AS n FROM "Campaign"'),
      CampaignBriefing: await countOf('SELECT count(*)::int AS n FROM "CampaignBriefing"'),
      CampaignDocument: await countOf('SELECT count(*)::int AS n FROM "CampaignDocument"'),
      ProjectCampaign: await countOf('SELECT count(*)::int AS n FROM "ProjectCampaign"'),
      briefsWithCampaign: await countOf('SELECT count(*)::int AS n FROM "Brief" WHERE "campaignId" IS NOT NULL'),
      privatePosts: await countOf(
        'SELECT count(*)::int AS n FROM "Draft" d JOIN "Brief" b ON b."id" = d."briefId" WHERE b."campaignId" IS NULL',
      ),
    }
  }

  const plan = planClear(counts, { yes, migrated })
  for (const line of plan.lines) console.log(line)
  if (plan.statements.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const s of CLEAR_STATEMENTS) {
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
