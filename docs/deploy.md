# Deploying bistec-studio on your own server

This guide covers a self-hosted deploy with the repo's own `docker-compose.yml`. **No deploy workflow exists yet.** CI (`.github/workflows/e2e.yml`) only runs checks, and it publishes and deploys nothing. A deploy workflow will be written later. Until then, a deploy is the manual steps below.

The steps were checked on 2026-10-27 by a fresh deploy from zero during the pre-PR review of `v2` against `main`. It used the real compose file on an empty stack. All 46 migrations applied, there was no schema drift, `/api/health` returned 200, and the first super admin signed in and created a team.

For local development, use [`cold-start.md`](cold-start.md) instead.

## 1. What runs

`docker-compose.yml` defines four services. The project name is `${COMPOSE_PROJECT_NAME:-ai-studio}`.

| Service     | What it is                                                                                                     | Published on the host                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `app`       | The Next.js server (`node server.js`), built from the repo's `Dockerfile`                                      | `3000:3000` (all interfaces)                                                                                          |
| `scheduler` | The same image, running `node dist/scheduler/worker.js` (analytics retention only)                             | nothing                                                                                                               |
| `postgres`  | `postgres:16-alpine`, volume `postgres_data`                                                                   | `127.0.0.1:${POSTGRES_HOST_PORT:-5442}`                                                                               |
| `minio`     | `pgsty/silo`, pinned by digest (a maintained MinIO-compatible server), volumes `minio_data` and `minio_config` | console only, `127.0.0.1:${MINIO_CONSOLE_HOST_PORT:-9101}`; the S3 port 9000 is `expose`d to the compose network only |

`app` and `scheduler` read `.env` (`env_file: .env`). Postgres and MinIO take their credentials from the same file through compose variable substitution.

## 2. The `.env` for a server

Start from [`.env.example`](../.env.example). These values differ from local development:

| Variable                                                                | Server value                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                                    | A fresh random secret, for example 32 random bytes as hex. Production refuses to start with the placeholder.                                                                                                     |
| `TOKEN_ENCRYPTION_KEY`                                                  | Exactly 64 hex characters (32 bytes). It encrypts stored provider keys and tokens. Production refuses a missing, placeholder or wrong-length value. **Back it up: losing it makes every stored key unreadable.** |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`                                | The public `https://` origin users open, for example `https://studio.example.com`. better-auth checks the request origin, so sign-in fails if this does not match what the browser uses.                         |
| `DATABASE_URL`                                                          | `postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>`. Use the in-network host `postgres:5432`, not `localhost`.                                                                        |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`                     | Your own values. Use a strong password, and make sure `DATABASE_URL` matches them.                                                                                                                               |
| `MINIO_ENDPOINT`                                                        | `http://minio:9000`, the in-network address the app uses.                                                                                                                                                        |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`                                  | Your own values. They also become MinIO's root user and password. Production refuses to start with `minioadmin`.                                                                                                 |
| `MINIO_PUBLIC_ENDPOINT`                                                 | **Required on a server.** This is the browser-facing base URL of MinIO (see §3).                                                                                                                                 |
| `DESIGN_PROVIDER`                                                       | `claude-html` (API key) or `cli` (Claude Code CLI; the image ships a pinned CLI). See [`claude-account-setup.md`](claude-account-setup.md).                                                                      |
| `COMPOSE_PROJECT_NAME`, `POSTGRES_HOST_PORT`, `MINIO_CONSOLE_HOST_PORT` | Optional. The defaults are `ai-studio`, 5442 and 9101.                                                                                                                                                           |

Never set the `MOCK_*` variables on a server; they are test seams. Keep `.env` readable by the deploying user only (`chmod 600 .env`).

The app checks its environment before anything else, in `docker-entrypoint.sh` through `dist/scripts/env-preflight.js`. A value the app would reject stops the boot before any migration runs.

## 3. MinIO must be reachable from browsers

The app talks to MinIO inside the compose network. Browsers load logos, generated images and exports from MinIO directly. Public objects use plain URLs, and downloads use pre-signed URLs. Both kinds of URL are built from `MINIO_PUBLIC_ENDPOINT`, which falls back to `MINIO_ENDPOINT`. Without it, every image URL comes out as `http://minio:9000/...`, which no browser can resolve. The 2026-10-27 scratch deploy showed exactly that.

Choose one:

- **Reverse proxy (recommended).** Route a hostname such as `https://files.example.com` to the `minio` container's port 9000. Set `MINIO_PUBLIC_ENDPOINT=https://files.example.com`.
- **Host port.** `docker-compose.override.yml` publishes MinIO's S3 port on `${MINIO_HOST_PORT:-9100}` on all interfaces. `docker compose up` loads that file automatically when it sits next to `docker-compose.yml`. Set `MINIO_PUBLIC_ENDPOINT=http://<server>:9100`.

`MINIO_PUBLIC_ENDPOINT` must be exactly the base the browser uses: scheme, host and port. Pre-signed URLs are signed against it, so a mismatch makes downloads fail with a signature error. The app's renderer also allows this host, so post images load during rendering.

The `generated-images` and `brand-kits` buckets are made public-read on startup. `exported-designs` and `campaign-docs` stay private.

## 4. Put the app behind a reverse proxy

Compose publishes the app as `3000:3000` on every interface. Put a TLS-terminating reverse proxy in front of it, and either firewall port 3000 or change the mapping to `127.0.0.1:3000:3000` in your copy of the compose file. Over https, better-auth issues `__Secure-` cookies, and `src/proxy.ts` accepts both cookie names.

## 5. Build and start

```bash
git clone https://github.com/DDC-endpoint/ai-studio.git
cd ai-studio
git checkout main
# write .env (section 2), then:
docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD)
docker compose up -d
```

`GIT_SHA` is optional. When it is set, `/api/health` reports the commit (`{"ok":true,"commit":"<sha>"}`); without it, the commit is `"unknown"`.

**Migrations run on boot.** `docker-entrypoint.sh` runs the env preflight, then `prisma migrate deploy`, then the service's command. `app` and `scheduler` both boot through it. Postgres's advisory lock serializes them, so one applies the migrations and the other finds none pending. A failed migration stops the container (`set -e`). For an emergency boot, `SKIP_MIGRATIONS=1` skips the migrate step; the env preflight still runs.

The system starts empty. There is no data import, and since change 016 the migrations create no team.

## 6. Create the first super admin

Accounts are created by a super admin only. There is no public sign-up: since change 034, `/api/auth` answers 404 to every path except sign-in, sign-out, change-password and get-session. The first super admin therefore comes from `scripts/seed-admin.mjs`.

The image does not ship `scripts/`, so run it from a checkout on the server, with Node 22 or later. Point it at the published Postgres port on the host:

```bash
npm ci
npx prisma generate
DATABASE_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@127.0.0.1:5442/<POSTGRES_DB>" \
BETTER_AUTH_SECRET="<the same secret as in .env>" \
SEED_ADMIN_PASSWORD="<a password you choose>" \
node scripts/seed-admin.mjs
```

This creates the super admin `adminBTG`. Without `SEED_ADMIN_PASSWORD`, the script generates a password and prints it once. Change the password after the first sign-in.

Do not run `npm run db:seed` on a server. It also seeds the demo brand kits, and it reads `.env`, whose `DATABASE_URL` names the in-network host `postgres`, which is unreachable from the host.

Then sign in at `BETTER_AUTH_URL`:

1. Create the first team at `/admin/teams`.
2. Create the other accounts at `/admin/users`, and add them to the team.
3. Connect Claude at `/settings` (per user) or `/team` (the team's shared token or key). See [`claude-account-setup.md`](claude-account-setup.md).

## 7. Smoke check

- `curl https://<app>/api/health` returns 200 `{"ok":true,"commit":...}`.
- `/login` loads, and `/` redirects to it when signed out.
- `docker compose logs app scheduler` shows `[preflight] environment ok` and `[entrypoint] migrations up to date` for both services; the second one to boot also logs `No pending migrations to apply`. The scheduler logs `[scheduler] starting`.
- The super admin signs in, creates a team, and creates a post. Its image loads in the browser from `MINIO_PUBLIC_ENDPOINT`.
- An anonymous `POST /api/auth/sign-up/email` answers 404.
- `/admin/insights` shows the retention worker as running (no "offline" Health line).

## 8. Upgrades and backups

- **Upgrade:** `git pull`, `docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD)`, `docker compose up -d`. Pending migrations apply on boot.
- **Back up** the `postgres_data` and `minio_data` volumes and the `.env` file (above all `TOKEN_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`).
- `docker compose down -v` deletes the volumes and everything in them.

## 9. Upgrading to the build without scheduling and publishing (change 037)

Migration `20261031120000_remove_scheduling_publishing` drops publishing, scheduling and the generation queue. It is fail-closed: it refuses to run while any `Post`, `ChannelToken` or `ScheduledGeneration` row exists, or any draft is `PUBLISHED`. A fresh deploy has none of these and needs no step. A database that ran an older build needs the sequence below, from a checkout with Node 22 or later. The one-way removal is accepted; the tag `pre-037-publishing` is the last commit that publishes.

1. Dry run: `DATABASE_URL=... node scripts/clear-publishing-data.mjs`. It prints the row counts and the connected channel accounts, and exits 3 if any rows exist.
2. Delete the rows: run the same command with `--yes`.
3. Apply the migration: `npm run db:migrate` (on a server, `docker compose up -d` applies it on boot).
4. If the migration ran first and its precondition stopped it, mark it rolled back, then do steps 1 to 3: `npx prisma migrate resolve --rolled-back 20261031120000_remove_scheduling_publishing`.
5. Revoke the Instagram and LinkedIn app access by hand, in each provider's app settings. Dropping a stored token does not revoke the grant.

The `scheduler` container keeps its name and now runs only the analytics retention loop.

## 10. Upgrading to the build with projects instead of campaigns (change 038)

Migration `20261101130000_drop_campaigns` drops `Campaign`, `CampaignDocument`, `CampaignBriefing`, `ProjectCampaign` and `Brief.campaignId`. It is fail-closed: a `DO` precondition refuses to run while any row exists in those tables or any post still names a campaign (`038 drop_campaigns refused: ...`). The additive migration `20261101120000_project_inputs` ran before it and moved the briefing, documents and defaults onto projects. A fresh deploy has no campaigns and needs no step. A database that ran an older build needs the sequence below, from a checkout with Node 22 or later.

**Posts made before 038 become visible to the whole team.** Every member now sees every post; only the author and team admins edit, refine, regenerate, change the kit of or delete one.

1. Back up first: `pg_dump` the database.
2. Dry run: `DATABASE_URL=... node scripts/clear-campaign-data.mjs`. It prints the row counts and the number of posts that become team-visible, and exits 3 if any rows exist (2 without an explicit `DATABASE_URL`).
3. Delete the rows: run the same command with `--yes` (one transaction).
4. Apply the migration: `npm run db:migrate` (on a server, `docker compose up -d` applies it on boot).
5. If the migration ran first and its precondition stopped it, mark it rolled back, then do steps 2 to 4: `npx prisma migrate resolve --rolled-back 20261101130000_drop_campaigns`.
6. Sweep the campaign document objects from `campaign-docs`: `DATABASE_URL=... MINIO_ENDPOINT=... MINIO_ACCESS_KEY=... MINIO_SECRET_KEY=... MINIO_BUCKET_DOCS=campaign-docs node scripts/sweep-campaign-documents.mjs` (dry run; it needs all five variables, with real MinIO keys, never `minioadmin`). Exit 3 means keys would be removed; run it again with `--yes`. Exit 4 means the drop migration has not finished, so do step 4 first. It keeps `brandkits/`, `screenshots/` and `projects/`.

The bucket keeps its name `campaign-docs`. The down scripts are `prisma/rollback/038-project-inputs.down.sql` and `prisma/rollback/038-drop-campaigns.down.sql`; both restore the schema only, never data.
