# Proposal: Deploy-day docs and the Aloys carry-over

**Created:** 2026-11-24
**Status:** 🟡 Draft

## Problem

The user hosts the app on their own VPS today (2026-11-24). `docs/deploy.md` was last checked by the fresh deploy of 2026-10-27, and changes 036 to 040 have landed since. Known gaps:

- It says "All 46 migrations applied". There are now 52.
- §6 makes `adminBTG` the first super admin. The user's account is `ddc`.
- §3 lists the buckets as `exported-designs` and `campaign-docs`, and speaks of "exports". 037 replaced Export with Download, and `campaign-docs` now holds project documents.
- §5 and §8 say "the system starts empty, there is no data import". The user now wants their local data on the server (below).
- The title and intro still say "bistec-studio".

`.env.example` gained no variable since PR #1 (`4cd1f94f`); its diff is comments only. Deploy config (`docker-compose*.yml`, `Dockerfile`, `docker-entrypoint.sh`) is unchanged since PR #1.

**The carry-over.** The user wants the Aloys team's 2 posts, with their full history, on the hosted server. This overrides the 2026-10-13 "fresh start, no import" decision, for this deploy only (user, 2026-11-24).

The local `ai_studio` database holds exactly the data to carry: one user (`ddc`, super admin), the teams `Aloys` (2 posts, 6 revisions, 4 captions, 2 kits, 4 templates) and `ddc` (empty), 34 analytics events, 1 `UserClaudeToken` and 1 `UserOpenAiKey`. A plain `pg_dump` is not enough, for three reasons:

1. **Stored URLs name the local MinIO.** Seven columns hold absolute `http://localhost:9100/...` URLs: `Draft.imageUrl` (2), `Draft.htmlContent` (2), `DraftRevision.htmlSnapshot` (6), `DraftRevision.rejection` (1), `BrandKit.logoUrl` (2), `BrandKitArtifact.url` (2) and `Brief.briefImages` (1). On the server they must name `MINIO_PUBLIC_ENDPOINT`, or every image and every re-render breaks.
2. **The objects live in MinIO, not Postgres.** The `generated-images`, `brand-kits`, `exported-designs` and `campaign-docs` buckets must be copied too. Local MinIO is shared with E2E, so it also holds test leftovers.
3. **Two rows are encrypted with the local `TOKEN_ENCRYPTION_KEY`.** The server must reuse that key, or the rows must be deleted and the keys connected again.

## Proposed Solution

One docs change, plus one small script only if the plan shows the URL rewrite cannot be done safely in SQL.

1. **Refresh `docs/deploy.md`** for a deploy of `main` at today's head:
   - Migration count, the first super admin, bucket names and Download wording.
   - A short "what changed since the last checked deploy" line naming 036 to 040 and stating that none adds an env var or an operator step on a fresh database.
   - Fix the "starts empty" lines: empty is the default, and the new section is the exception.
2. **Add a new section, "Carrying data from a local install"**, in two parts.
   - **On the local machine:**
     - Stop the dev server.
     - Take `pg_dump -Fc` of `ai_studio`.
     - Mirror the four buckets, keeping only the objects the database references, so E2E leftovers stay behind.
   - **On the VPS:**
     - Start Postgres and MinIO only.
     - `pg_restore` into the empty database before the `app` container first boots. The dump is already at head, so `migrate deploy` finds nothing pending.
     - Rewrite `http://localhost:9100` to `MINIO_PUBLIC_ENDPOINT` in the seven columns, in one transaction, with a count query before and after.
     - Delete `Session` rows.
     - Decide on the two encrypted rows: reuse the local `TOKEN_ENCRYPTION_KEY`, or delete them.
     - Load the objects, then start `app` and `scheduler`.
     - Smoke-check: sign in as `ddc`, open both posts, and confirm images, revisions and captions load.
   - The local password for `ddc` carries over. Password hashes do not depend on `BETTER_AUTH_SECRET`, so the server can use a fresh secret.
   - The section replaces §6's `seed-admin.mjs` step for this deploy.
3. **Rehearse the procedure end to end** on a scratch compose stack on this machine before the user runs it on the VPS. The scratch stack uses its own project name and ports, never `ai_studio` or `ai_studio_test`. The rehearsal uses a non-localhost `MINIO_PUBLIC_ENDPOINT` so the rewrite is real.

## Scope

### In Scope

- `docs/deploy.md`: the refresh and the new carry-over section.
- One line each in `CLAUDE.md` and the `fresh-start-no-import` memory, recording that the user overrode "no import" for the Aloys carry-over on 2026-11-24.
- The rehearsal on a scratch stack. Its result is recorded in the verify report, not in the repo.
- A script under `scripts/`, **only if** the plan finds that SQL `replace()` is unsafe for the HTML and JSON columns. If added, it has a dry run and `--yes`, and refuses to run without an explicit `DATABASE_URL`, like the other operator scripts.

### Out of Scope

- Running anything on the VPS. The user runs the procedure; this change writes it and rehearses it.
- A deploy workflow or CI deploy. It is still "written later".
- A general import feature, or a carry-over for any team other than the local `Aloys` and `ddc`.
- The F2 items already documented by 035 (proxy for MinIO, first-admin bootstrap, port binding), except where they now read wrong.
- F3 hardening.
- `cold-start.md`, unless a line there now contradicts `deploy.md`.

## Impact

- **Size:** bounded. This alters an existing doc and an existing operator flow; no new subsystem or interface.
- **Files affected:** 2 to 4 (estimated): `docs/deploy.md`, `CLAUDE.md`, a memory file, and maybe one script.
- **Complexity:** small to medium. The rehearsal is most of the work.
- **Risk:** medium. A wrong rewrite or a missing object breaks images on the server. The rehearsal and the before-and-after counts are the guard. The local database is only read (`pg_dump`). Nothing writes to `ai_studio`.

## Open Questions

1. **The encrypted rows.** Reuse the local `TOKEN_ENCRYPTION_KEY` on the VPS so the connected keys keep working? Or delete the 2 rows and connect the keys again on the server? Reusing it means the server's master key is the one already sitting in a dev `.env`. Recommendation: delete the rows and use a fresh key.
2. **The empty `ddc` team.** Carry it, or delete it after the restore? Recommendation: carry it, since it costs nothing.
3. **The 34 analytics events.** Keep them, or truncate `AnalyticsEvent` and `AnalyticsDrop` so Insights starts clean on the server? Recommendation: keep them, since they describe the real posts.
4. **`MINIO_PUBLIC_ENDPOINT`.** What will it be on the VPS: a proxied hostname such as `https://files.<domain>`, or `http://<ip>:9100`? The rewrite target is that exact value. The doc can leave it as a placeholder if the user does not want to say.

## Decisions (user, 2026-11-24)

- Approved as bounded. No party panel (deploy is today; docs change).
- The super admin on the server is `ddc`, carried over from the local database.
- Q1: delete the `UserClaudeToken` and `UserOpenAiKey` rows after the restore, and use a fresh `TOKEN_ENCRYPTION_KEY` on the server. The keys are connected again on the server.
- Q2: carry the empty `ddc` team.
- Q3: keep the analytics events.
- Q4: not given. The doc uses a placeholder `<MINIO_PUBLIC_ENDPOINT>`.
