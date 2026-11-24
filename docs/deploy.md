# Deploying ai-studio on your own server

This guide covers a self-hosted deploy with the repo's own `docker-compose.yml`. **No deploy workflow exists yet.** CI (`.github/workflows/e2e.yml`) only runs checks, and it publishes and deploys nothing. A deploy workflow will be written later. Until then, a deploy is the manual steps below.

The steps were checked on 2026-10-27 by a fresh deploy from zero during the pre-PR review of `v2` against `main`. It used the real compose file on an empty stack. All 46 migrations applied then, there was no schema drift, `/api/health` returned 200, and the first super admin signed in and created a team. The repo now has 52 migrations.

Changes 036 to 040 add no env var and no operator step on a fresh database. The operator steps in §10 to §12 apply only to a database that ran an older build.

There are two ways to start a server. **Empty** is the default: follow §5 to §7. **Carried over from a local install** copies a local database and its buckets to the server: follow §5 only up to the `.env`, then §9.

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

The app talks to MinIO inside the compose network. Browsers load logos and generated images from MinIO directly. Public objects use plain URLs, and downloads use pre-signed URLs. Both kinds of URL are built from `MINIO_PUBLIC_ENDPOINT`, which falls back to `MINIO_ENDPOINT`. Without it, every image URL comes out as `http://minio:9000/...`, which no browser can resolve. The 2026-10-27 scratch deploy showed exactly that.

Choose one:

- **Reverse proxy (recommended).** Route a hostname such as `https://files.example.com` to the `minio` container's port 9000. Set `MINIO_PUBLIC_ENDPOINT=https://files.example.com`.
- **Host port.** `docker-compose.override.yml` publishes MinIO's S3 port on `${MINIO_HOST_PORT:-9100}` on all interfaces. `docker compose up` loads that file automatically when it sits next to `docker-compose.yml`. Set `MINIO_PUBLIC_ENDPOINT=http://<server>:9100`.

`MINIO_PUBLIC_ENDPOINT` must be exactly the base the browser uses: scheme, host and port. Pre-signed URLs are signed against it, so a mismatch makes downloads fail with a signature error. The app's renderer also allows this host, so post images load during rendering.

The app uses four buckets. It creates them, and sets the public-read policy on the two public ones, on its first upload (`initBuckets()` in `src/lib/storage/minio.ts`), not at startup. A server that received its objects by §9 must set that policy itself (§9.2 step 6).

| Bucket             | Access      | Holds                                                                             |
| ------------------ | ----------- | --------------------------------------------------------------------------------- |
| `generated-images` | public-read | Images the model generated for posts                                              |
| `brand-kits`       | public-read | Kit logos and other kit assets                                                    |
| `exported-designs` | private     | Rendered PNGs, which Download serves through pre-signed URLs                      |
| `campaign-docs`    | private     | Project and kit documents and screenshots. It keeps its old name from before 038. |

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

By default the system starts empty, and since change 016 the migrations create no team. To start from a local install's data instead, use §9 and skip §6.

## 6. Create the first super admin

This is the empty path. A server carried over from a local install skips this section: it has no seeded account, and its super admin is the one carried over (§9).

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
- A logical backup uses the same tools as §9: `docker compose exec -T postgres pg_dump -Fc -U <POSTGRES_USER> <POSTGRES_DB> > ai_studio.dump`, and `mc mirror` for the buckets. `pg_restore` and `mc mirror` bring them back.

## 9. Carrying data from a local install

This section replaces §6 for a server that starts from a local install. It copies the whole local database (users including the super admin, teams, kits, templates, projects, posts with their revisions and captions, and analytics) and all four buckets. It overrides the default empty start, and it is for a server that has never booted the app.

The local commands below are for Git Bash on Windows with Docker Desktop, run from the repo root. Run `export MSYS_NO_PATHCONV=1` first, because `docker compose cp` and `exec` take container paths. The server commands are for bash on Linux with Docker Compose v2. The server needs nothing beyond the repo, Docker and the transferred files.

Placeholders: `<POSTGRES_USER>`, `<POSTGRES_DB>`, `<MINIO_ACCESS_KEY>`, `<MINIO_SECRET_KEY>` and `<MINIO_PUBLIC_ENDPOINT>` are the server's `.env` values, except where a local step says "local". `<server>` is the server's address.

### 9.1 On the local machine

The local database and MinIO are only read.

1. Stop the dev server, so that nothing writes during the dump.
2. Dump the database:

   ```bash
   export MSYS_NO_PATHCONV=1
   docker compose exec -T postgres pg_dump -Fc -U <POSTGRES_USER> <POSTGRES_DB> > ai_studio.dump
   ```

   Use the local `.env` values here.

3. Mirror the four buckets with the MinIO container's own `mc` (the `pgsty/silo` image ships it), then copy them to the host:

   ```bash
   docker compose exec -T minio mc alias set src http://localhost:9000 <MINIO_ACCESS_KEY> <MINIO_SECRET_KEY>
   for b in generated-images brand-kits exported-designs campaign-docs; do
     docker compose exec -T minio mc mirror src/$b /tmp/carry/$b
   done
   docker compose cp minio:/tmp/carry ./carry-objects
   docker compose exec -T minio rm -rf /tmp/carry
   docker compose exec -T minio mc alias rm src
   ```

   Use the local MinIO keys here. The copy is about 100 MB. It includes any E2E test leftovers, because local dev and E2E share one MinIO. No row references them, and they are harmless.

4. Transfer `ai_studio.dump` and `carry-objects/` to the server, for example `scp -r ai_studio.dump carry-objects <user>@<server>:~/`.

### 9.2 On the server

Do these steps in this order.

1. Clone `main` and write `.env` as in §2, with a fresh `BETTER_AUTH_SECRET` and a fresh `TOKEN_ENCRYPTION_KEY`. Do not reuse the local ones.

   ```bash
   git clone https://github.com/DDC-endpoint/ai-studio.git
   cd ai-studio
   git checkout main
   ```

2. Start Postgres and MinIO only:

   ```bash
   docker compose up -d postgres minio
   ```

   **Do not start `app` or `scheduler` yet.** If they already booted, they ran every migration on the empty database and the restore would conflict. Run `docker compose down -v` first and start again. That command deletes the volumes and everything in them.

3. Wait until Postgres is ready:

   ```bash
   until docker compose exec -T postgres pg_isready -U <POSTGRES_USER> -d <POSTGRES_DB>; do sleep 2; done
   ```

4. Restore the dump into the empty database. `--no-owner --no-privileges` makes the objects belong to the server's `<POSTGRES_USER>`.

   ```bash
   docker compose exec -T postgres pg_restore --no-owner --no-privileges -U <POSTGRES_USER> -d <POSTGRES_DB> < ~/ai_studio.dump
   ```

5. Run one transaction that rewrites the stored URLs and clears what the server cannot use:

   ```bash
   docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U <POSTGRES_USER> -d <POSTGRES_DB> <<'SQL'
   BEGIN;

   SELECT 'before' AS stage,
     (SELECT count(*) FROM "Draft" WHERE "imageUrl" LIKE '%localhost:9100%') AS draft_image_url,
     (SELECT count(*) FROM "Draft" WHERE "htmlContent" LIKE '%localhost:9100%') AS draft_html,
     (SELECT count(*) FROM "DraftRevision" WHERE "htmlSnapshot" LIKE '%localhost:9100%') AS revision_html,
     (SELECT count(*) FROM "DraftRevision" WHERE "rejection"::text LIKE '%localhost:9100%') AS revision_rejection,
     (SELECT count(*) FROM "BrandKit" WHERE "logoUrl" LIKE '%localhost:9100%') AS kit_logo,
     (SELECT count(*) FROM "BrandKitArtifact" WHERE "url" LIKE '%localhost:9100%') AS kit_artifact,
     (SELECT count(*) FROM "Brief" WHERE "briefImages"::text LIKE '%localhost:9100%') AS brief_images;

   UPDATE "Draft" SET "imageUrl" = replace("imageUrl", 'http://localhost:9100', '<MINIO_PUBLIC_ENDPOINT>')
     WHERE "imageUrl" LIKE '%localhost:9100%';
   UPDATE "Draft" SET "htmlContent" = replace("htmlContent", 'http://localhost:9100', '<MINIO_PUBLIC_ENDPOINT>')
     WHERE "htmlContent" LIKE '%localhost:9100%';
   UPDATE "DraftRevision" SET "htmlSnapshot" = replace("htmlSnapshot", 'http://localhost:9100', '<MINIO_PUBLIC_ENDPOINT>')
     WHERE "htmlSnapshot" LIKE '%localhost:9100%';
   UPDATE "DraftRevision" SET "rejection" = replace("rejection"::text, 'http://localhost:9100', '<MINIO_PUBLIC_ENDPOINT>')::jsonb
     WHERE "rejection"::text LIKE '%localhost:9100%';
   UPDATE "BrandKit" SET "logoUrl" = replace("logoUrl", 'http://localhost:9100', '<MINIO_PUBLIC_ENDPOINT>')
     WHERE "logoUrl" LIKE '%localhost:9100%';
   UPDATE "BrandKitArtifact" SET "url" = replace("url", 'http://localhost:9100', '<MINIO_PUBLIC_ENDPOINT>')
     WHERE "url" LIKE '%localhost:9100%';
   UPDATE "Brief" SET "briefImages" = replace("briefImages"::text, 'http://localhost:9100', '<MINIO_PUBLIC_ENDPOINT>')::jsonb
     WHERE "briefImages"::text LIKE '%localhost:9100%';

   DELETE FROM "Session";
   DELETE FROM "UserClaudeToken";
   DELETE FROM "UserOpenAiKey";

   SELECT 'after' AS stage,
     (SELECT count(*) FROM "Draft" WHERE "imageUrl" LIKE '%localhost:9100%')
     + (SELECT count(*) FROM "Draft" WHERE "htmlContent" LIKE '%localhost:9100%')
     + (SELECT count(*) FROM "DraftRevision" WHERE "htmlSnapshot" LIKE '%localhost:9100%')
     + (SELECT count(*) FROM "DraftRevision" WHERE "rejection"::text LIKE '%localhost:9100%')
     + (SELECT count(*) FROM "BrandKit" WHERE "logoUrl" LIKE '%localhost:9100%')
     + (SELECT count(*) FROM "BrandKitArtifact" WHERE "url" LIKE '%localhost:9100%')
     + (SELECT count(*) FROM "Brief" WHERE "briefImages"::text LIKE '%localhost:9100%') AS remaining;

   DO $$
   BEGIN
     IF (SELECT count(*) FROM "Draft" WHERE "imageUrl" LIKE '%localhost:9100%' OR "htmlContent" LIKE '%localhost:9100%') > 0
       OR (SELECT count(*) FROM "DraftRevision" WHERE "htmlSnapshot" LIKE '%localhost:9100%' OR "rejection"::text LIKE '%localhost:9100%') > 0
       OR (SELECT count(*) FROM "BrandKit" WHERE "logoUrl" LIKE '%localhost:9100%') > 0
       OR (SELECT count(*) FROM "BrandKitArtifact" WHERE "url" LIKE '%localhost:9100%') > 0
       OR (SELECT count(*) FROM "Brief" WHERE "briefImages"::text LIKE '%localhost:9100%') > 0
     THEN
       RAISE EXCEPTION 'local URLs remain after the rewrite';
     END IF;
   END $$;

   COMMIT;
   SQL
   ```

   - Replace `<MINIO_PUBLIC_ENDPOINT>` with exactly the `.env` value: scheme, host and port, **no trailing slash**. The app joins paths onto the base without a trailing slash.
   - The "before" row shows how many rows held a local URL. The "after" row must show `remaining` as 0. If any local URL remains, the `DO` block raises an error, `ON_ERROR_STOP` ends the session, and nothing is committed. Any other SQL error also leaves nothing committed.
   - The two jsonb columns go through text and back. The URL is a fixed literal with no JSON-special characters, so the JSON survives.
   - `Draft.exportUrl` holds a bucket key, not a URL, so it needs no rewrite.
   - **Why the key tables are deleted.** `UserClaudeToken` and `UserOpenAiKey` are encrypted with the local `TOKEN_ENCRYPTION_KEY`. The server uses a fresh key and cannot read them. Each user connects their keys again at `/settings`, and a team admin at `/team`.
   - **Why sessions are deleted.** A session from the local install means nothing on the server. Everyone signs in again.

6. Load the objects into the server's MinIO, then make the two public buckets public-read:

   ```bash
   docker compose cp ~/carry-objects minio:/tmp/carry
   docker compose exec -T minio mc alias set dst http://localhost:9000 <MINIO_ACCESS_KEY> <MINIO_SECRET_KEY>
   for b in generated-images brand-kits exported-designs campaign-docs; do
     docker compose exec -T minio mc mb --ignore-existing dst/$b
     docker compose exec -T minio mc mirror /tmp/carry/$b dst/$b
   done
   docker compose exec -T minio mc anonymous set download dst/generated-images
   docker compose exec -T minio mc anonymous set download dst/brand-kits
   docker compose exec -T minio rm -rf /tmp/carry
   docker compose exec -T minio mc alias rm dst
   ```

   - `mc mb --ignore-existing` creates the buckets, because the app has not made them yet.
   - **The `mc anonymous set download` lines are required.** The app sets the public-read policy only on its first upload, so without them every kit logo and generated image answers 403 until someone creates a post. `exported-designs` and `campaign-docs` stay private.
   - `mc alias rm dst` removes the stored keys from the container's `mc` config.

7. Build and start the whole stack:

   ```bash
   docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD)
   docker compose up -d
   ```

   The dump is already at head, so `prisma migrate deploy` finds nothing pending. Deploy the same commit as the local install, or a later one (a later commit applies its migrations on boot).

### 9.3 Smoke check after the import

Run §7, then check:

- The carried super admin signs in with their local password. Password hashes do not depend on `BETTER_AUTH_SECRET`.
- The carried posts show their image, revisions and captions, in the library and on the post page.
- A Download returns a PNG.
- Kit logos load from `<MINIO_PUBLIC_ENDPOINT>`.
- `/settings` shows no connected key. Connect Claude there (per user) or at `/team` (the team's token or key). See [`claude-account-setup.md`](claude-account-setup.md).

The public-read buckets (`generated-images` and `brand-kits`) now also hold the E2E leftover test images, readable by anyone who guesses a key. They are test images. You can sweep them later; this is optional.

## 10. Upgrading to the build without scheduling and publishing (change 037)

Migration `20261031120000_remove_scheduling_publishing` drops publishing, scheduling and the generation queue. It is fail-closed: it refuses to run while any `Post`, `ChannelToken` or `ScheduledGeneration` row exists, or any draft is `PUBLISHED`. A fresh deploy has none of these and needs no step. A database that ran an older build needs the sequence below, from a checkout with Node 22 or later. The one-way removal is accepted; the tag `pre-037-publishing` is the last commit that publishes.

1. Dry run: `DATABASE_URL=... node scripts/clear-publishing-data.mjs`. It prints the row counts and the connected channel accounts, and exits 3 if any rows exist.
2. Delete the rows: run the same command with `--yes`.
3. Apply the migration: `npm run db:migrate` (on a server, `docker compose up -d` applies it on boot).
4. If the migration ran first and its precondition stopped it, mark it rolled back, then do steps 1 to 3: `npx prisma migrate resolve --rolled-back 20261031120000_remove_scheduling_publishing`.
5. Revoke the Instagram and LinkedIn app access by hand, in each provider's app settings. Dropping a stored token does not revoke the grant.

The `scheduler` container keeps its name and now runs only the analytics retention loop.

## 11. Upgrading to the build with projects instead of campaigns (change 038)

Migration `20261101130000_drop_campaigns` drops `Campaign`, `CampaignDocument`, `CampaignBriefing`, `ProjectCampaign` and `Brief.campaignId`. It is fail-closed: a `DO` precondition refuses to run while any row exists in those tables or any post still names a campaign (`038 drop_campaigns refused: ...`). The additive migration `20261101120000_project_inputs` ran before it and moved the briefing, documents and defaults onto projects. A fresh deploy has no campaigns and needs no step. A database that ran an older build needs the sequence below, from a checkout with Node 22 or later.

**Posts made before 038 become visible to the whole team.** Every member now sees every post; only the author and team admins edit, refine, regenerate, change the kit of or delete one.

1. Back up first: `pg_dump` the database.
2. Dry run: `DATABASE_URL=... node scripts/clear-campaign-data.mjs`. It prints the row counts and the number of posts that become team-visible, and exits 3 if any rows exist (2 without an explicit `DATABASE_URL`).
3. Delete the rows: run the same command with `--yes` (one transaction).
4. Apply the migration: `npm run db:migrate` (on a server, `docker compose up -d` applies it on boot).
5. If the migration ran first and its precondition stopped it, mark it rolled back, then do steps 2 to 4: `npx prisma migrate resolve --rolled-back 20261101130000_drop_campaigns`.
6. Sweep the campaign document objects from `campaign-docs`: `DATABASE_URL=... MINIO_ENDPOINT=... MINIO_ACCESS_KEY=... MINIO_SECRET_KEY=... MINIO_BUCKET_DOCS=campaign-docs node scripts/sweep-campaign-documents.mjs` (dry run; it needs all five variables, with real MinIO keys, never `minioadmin`). Exit 3 means keys would be removed; run it again with `--yes`. Exit 4 means the drop migration has not finished, so do step 4 first. It keeps `brandkits/`, `screenshots/` and `projects/`.

The bucket keeps its name `campaign-docs`. The down scripts are `prisma/rollback/038-project-inputs.down.sql` and `prisma/rollback/038-drop-campaigns.down.sql`; both restore the schema only, never data.

## 12. Upgrading to the build with general and curated captions (change 039)

Three migrations ship with 039: `20261102120000_caption_kind` (the `CaptionKind` enum; `DraftCaption` gains `kind`, `deletedAt`, `previous` and `generalHash`, and `channel` may be null), `20261102130000_channel_facebook` (adds `FACEBOOK` to `Channel`) and `20261102140000_kit_website` (adds `BrandKit.website`). All three are additive. **No operator step is needed:** `docker compose up -d` applies them on boot, and `npm run db:migrate` applies them locally. Existing posts keep their Instagram and LinkedIn captions as curated captions. They have no general caption until a member presses "Generate general caption". Existing kits have no website until a team admin adds one (the Facebook call to action has no link until then).

The down script is `prisma/rollback/039-general-and-curated-captions.down.sql`. It restores the schema and **deletes** every general caption, Facebook caption, deleted caption and kit website, so it refuses to run unless the session sets `app.allow_caption_loss = 'on'`. Take a `pg_dump` first. `FACEBOOK` stays in the `Channel` type, because Postgres cannot drop an enum value. The header of the script has the exact command.
