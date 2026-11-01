# bistec-studio

An internal marketing post generation tool for the Bistec marketing team. bistec-studio turns a brief into a finished, on-brand social media post image: generate it, download the PNG, and copy a caption. Every post gets a general caption, and a member can curate Instagram, LinkedIn and Facebook captions on demand. It offers two generation paths: **Path A** uses HTML/CSS brand templates stored in the database filled by a Claude agent, while **Path B** generates freeform HTML/CSS designs directly. Both paths use a Claude agent harness and Puppeteer to render the final PNG output.

## Tech Stack

- **Framework:** Next.js 16, TypeScript, React 19
- **Database:** PostgreSQL with Prisma ORM
- **Storage:** MinIO-compatible object storage (`pgsty/silo`, pinned by digest)
- **Auth:** better-auth (self-hosted; accounts are created by a super admin, no public sign-up)
- **Rendering:** Puppeteer (headless Chromium)
- **AI:** Anthropic Claude (API key or Claude Code CLI mode)
- **Orchestration:** Docker Compose
- **Testing:** Vitest (unit, render harness), Playwright (E2E)

## Prerequisites

- **Node.js** >=22 (required for the `--env-file` flag in seed scripts; tested on v24)
- **Docker Desktop** with Docker Compose (for PostgreSQL + MinIO containers)
- **Claude Code CLI** (optional, for CLI-mode generation without an Anthropic API key)
- **Chromium/Chrome browser** (Windows hosts: set `PUPPETEER_EXECUTABLE_PATH` in `.env`)

## Quick Start

Follow the **authoritative setup guide** in [`docs/cold-start.md`](docs/cold-start.md) for detailed instructions. The local stack is the compose project `ai-studio`, with Postgres on host port 5442 and MinIO on 9100 (console 9101). The essential steps:

```bash
# 1. Install dependencies
npm install

# 2. Create .env from the example and fill in the secrets (see docs/cold-start.md §2)
cp .env.example .env

# 3. Start Docker containers (PostgreSQL + MinIO)
docker compose up -d postgres minio

# 4. Apply database migrations (runs the stack preflight first)
npm run db:migrate

# 5. Seed admin user + default brand kit
npm run db:seed

# 6. Start the dev server
npm run dev  # http://localhost:3000
```

Never run a bare `npx prisma migrate deploy`: `npm run db:migrate` runs `scripts/stack-preflight.mjs` first, which refuses an env that points at another clone's stack.

Log in with username `adminBTG` — the initial password is printed once by the seed script (`npm run db:seed`; or set `SEED_ADMIN_PASSWORD` beforehand to choose your own). Change it after first login. **The admin password is per-machine** — every dev machine has its own database, so use the password set on _that_ machine, not one from another setup (see `docs/cold-start.md` §0). Accounts sign in by username; the seeded admin is a super-admin and creates every other account at `/admin/users`.

To run it on a server, see [`docs/deploy.md`](docs/deploy.md).

## Scripts

| Script                   | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `npm run dev`            | Start the Next.js dev server on `http://localhost:3000`                 |
| `npm run build`          | Build for production                                                    |
| `npm run start`          | Serve a production build                                                |
| `npm run lint`           | ESLint                                                                  |
| `npm run typecheck`      | TypeScript type checking                                                |
| `npm run db:migrate`     | Stack preflight, then apply Prisma migrations                           |
| `npm run db:seed`        | Stack preflight, then seed the admin user and the demo brand kits       |
| `npm run test:unit`      | Unit tests (Vitest)                                                     |
| `npm run test:render`    | Render-fidelity harness through real Chromium (Vitest)                  |
| `npm run test:e2e:db`    | Set up the dedicated test database (`-- --reset` drops and rebuilds it) |
| `npm run test:e2e:serve` | Start the test-mode dev server on `http://localhost:3001`               |
| `npm run test:e2e:mock`  | Run the E2E suite with mocked AI and Puppeteer                          |
| `npm run test:e2e`       | Run Playwright E2E tests without the mock flags                         |
| `npm run test:e2e:reg`   | Run Playwright with `.env.test` loaded                                  |
| `npm run test:upgrade`   | Upgrade-path check from `main`'s schema on a scratch database           |
| `npm run mcp`            | Run the MCP server (`tsx src/mcp/server.ts`)                            |

## Documentation

- **[docs/cold-start.md](docs/cold-start.md)** — Local setup & preflight checklist
- **[docs/deploy.md](docs/deploy.md)** — Deploying on your own server with Docker Compose
- **[docs/handoff.md](docs/handoff.md)** — Architecture overview, Path A/B design, provider registration
- **[docs/mcp-acp-guide.md](docs/mcp-acp-guide.md)** — MCP and ACP machine access, team API keys
- **[docs/e2e-test-plan.md](docs/e2e-test-plan.md)** — E2E test catalog
- **[docs/code-review-findings.md](docs/code-review-findings.md)** — Code review & remediation status
- **[docs/ui-reference/DESIGN_SYSTEM.md](docs/ui-reference/DESIGN_SYSTEM.md)** — UI/design system
- **[.specclaw/changes/001-marketing-post-studio-v1/design.md](.specclaw/changes/001-marketing-post-studio-v1/design.md)** — Architecture, Prisma schema, API routes, provider abstraction
