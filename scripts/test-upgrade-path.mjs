// Upgrade-path test for change 022 (FR-03): proves that a database coming from
// `main` (the pre-fork schema) converts its legacy single captions and then passes
// 016's drop, that the carry-over is a no-op on a database that already
// dropped them, and that the carry-over's content guard fails the deploy
// atomically.
//
// Usage: npm run test:upgrade
// Requires: a reachable Postgres whose user may CREATE/DROP DATABASE (the
// docker-compose container locally, the `postgres` service in CI), and a
// generated Prisma client (`npx prisma generate`).
//
// DATABASE SAFETY. Only the SERVER is taken from DATABASE_URL (CI's env, else
// the .env.test line, else the setup-test-db.mjs fallback). The database name
// is always replaced by the hard-coded SCRATCH_DB below and asserted before
// anything connects; the script refuses to run otherwise. It never touches
// any other database (not ai_studio, not ai_studio_test). The scratch
// database is dropped (WITH (FORCE)) before each scenario and in a `finally`,
// and every temporary migrations folder is removed, pass or fail.
//
// Partial migrates copy schema.prisma, migration_lock.toml and the chosen
// migration directories into a temporary folder and run the repo's own
// Prisma CLI (`prisma migrate deploy --schema <tmp>/schema.prisma`), invoked
// through node rather than npx so it behaves the same on Windows and Linux.
//
// No model calls, no app code: raw SQL seeds and assertions only, plus one
// read through the head Prisma client.
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

// ── Constants ────────────────────────────────────────────────────────────────

const SCRATCH_DB = 'ai_studio_upgrade'
const MAINTENANCE_DB = 'postgres'
const FALLBACK_DB_URL = 'postgresql://bistec:bistec@localhost:5442/ai_studio_test'

const MAIN_HEAD = '20260728120000_heal_copy_edit_clobbered_drafts' // origin/main's migration head
const PRE_CARRYOVER = '20261012120000_model_selection'
const CARRYOVER = '20261012130000_legacy_caption_carryover'
const DROP_LEGACY = '20261013120000_drop_legacy_captions'
const DROP_TEAM = '20261013130000_drop_empty_default_team'
const GUARD_PREFIX = '022 legacy_caption_carryover'
const GUARD_037_PREFIX = '037 remove_scheduling_publishing refused:'
const PRE_037 = '20261030120000_apply_text_action' // the migration before 037
const REMOVE_PUBLISHING = '20261031120000_remove_scheduling_publishing' // 037
const GUARD_038_PREFIX = '038 drop_campaigns refused:'
const PRE_038 = '20261101120000_project_inputs' // the migration before 038's drop
const DROP_CAMPAIGNS = '20261101130000_drop_campaigns' // 038
const PERSONAL_KEY_MIGRATION = '20261028120000_personal_image_key_provider' // 031 C

// Scenario 3's sabotage: one exact replacement in the carry-over's INSERT, so
// it writes the wrong text and the content guard must bite.
const PATCH_FROM = 'ELSE l."copyText"'
const PATCH_TO = `ELSE l."copyText" || ' [022 test: wrong text]'`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS_DIR = join(ROOT, 'prisma', 'migrations')
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma')
const PRISMA_CLI = createRequire(import.meta.url).resolve('prisma/build/index.js')

// ── Connection URLs (asserted before any connection) ─────────────────────────

function readEnvTestDatabaseUrl() {
  try {
    for (const line of readFileSync(join(ROOT, '.env.test'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/)
      if (m) {
        const value = m[1].trim().replace(/^(['"])(.*)\1$/, '$2')
        if (value) return value
      }
    }
  } catch {
    // .env.test absent: fall through.
  }
  return null
}

function withDatabase(url, name) {
  const u = new URL(url)
  u.pathname = `/${name}`
  return u.toString()
}

function databaseOf(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

const SOURCE_URL = process.env.DATABASE_URL || readEnvTestDatabaseUrl() || FALLBACK_DB_URL
const SCRATCH_URL = withDatabase(SOURCE_URL, SCRATCH_DB)
const MAINTENANCE_URL = withDatabase(SOURCE_URL, MAINTENANCE_DB)

if (databaseOf(SCRATCH_URL) !== 'ai_studio_upgrade' || databaseOf(MAINTENANCE_URL) !== 'postgres') {
  console.error(
    `REFUSING TO RUN: derived database names are "${databaseOf(SCRATCH_URL)}" / "${databaseOf(MAINTENANCE_URL)}", ` +
      'expected "ai_studio_upgrade" / "postgres".',
  )
  process.exit(2)
}

// The scratch database is created and dropped on whatever server SOURCE_URL
// names, so only a local server is accepted: an exported production DATABASE_URL
// must never get a scratch database made (and dropped) next to its data.
const SOURCE_HOST = new URL(SOURCE_URL).hostname
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(SOURCE_HOST)) {
  console.error(`REFUSING TO RUN: database host "${SOURCE_HOST}" is not local.`)
  process.exit(2)
}

// ── Migrations on disk ───────────────────────────────────────────────────────

const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name))
  .map((d) => d.name)
  .sort()

for (const name of [MAIN_HEAD, PRE_CARRYOVER, CARRYOVER, DROP_LEGACY, DROP_TEAM, PERSONAL_KEY_MIGRATION, PRE_037, REMOVE_PUBLISHING, PRE_038, DROP_CAMPAIGNS]) {
  if (!ALL_MIGRATIONS.includes(name)) {
    console.error(`FAIL setup: migration ${name} not found in prisma/migrations`)
    process.exit(1)
  }
}

const upTo = (name) => ALL_MIGRATIONS.filter((m) => m <= name)

// ── Helpers ──────────────────────────────────────────────────────────────────

const tempDirs = new Set()
let admin = null // maintenance-DB client
let db = null // scratch-DB client of the running scenario

function runPrisma(args) {
  const res = spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    // DATABASE_URL is set explicitly, so the root .env (which Prisma also
    // loads, without overriding) can never redirect it.
    env: { ...process.env, DATABASE_URL: SCRATCH_URL, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  })
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

// Deploys the given migration directories (in order) from a temporary copy.
// `patch` optionally rewrites one migration's SQL first.
function deployFromTemp(migrations, patch) {
  const tmp = mkdtempSync(join(tmpdir(), 'bistec-upgrade-'))
  tempDirs.add(tmp)
  try {
    const migDir = join(tmp, 'migrations')
    mkdirSync(migDir)
    copyFileSync(SCHEMA, join(tmp, 'schema.prisma'))
    copyFileSync(join(MIGRATIONS_DIR, 'migration_lock.toml'), join(migDir, 'migration_lock.toml'))
    for (const m of migrations) cpSync(join(MIGRATIONS_DIR, m), join(migDir, m), { recursive: true })
    if (patch) {
      const file = join(migDir, patch.migration, 'migration.sql')
      const sql = readFileSync(file, 'utf8')
      const hits = sql.split(patch.from).length - 1
      if (hits !== 1) throw new Error(`patch "${patch.from}" must hit exactly once in ${patch.migration}, hit ${hits}`)
      writeFileSync(file, sql.replace(patch.from, patch.to))
    }
    return runPrisma(['migrate', 'deploy', '--schema', join(tmp, 'schema.prisma')])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
    tempDirs.delete(tmp)
  }
}

// The operator script, run against the scratch database only (DATABASE_URL is explicit).
function runClearScript(args) {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'clear-publishing-data.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: SCRATCH_URL },
  })
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

// The 038 operator script, run against the scratch database only (DATABASE_URL is explicit).
function runClearCampaigns(args) {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'clear-campaign-data.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: SCRATCH_URL },
  })
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

const deployFull = () => runPrisma(['migrate', 'deploy', '--schema', SCHEMA])

function mustDeploy(label, res) {
  if (res.status !== 0) throw new Error(`${label}: migrate deploy exited ${res.status}\n${res.output}`)
}

async function dropScratch() {
  if (SCRATCH_DB !== 'ai_studio_upgrade') throw new Error('scratch name changed')
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`)
}

async function freshScratch() {
  if (db) {
    await db.$disconnect()
    db = null
  }
  await dropScratch()
  await admin.$executeRawUnsafe(`CREATE DATABASE "${SCRATCH_DB}"`)
  db = new PrismaClient({ datasourceUrl: SCRATCH_URL })
}

const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x instanceof Date ? x.toISOString() : x))

async function columnExists(table, column) {
  const rows = await db.$queryRaw`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}`
  return rows.length > 0
}

async function tableExists(table) {
  const [{ reg }] = await db.$queryRawUnsafe(`SELECT to_regclass('"${table}"')::text AS reg`)
  return reg !== null
}

async function migrationRows() {
  const rows = await db.$queryRawUnsafe(
    'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
  )
  return new Map(rows.map((r) => [r.migration_name, r]))
}

const isBlank = (s) => /^\s*$/.test(s)

// What FR-01 says each channel row holds for a converted draft.
function expectedRows(copyText) {
  const feed = isBlank(copyText) ? '' : copyText
  return { INSTAGRAM: feed, LINKEDIN: feed, WHATSAPP: '' }
}

// ── Seeds (raw SQL against the schema at that point of the history) ──────────

const TEAM = 'team_bistec_default'
const USER = 'upg_user_1'

// Shaped on origin/main's schema.prisma (head 20260728120000).
async function seedMainBase() {
  await db.$executeRaw`
    INSERT INTO "Team" ("id", "name", "createdAt") VALUES (${TEAM}, 'Bistec', now())
    ON CONFLICT ("id") DO NOTHING`
  await db.$executeRaw`
    INSERT INTO "User" ("id", "name", "email", "username", "updatedAt", "role")
    VALUES (${USER}, 'Prod Admin', 'prod.admin@users.bistec.internal', 'prodadmin', now(), 'ADMIN'::"Role")`
}

async function seedMainDraft({ id, copyText, status }) {
  const briefId = `${id}_brief`
  await db.$executeRaw`
    INSERT INTO "Brief" ("id", "teamId", "userId", "topic", "goal", "tone", "channels", "designMode", "copyProviderKey")
    VALUES (${briefId}, ${TEAM}, ${USER}, ${`Topic ${id}`}, 'awareness', 'friendly',
            ARRAY['INSTAGRAM', 'LINKEDIN']::"Channel"[], 'GENERATE'::"DesignMode", 'cli')`
  await db.$executeRaw`
    INSERT INTO "Draft" ("id", "teamId", "briefId", "copyText", "status", "htmlContent", "exportUrl", "currentRevisionNumber")
    VALUES (${id}, ${TEAM}, ${briefId}, ${copyText}, ${status}::"DraftStatus",
            '<!doctype html><html><body>x</body></html>', ${`exports/${id}.png`}, 1)`
}

const LONG_CAPTION = (() => {
  const para = 'BISTEC Global builds software that helps teams ship faster, with care for quality and people. '
  let s = ''
  for (let i = 1; s.length < 3000; i++) s += `${i}. ${para}${i % 4 === 0 ? '\n\n' : ''}`
  return `${s.slice(0, 2990)} #BISTEC`
})()

// Prod-shaped legacy drafts (FR-03 scenario 1, step 2).
const LEGACY = [
  {
    id: 'upg_headers',
    status: 'PUBLISHED',
    copyText:
      'Instagram:\nBig news ✨ Our new studio is live! #launch #design\n\nLinkedIn:\nWe are pleased to announce the launch of our new studio.\n#BISTEC',
  },
  { id: 'upg_hashtags', status: 'EXPORTED', copyText: 'Launch day 🚀🎉 Come see us! #BISTEC #AI #launch 👩🏽‍💻 ❤️' },
  { id: 'upg_sinhala', status: 'EXPORTED', copyText: 'සුබ අලුත් අවුරුද්දක් වේවා! 🌸 BISTEC පවුලෙන් සුභ පැතුම්. #සිංහල #අවුරුදු' },
  { id: 'upg_crlf', status: 'EXPORTED', copyText: 'Line one\r\nLine two  \r\n\r\nLine three \t \r\n  ' },
  { id: 'upg_long', status: 'EXPORTED', copyText: LONG_CAPTION },
  { id: 'upg_pending_empty', status: 'IN_PROGRESS', copyText: '' },
  { id: 'upg_whitespace', status: 'FAILED', copyText: ' \t\r\n  \n ' },
  { id: 'upg_scheduled', status: 'EXPORTED', copyText: 'Coming soon: our autumn programme. Applications open now. #soon' },
]
const SCHEDULED_POST = 'upg_post_scheduled'

// FR-03 scenario 1, step 3: shaped on the schema at 20261012120000.
const CAPTIONED = 'upg_already_captioned'
const POST012 = 'upg_post012'

async function seedPre016Drafts() {
  for (const [id, copyText, migration] of [
    [CAPTIONED, 'Instagram: split upstream\nLinkedIn: by the 012 boot backfill', 'SPLIT'],
    [POST012, null, null],
  ]) {
    const briefId = `${id}_brief`
    await db.$executeRaw`
      INSERT INTO "Brief" ("id", "teamId", "userId", "topic", "goal", "tone", "channels", "designMode", "copyProviderKey")
      VALUES (${briefId}, ${TEAM}, ${USER}, ${`Topic ${id}`}, 'awareness', 'friendly',
              ARRAY['INSTAGRAM', 'LINKEDIN', 'WHATSAPP']::"Channel"[], 'GENERATE'::"DesignMode", 'cli')`
    await db.$executeRawUnsafe(
      `INSERT INTO "Draft" ("id", "teamId", "briefId", "copyText", "status", "headline", "captionMigration")
       VALUES ($1, $2, $3, $4, 'EXPORTED'::"DraftStatus", 'A headline', $5::"CaptionMigration")`,
      id,
      TEAM,
      briefId,
      copyText,
      migration,
    )
    const rows = [
      ['INSTAGRAM', `IG text for ${id} #ig`, 'claude-sonnet-4-5'],
      ['LINKEDIN', `LinkedIn text for ${id}`, null],
      ['WHATSAPP', id === POST012 ? `WhatsApp text for ${id}` : '', null],
    ]
    for (const [channel, text, model] of rows) {
      await db.$executeRawUnsafe(
        `INSERT INTO "DraftCaption" ("id", "draftId", "channel", "text", "status", "needsReview", "model")
         VALUES ($1, $2, $3::"Channel", $4, 'READY'::"CaptionStatus", $5, $6)`,
        `${id}_${channel.toLowerCase()}`,
        id,
        channel,
        text,
        channel === 'LINKEDIN',
        model,
      )
    }
  }
}

const CAPTION_COLS = `"id", "draftId", "channel"::text AS channel, "text", "status"::text AS status, "model",
  "modelSubstitutedFrom", "failureReason", "createdAt", "updatedAt"`

async function captionsOf(draftIds) {
  return db.$queryRawUnsafe(
    `SELECT ${CAPTION_COLS} FROM "DraftCaption" WHERE "draftId" = ANY($1::text[]) ORDER BY "draftId", "channel"`,
    draftIds,
  )
}

// ── Scenarios ────────────────────────────────────────────────────────────────

async function scenario1() {
  const failures = []
  const check = (ok, msg) => {
    if (!ok) failures.push(msg)
  }

  await freshScratch()
  mustDeploy('to main head', deployFromTemp(upTo(MAIN_HEAD)))
  await seedMainBase()
  for (const d of LEGACY) await seedMainDraft(d)
  await db.$executeRaw`
    INSERT INTO "Post" ("id", "teamId", "draftId", "userId", "channel", "status", "scheduledAt")
    VALUES (${SCHEDULED_POST}, ${TEAM}, 'upg_scheduled', ${USER}, 'INSTAGRAM'::"Channel",
            'SCHEDULED'::"PostStatus", '2026-12-01T09:00:00Z')`

  mustDeploy('to 20261012120000', deployFromTemp(upTo(PRE_CARRYOVER)))
  await seedPre016Drafts()
  const keptBefore = json(await captionsOf([CAPTIONED, POST012]))
  const postBefore = json(await db.$queryRaw`SELECT * FROM "Post" WHERE "id" = ${SCHEDULED_POST}`)

  // 037: today's checks run on the schema before 037 (Post and PUBLISHED still exist).
  mustDeploy('to the migration before 037', deployFromTemp(upTo(PRE_037)))

  // Converted legacy drafts: 3 READY rows each, expected text, null model.
  const rows = await captionsOf(LEGACY.map((d) => d.id))
  for (const d of LEGACY) {
    const mine = rows.filter((r) => r.draftId === d.id)
    check(mine.length === 3, `${d.id}: expected 3 caption rows, got ${mine.length}`)
    const want = expectedRows(d.copyText)
    for (const r of mine) {
      check(r.status === 'READY', `${d.id}/${r.channel}: status ${r.status}`)
      check(r.model === null && r.modelSubstitutedFrom === null, `${d.id}/${r.channel}: model not null`)
      check(r.text === want[r.channel], `${d.id}/${r.channel}: text ${json(r.text)} != expected ${json(want[r.channel])}`)
    }
  }

  // Archive: one row per non-null copyText, equal to its source.
  const archive = await db.$queryRawUnsafe('SELECT "draftId", "copyText" FROM "LegacyCaptionArchive"')
  const sources = new Map([...LEGACY.map((d) => [d.id, d.copyText]), [CAPTIONED, 'Instagram: split upstream\nLinkedIn: by the 012 boot backfill']])
  check(archive.length === sources.size, `archive has ${archive.length} rows, expected ${sources.size}`)
  for (const a of archive) check(sources.get(a.draftId) === a.copyText, `archive ${a.draftId}: text differs from source`)
  check(!archive.some((a) => a.draftId === POST012), 'post-012 draft has an archive row')

  // Already-captioned and post-012 drafts untouched; post untouched.
  check(json(await captionsOf([CAPTIONED, POST012])) === keptBefore, 'already-captioned / post-012 caption rows changed')
  check(json(await db.$queryRaw`SELECT * FROM "Post" WHERE "id" = ${SCHEDULED_POST}`) === postBefore, 'scheduled post changed')

  // Schema state.
  check(!(await columnExists('Draft', 'copyText')), 'Draft.copyText still exists')
  const migs = await migrationRows()
  for (const m of [CARRYOVER, DROP_LEGACY, DROP_TEAM]) {
    check(migs.get(m)?.finished_at != null && migs.get(m)?.rolled_back_at == null, `${m} not recorded as applied`)
  }
  const team = await db.$queryRaw`SELECT 1 FROM "Team" WHERE "id" = ${TEAM}`
  check(team.length === 1, `${TEAM} was deleted although it has rows`)

  // 037 AC-02: head refuses while publishing rows exist, and leaves them alone.
  const refused = deployFull()
  check(refused.status !== 0, 'deploying head with a Post row and a PUBLISHED draft exited 0')
  check(refused.output.includes(GUARD_037_PREFIX), `the failed deploy has no "${GUARD_037_PREFIX}" message:
${refused.output}`)
  check(/1 Post, 0 ChannelToken, 0 ScheduledGeneration, 1 PUBLISHED drafts/.test(refused.output), 'the 037 message does not name the counts')
  check(await tableExists('Post'), 'Post table is gone after the refused deploy')
  check(json(await db.$queryRaw`SELECT * FROM "Post" WHERE "id" = ${SCHEDULED_POST}`) === postBefore, 'the Post row changed in the refused deploy')
  const [{ pub }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS pub FROM "Draft" WHERE status::text = 'PUBLISHED'`)
  check(pub === 1, `${pub} PUBLISHED drafts after the refused deploy, expected 1`)

  // Recovery: mark the failed migration rolled back, clear the data, deploy head.
  const resolved = runPrisma(['migrate', 'resolve', '--rolled-back', REMOVE_PUBLISHING, '--schema', SCHEMA])
  check(resolved.status === 0, `migrate resolve --rolled-back exited ${resolved.status}:
${resolved.output}`)
  const dry = runClearScript([])
  check(dry.status === 3, `clear-publishing-data dry run exited ${dry.status}, expected 3:
${dry.output}`)
  const cleared = runClearScript(['--yes'])
  check(cleared.status === 0, `clear-publishing-data --yes exited ${cleared.status}:
${cleared.output}`)
  mustDeploy('full deploy to head', deployFull())

  // 037 AC-01: the tables and types are gone; DraftStatus has three values.
  for (const t of ['Post', 'ChannelToken', 'ScheduledGeneration']) check(!(await tableExists(t)), `${t} still exists at head`)
  const types = await db.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typname IN ('PostStatus', 'PostGenerationAction', 'GenerationStatus')`)
  check(types.length === 0, `types still exist at head: ${json(types)}`)
  const labels = (await db.$queryRawUnsafe(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'DraftStatus' ORDER BY e.enumsortorder`)).map((r) => r.l)
  check(json(labels) === json(['IN_PROGRESS', 'EXPORTED', 'FAILED']), `DraftStatus is ${json(labels)}`)
  const [{ st }] = await db.$queryRawUnsafe(`SELECT status::text AS st FROM "Draft" WHERE id = 'upg_headers'`)
  check(st === 'EXPORTED', `the PUBLISHED draft is ${st} after the clear script, expected EXPORTED`)
  const [{ def }] = await db.$queryRawUnsafe(`SELECT column_default AS def FROM information_schema.columns WHERE table_name = 'Draft' AND column_name = 'status' AND table_schema = current_schema()`)
  check(String(def).includes('IN_PROGRESS'), `Draft.status default is ${def}`)

  // The head Prisma client reads every draft with its captions.
  try {
    const drafts = await db.draft.findMany({ include: { captions: true } })
    check(drafts.length === LEGACY.length + 2, `head client read ${drafts.length} drafts, expected ${LEGACY.length + 2}`)
    check(drafts.every((d) => d.captions.length === 3), 'head client: a draft does not have 3 captions')
  } catch (err) {
    failures.push(`head client read failed: ${err.message}`)
  }

  // Schema diff: the head database matches schema.prisma (AC-04).
  const diff = runPrisma(['migrate', 'diff', '--from-url', SCRATCH_URL, '--to-schema-datamodel', SCHEMA, '--exit-code'])
  check(diff.status === 0, `prisma migrate diff exited ${diff.status}:\n${diff.output}`)

  return {
    failures,
    detail: `${LEGACY.length} legacy drafts converted (${rows.length} rows), ${archive.length} archived, 2 kept drafts unchanged, post untouched at 037's predecessor, 037 refused with the counts and recovered through the clear script (tables gone, DraftStatus rebuilt), copyText dropped, 016 applied, ${TEAM} kept, head client read OK, migrate diff exit ${diff.status}`,
  }
}

async function scenario2() {
  const failures = []
  await freshScratch()
  mustDeploy('all but the carry-over', deployFromTemp(ALL_MIGRATIONS.filter((m) => m !== CARRYOVER)))
  const res = deployFull()
  if (res.status !== 0) failures.push(`full deploy exited ${res.status}:\n${res.output}`)
  const mig = (await migrationRows()).get(CARRYOVER)
  if (!(mig?.finished_at != null && mig?.rolled_back_at == null)) failures.push('carry-over not recorded as applied')
  if (!(await tableExists('LegacyCaptionArchive'))) failures.push('archive table missing')
  else {
    const [{ n }] = await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM "LegacyCaptionArchive"')
    if (n !== 0) failures.push(`archive has ${n} rows, expected 0`)
  }
  return { failures, detail: 'out-of-order carry-over applied as a no-op (exit 0), archive exists and is empty' }
}

async function scenario3() {
  const failures = []
  await freshScratch()
  mustDeploy('to main head', deployFromTemp(upTo(MAIN_HEAD)))
  await seedMainBase()
  await seedMainDraft({ id: 'upg_guard', status: 'EXPORTED', copyText: 'A caption the sabotaged carry-over will get wrong. #guard' })

  const res = deployFromTemp(ALL_MIGRATIONS, { migration: CARRYOVER, from: PATCH_FROM, to: PATCH_TO })
  const guardLine = res.output.split(/\r?\n/).find((l) => l.includes(GUARD_PREFIX))?.trim() ?? null
  if (res.status === 0) failures.push('deploy with the sabotaged carry-over exited 0')
  if (!guardLine) failures.push(`deploy output has no "${GUARD_PREFIX}" message:\n${res.output}`)

  if (!(await columnExists('Draft', 'copyText'))) failures.push('Draft.copyText was dropped')
  const [{ n }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "DraftCaption" WHERE "draftId" = 'upg_guard'`)
  if (n !== 0) failures.push(`draft has ${n} caption rows after the failed deploy`)
  const archiveExists = await tableExists('LegacyCaptionArchive')
  if (archiveExists) {
    const [{ a }] = await db.$queryRawUnsafe('SELECT count(*)::int AS a FROM "LegacyCaptionArchive"')
    if (a !== 0) failures.push(`archive has ${a} rows after the failed deploy`)
  }
  const migs = await migrationRows()
  if (migs.get(DROP_LEGACY)?.finished_at != null) failures.push(`${DROP_LEGACY} was applied`)
  if (migs.get(CARRYOVER)?.finished_at != null) failures.push('sabotaged carry-over recorded as finished')

  return {
    failures,
    detail: `deploy exit ${res.status}; copyText kept, 0 caption rows, archive table ${archiveExists ? 'empty' : 'absent'}, 016 not applied`,
    guardLine,
  }
}

// 031 AC-10: a personal image key written before the provider column existed
// reads as openai after the migrations, and the resolver serves it as the
// personal tier. The one place this script runs app code: a tsx child process
// (env and database pinned to the scratch database) does the encrypting and the
// resolving, so the row holds a real ciphertext. Node 22 (CI) does not expose
// the named exports of the tsx-compiled CJS module, so each call falls back to
// m.default.
const TSX_CLI = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const KEY_PLAINTEXT = 'sk-upgrade-scenario-key-000000'
const CRYPTO_ENV = { TOKEN_ENCRYPTION_KEY: 'd'.repeat(64) }

function runTsx(code) {
  const res = spawnSync(process.execPath, [TSX_CLI, '-e', code], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...CRYPTO_ENV, DATABASE_URL: SCRATCH_URL },
  })
  return { status: res.status, stdout: (res.stdout ?? '').trim(), output: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

async function scenario4() {
  const failures = []
  await freshScratch()
  mustDeploy('before 031 C', deployFromTemp(ALL_MIGRATIONS.filter((m) => m < PERSONAL_KEY_MIGRATION)))
  await seedMainBase()
  const enc = runTsx(`import('@/lib/crypto').then((m) => console.log((m.encrypt ?? m.default.encrypt)(${JSON.stringify(KEY_PLAINTEXT)})))`)
  if (enc.status !== 0 || !enc.stdout) {
    failures.push(`could not encrypt the seed key:\n${enc.output}`)
    return { failures, detail: '' }
  }
  await db.$executeRaw`
    INSERT INTO "UserOpenAiKey" ("id", "userId", "encryptedKey", "keyPrefix", "status", "createdAt")
    VALUES ('upg_key_1', ${USER}, ${enc.stdout}, '…0000', 'ACTIVE', now())`
  if (await columnExists('UserOpenAiKey', 'provider')) failures.push('provider column exists before the migration')

  mustDeploy('full deploy to head', deployFull())
  const [row] = await db.$queryRaw`SELECT "provider", "status" FROM "UserOpenAiKey" WHERE "id" = 'upg_key_1'`
  if (row?.provider !== 'openai') failures.push(`provider is ${json(row?.provider)} after the migration, expected "openai"`)
  if (row?.status !== 'ACTIVE') failures.push(`status is ${json(row?.status)}, expected ACTIVE`)
  if (!(await columnExists('Draft', 'imageSource'))) failures.push('Draft.imageSource missing after the migration')

  const res = runTsx(
    `import('@/providers/registry').then(async (m) => {
       const r = await (m.resolveImageProviderWithSource ?? m.default.resolveImageProviderWithSource)({ teamId: ${JSON.stringify(TEAM)}, userId: ${JSON.stringify(USER)} })
       console.log(JSON.stringify({ tier: r && r.tier, providerName: r && r.providerName, apiKeyMatches: !!r && r.provider.client.apiKey === ${JSON.stringify(KEY_PLAINTEXT)} }))
       process.exit(0)
     })`,
  )
  let seen = null
  try {
    seen = JSON.parse(res.stdout.split(/\r?\n/).pop())
  } catch {
    failures.push(`the resolver run printed no result:\n${res.output}`)
  }
  if (seen) {
    if (seen.tier !== 'personal' || seen.providerName !== 'openai') failures.push(`resolver gave ${json(seen)}, expected tier personal, provider openai`)
    if (!seen.apiKeyMatches) failures.push('the resolver did not decrypt the pre-migration key')
  }
  return {
    failures,
    detail: `a pre-031 personal key reads provider "openai" and the resolver serves it as the personal tier (${json(seen)})`,
  }
}

async function scenario5() {
  const failures = []
  const check = (ok, msg) => {
    if (!ok) failures.push(msg)
  }

  await freshScratch()
  mustDeploy('to the migration before 038', deployFromTemp(upTo(PRE_038)))
  await seedMainBase()
  await db.$executeRaw`
    INSERT INTO "Project" ("id", "teamId", "name") VALUES ('upg_project', ${TEAM}, 'Upgrade project')`
  await db.$executeRaw`
    INSERT INTO "Campaign" ("id", "teamId", "name") VALUES ('upg_campaign', ${TEAM}, 'Upgrade campaign')`
  await db.$executeRaw`
    INSERT INTO "ProjectCampaign" ("projectId", "campaignId") VALUES ('upg_project', 'upg_campaign')`
  await db.$executeRaw`
    INSERT INTO "CampaignBriefing" ("id", "campaignId", "content", "createdBy")
    VALUES ('upg_cbriefing', 'upg_campaign', 'Briefing text', ${USER})`
  await db.$executeRaw`
    INSERT INTO "CampaignDocument" ("id", "teamId", "campaignId", "name", "contentType", "sizeBytes", "objectKey", "parsedText", "createdBy")
    VALUES ('upg_cdoc', ${TEAM}, 'upg_campaign', 'deck.pdf', 'application/pdf', 10, 'upg_campaign/1-deck.pdf', 'text', ${USER})`
  await db.$executeRaw`
    INSERT INTO "Brief" ("id", "teamId", "userId", "campaignId", "topic", "goal", "tone", "channels", "designMode", "copyProviderKey")
    VALUES ('upg_cbrief', ${TEAM}, ${USER}, 'upg_campaign', 'Campaign post', 'awareness', 'friendly',
            ARRAY['INSTAGRAM']::"Channel"[], 'GENERATE'::"DesignMode", 'cli')`
  await db.$executeRaw`
    INSERT INTO "Draft" ("id", "teamId", "briefId", "headline", "status", "htmlContent", "exportUrl", "currentRevisionNumber")
    VALUES ('upg_cdraft', ${TEAM}, 'upg_cbrief', 'Campaign post', 'EXPORTED'::"DraftStatus",
            '<!doctype html><html><body>x</body></html>', 'exports/upg_cdraft.png', 1)`
  const tables = ['Campaign', 'CampaignBriefing', 'CampaignDocument', 'ProjectCampaign']
  const readAll = async (t) => json(await db.$queryRawUnsafe(`SELECT * FROM "${t}"`))
  const before = {}
  for (const t of tables) before[t] = await readAll(t)

  // 038 AC-16: the head deploy fails closed and changes nothing.
  const refused = deployFull()
  check(refused.status !== 0, 'the head deploy succeeded while campaign rows existed')
  check(refused.output.includes(GUARD_038_PREFIX), `the 038 message is missing:\n${refused.output}`)
  check(
    /1 Campaign, 1 CampaignBriefing, 1 CampaignDocument, 1 ProjectCampaign, 1 briefs with a campaign/.test(refused.output),
    'the 038 message does not name the five counts',
  )
  for (const t of tables) {
    check(await tableExists(t), `${t} is gone after the refused deploy`)
    if (await tableExists(t)) check((await readAll(t)) === before[t], `${t} changed in the refused deploy`)
  }
  check(await columnExists('Brief', 'campaignId'), 'Brief.campaignId is gone after the refused deploy')

  // Recovery: mark the failed migration rolled back, clear the data, deploy head.
  const resolved = runPrisma(['migrate', 'resolve', '--rolled-back', DROP_CAMPAIGNS, '--schema', SCHEMA])
  check(resolved.status === 0, `migrate resolve --rolled-back exited ${resolved.status}:\n${resolved.output}`)
  const dry = runClearCampaigns([])
  check(dry.status === 3, `clear-campaign-data dry run exited ${dry.status}, expected 3:\n${dry.output}`)
  const [{ still }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS still FROM "Campaign"`)
  check(still === 1, `the dry run changed the campaign rows (${still})`)
  const cleared = runClearCampaigns(['--yes'])
  check(cleared.status === 0, `clear-campaign-data --yes exited ${cleared.status}:\n${cleared.output}`)
  mustDeploy('full deploy to head', deployFull())

  // 038 AC-17: the old tables and column are gone; the new ones exist.
  for (const t of tables) check(!(await tableExists(t)), `${t} still exists at head`)
  check(!(await columnExists('Brief', 'campaignId')), 'Brief.campaignId still exists at head')
  for (const t of ['ProjectBriefing', 'ProjectDocument']) check(await tableExists(t), `${t} is missing at head`)
  check(await columnExists('Brief', 'projectId'), 'Brief.projectId is missing at head')
  check(await columnExists('Draft', 'generationInputs'), 'Draft.generationInputs is missing at head')
  check(await columnExists('Project', 'defaultPostStyle'), 'Project.defaultPostStyle is missing at head')

  // The brief survives, unassigned; the head client reads its draft.
  const [brief] = await db.$queryRawUnsafe(`SELECT "projectId" FROM "Brief" WHERE id = 'upg_cbrief'`)
  check(brief !== undefined, 'the brief did not survive the clear and the drop')
  check(brief !== undefined && brief.projectId === null, `the brief's projectId is ${json(brief?.projectId)}, expected null`)
  try {
    const draft = await db.draft.findUnique({ where: { id: 'upg_cdraft' }, include: { brief: true } })
    check(draft !== null && draft.brief.projectId === null, 'head client: the draft or its brief did not read back')
  } catch (err) {
    failures.push(`head client read failed: ${err.message}`)
  }

  // Schema diff: the head database matches schema.prisma (NFR-05).
  const diff = runPrisma(['migrate', 'diff', '--from-url', SCRATCH_URL, '--to-schema-datamodel', SCHEMA, '--exit-code'])
  check(diff.status === 0, `prisma migrate diff exited ${diff.status}:\n${diff.output}`)

  return {
    failures,
    detail: `038 refused with the five counts and left every row unchanged, recovered through resolve and the clear script (dry run exit ${dry.status}, --yes exit ${cleared.status}), tables and column gone, the brief kept with projectId null, head client read OK, migrate diff exit ${diff.status}`,
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Upgrade-path test: scratch database "${SCRATCH_DB}" on ${new URL(SCRATCH_URL).host}`)
  admin = new PrismaClient({ datasourceUrl: MAINTENANCE_URL })
  let failed = 0
  const started = Date.now()
  try {
    for (const [name, fn] of [
      ['scenario 1 (prod path: main head → head)', scenario1],
      ['scenario 2 (already dropped: carry-over is a no-op)', scenario2],
      ['scenario 3 (content guard bites, atomically)', scenario3],
      ['scenario 4 (031: a pre-existing personal image key resolves as openai)', scenario4],
      ['scenario 5 (038: the campaign drop fails closed, then recovers)', scenario5],
    ]) {
      const t0 = Date.now()
      let result
      try {
        result = await fn()
      } catch (err) {
        result = { failures: [err.stack ?? String(err)], detail: '' }
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      if (result.failures.length === 0) {
        console.log(`PASS ${name} [${secs}s]: ${result.detail}`)
      } else {
        failed++
        console.log(`FAIL ${name} [${secs}s]`)
        for (const f of result.failures) console.log(`  - ${f}`)
      }
      if (result.guardLine) console.log(`  guard message: ${result.guardLine}`)
    }
  } finally {
    if (db) await db.$disconnect().catch(() => {})
    try {
      await dropScratch()
      const left = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${SCRATCH_DB}`
      console.log(`cleanup: scratch database ${left.length === 0 ? 'dropped' : 'STILL PRESENT'}`)
      if (left.length !== 0) failed++
    } catch (err) {
      console.log(`cleanup: FAILED to drop the scratch database: ${err.message}`)
      failed++
    }
    for (const t of tempDirs) rmSync(t, { recursive: true, force: true })
    await admin.$disconnect().catch(() => {})
  }
  console.log(`${failed === 0 ? 'ALL PASS' : `${failed} FAILURE(S)`} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
