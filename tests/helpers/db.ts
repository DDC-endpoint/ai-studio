/**
 * Direct test-DB access for the cases that can't be set up through HTTP alone:
 *   - seeding an unusual Draft/Post row state (no exportUrl, no htmlContent, a
 *     legacy full-URL exportUrl, a stuck PUBLISHING lease)
 *   - asserting raw rows / pg_indexes (the §K remediation regression suite)
 *
 * The Playwright runner process does not always carry DATABASE_URL (the standard
 * `test:e2e:mock` script sets only MOCK_* and TEST_BASE_URL). To stay robust we read
 * DATABASE_URL from the environment first, then fall back to parsing .env.test at
 * the repo root. If neither yields a URL, `prisma` is null and DB-dependent specs
 * skip themselves (so the HTTP-only suite is unaffected).
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readFromEnvTestFile(key: string): string | null {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.test'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`))
      if (m) return m[1].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.test absent.
  }
  return null
}

/**
 * Read a var from .env.test (repo root) first, then the process env. .env.test
 * is authoritative for tests — and crucially, importing @prisma/client runs
 * Prisma's bundled dotenv, which loads the DEV `.env` into process.env. So for
 * DATABASE_URL especially, process.env is the WRONG (dev) value in the runner;
 * the file must win. Returns null if unset in both places.
 */
export function readEnvTest(key: string): string | null {
  return readFromEnvTestFile(key) ?? (process.env[key] ?? null)
}

const databaseUrl = readEnvTest('DATABASE_URL')

export const dbAvailable = databaseUrl !== null

export const prisma: PrismaClient | null = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : null

/** Skip-guard message helper for specs that require DB access. */
export const NO_DB_MSG =
  'Test DB not reachable from the runner (set DATABASE_URL or run with .env.test loaded)'

/**
 * Seeds a CURATED caption row on a draft: a post made before 039 has Instagram
 * and LinkedIn rows, and a legacy WhatsApp row or a PENDING or FAILED row is
 * a state the route never leaves on its own. A case that only needs a live
 * curated caption makes it through the route (`curate` in helpers/api.ts, 039
 * T3). Returns the stored row.
 */
export async function seedCuratedCaption(
  draftId: string,
  channel: 'INSTAGRAM' | 'LINKEDIN' | 'WHATSAPP',
  text: string,
  status: 'READY' | 'FAILED' | 'PENDING' = 'READY',
) {
  if (!prisma) throw new Error(NO_DB_MSG)
  return prisma.draftCaption.create({
    data: { draftId, kind: 'CURATED', channel, text, status, failureReason: status === 'FAILED' ? 'missing' : null },
  })
}

/** Sets a brief's topic (039 T3): the mock sentinels (`__FAIL_CURATED__`, the fact values) live in it. */
export async function setBriefTopic(briefId: string, topic: string) {
  if (!prisma) throw new Error(NO_DB_MSG)
  return prisma.brief.update({ where: { id: briefId }, data: { topic } })
}
