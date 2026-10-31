// Provision the disposable E2E test database: create it (idempotent), apply all
// migrations, and seed the baseline (admin + Bistec kit + Hearts Talk kit + the
// keyless 'cli' COPY provider the brief flow validates against).
//
// Usage: npm run test:e2e:db [-- --reset]
//   --reset drops the test database first (WITH (FORCE)), for a clean gate.
// Requires: this clone's Postgres service running (`docker compose up -d`) and
// .env.test present. The npm script runs scripts/stack-preflight.mjs first.
//
// Configuration:
//   - The test DB URL is derived from DATABASE_URL in .env.test (simple line
//     parse — no dotenv dependency). When .env.test is missing or has no
//     DATABASE_URL, the historical default below is used as a fallback.
//   - Postgres is reached with `docker compose exec -T postgres psql`, so the
//     compose project (name: / COMPOSE_PROJECT_NAME) decides which container;
//     no container name is hard-coded.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FALLBACK_DB_URL = 'postgresql://bistec:bistec@localhost:5442/ai_studio_test'

// Minimal .env line parser: first `DATABASE_URL=...` line wins. Tolerates
// optional surrounding single/double quotes on the value.
function readEnvTestDatabaseUrl() {
  try {
    const lines = readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/)
      if (match) {
        const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2')
        if (value) return value
      }
    }
  } catch {
    // .env.test absent/unreadable — fall through to the historical default.
  }
  return null
}

const ENV_DB_URL = readEnvTestDatabaseUrl()
const TEST_DB_URL = ENV_DB_URL ?? FALLBACK_DB_URL
const TEST_DB_NAME = new URL(TEST_DB_URL).pathname.replace(/^\//, '') || 'ai_studio_test'
const RESET = process.argv.includes('--reset')

console.log(`Test DB: ${TEST_DB_NAME} (from ${ENV_DB_URL ? '.env.test DATABASE_URL' : 'built-in fallback'})`)

function run(cmd, env) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })
}

const PSQL = 'docker compose exec -T postgres psql -U bistec -d postgres -c'

// 0. --reset: drop the test database first. Only a *_test name is ever dropped.
if (RESET) {
  if (!TEST_DB_NAME.endsWith('_test') || !/^[a-z0-9_]+$/.test(TEST_DB_NAME)) {
    console.error(`REFUSING --reset: "${TEST_DB_NAME}" is not a *_test database.`)
    process.exit(2)
  }
  run(`${PSQL} "DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE);"`)
}

// 1. Create the database (ignore "already exists").
try {
  run(`${PSQL} "CREATE DATABASE ${TEST_DB_NAME};"`)
} catch {
  console.log('(test database already exists — continuing)')
}

// 2. Apply migrations against the test DB.
run('npx prisma migrate deploy', { DATABASE_URL: TEST_DB_URL })

// 3. Seed the baseline (each script reads DATABASE_URL etc. from .env.test).
//    seed-editor adds the non-admin account the RBAC/IDOR E2E tests log in as.
//    seed-teams adds the team-tenancy fixtures (Bistec + ClientX teams,
//    memberships, per-team project/kit/brief/draft) — must run after
//    seed-admin/seed-editor (it looks both users up by email) and before the
//    baseline brandkit/hearts-talk/cli-provider seeds, which now stamp their
//    rows onto the "Bistec" team. The migrations leave a fresh DB with no
//    team (016 FR-08), so seed-teams is what creates "Bistec".
//    SEED_FIXED_CREDENTIALS=true keeps seed-admin's fixed test password (the
//    E2E helpers log in with it) instead of generating a random one.
for (const script of [
  'seed-admin',
  'seed-editor',
  'seed-teams',
  'seed-brandkit',
  'seed-hearts-talk',
  'seed-cli-provider',
]) {
  run(`node --env-file=.env.test scripts/${script}.mjs`, { SEED_FIXED_CREDENTIALS: 'true' })
}

console.log('\n✅ Test database ready.')
