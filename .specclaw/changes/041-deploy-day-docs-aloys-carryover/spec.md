# Spec: Deploy-day docs and the Aloys carry-over

**Change:** 041-deploy-day-docs-aloys-carryover
**Created:** 2026-11-24
**Status:** 🟡 Draft

## Overview

`docs/deploy.md` must be correct for a deploy of `main` today. It must also carry the user's local data to the server: the `ddc` super admin, the `Aloys` team with its 2 posts and their history, and the empty `ddc` team. This is a docs change. It is proven by one rehearsal on a scratch stack on this machine. The proposal's decisions (2026-11-24) apply: `ddc` is the super admin; delete the encrypted key rows and use a fresh `TOKEN_ENCRYPTION_KEY`; carry the empty team; keep the analytics events; `MINIO_PUBLIC_ENDPOINT` is a placeholder.

Facts this spec rests on (measured 2026-11-24 on the local `ai_studio`):

- PR #2 is merged, so `origin/main` has the same tree as `v2` and holds all 52 migrations. The local database is at that head.
- Only one local URL form is stored: `http://localhost:9100`. It appears in seven columns: `Draft.imageUrl`, `Draft.htmlContent`, `DraftRevision.htmlSnapshot`, `DraftRevision.rejection` (jsonb), `BrandKit.logoUrl`, `BrandKitArtifact.url` and `Brief.briefImages` (jsonb). No `127.0.0.1`, `minio:9000` or other `:9100` form is stored.
- `Draft.exportUrl` holds a bucket key (`exports/...`), not a URL, so it needs no rewrite.
- The four buckets hold about 97 MB: `exported-designs` 72M, `generated-images` 15M, `brand-kits` 7.5M and `campaign-docs` 2.5M. The `pgsty/silo` image ships `mc`.
- `seed-admin.mjs` creates only `adminBTG`.

## Requirements

### Functional Requirements

- **FR-01 Refresh.** `docs/deploy.md` matches `main` today:
  - the migration count (52);
  - the app name "ai-studio" in the title and intro;
  - the bucket list (`generated-images`, `brand-kits`, `exported-designs`, and `campaign-docs`, which now holds project documents);
  - "download", not "export", for the user-facing feature.
    The doc states that changes 036 to 040 add no env var and no operator step on a fresh database.
- **FR-02 Two paths.** The doc names two ways to start a server:
  - **Empty:** the existing §5 to §7, with `seed-admin.mjs`, which creates `adminBTG`.
  - **Carried over from a local install:** the new section. Nothing is seeded, and the carried super admin, `ddc` in this deploy, signs in with their local password.
    The "starts empty, no import" lines say that empty is the default and point to the new section.
- **FR-03 Local export.** The new section's local steps:
  1. Stop the dev server.
  2. Take `pg_dump -Fc` of the local database.
  3. Mirror all four buckets out of the local MinIO with the container's `mc`, and copy them to the host.
  4. Transfer the dump and the bucket folder to the server.
     The doc says that the bucket copy includes E2E leftovers. They are unreferenced by any row and harmless. A later sweep is optional.
- **FR-04 Server import, in this order:**
  1. Clone `main` and write `.env` (§2) with a fresh `BETTER_AUTH_SECRET` and a fresh `TOKEN_ENCRYPTION_KEY`.
  2. `docker compose up -d postgres minio` only.
  3. `pg_restore --no-owner --no-privileges` into the empty database.
  4. Run one SQL transaction that:
     - counts the rows holding `http://localhost:9100` in the seven columns;
     - rewrites each column with `replace()`, casting the jsonb columns through text;
     - deletes every `Session` row and every `UserClaudeToken` and `UserOpenAiKey` row;
     - counts again and expects 0.
  5. Mirror the bucket folder into the server's MinIO with `mc`.
  6. `docker compose build` and `docker compose up -d`. `migrate deploy` finds nothing pending.
- **FR-05 Smoke check after import.** Run §7, plus:
  - `ddc` signs in;
  - both posts show their image, revisions and captions in the library and on the post page;
  - a Download returns a PNG;
  - the kit logos load from `MINIO_PUBLIC_ENDPOINT`;
  - `/settings` shows no connected key.
    The section then says to connect Claude at `/settings` or `/team`.
- **FR-06 Record the override.** `CLAUDE.md` and the `fresh-start-no-import` memory each gain one line: the user overrode "no import" for the local carry-over on 2026-11-24, for this deploy only.

### Non-Functional Requirements

- **NFR-01** The local `ai_studio` database and MinIO are only read: `pg_dump` and `mc mirror` from them, never writes.
- **NFR-02** No secret value appears in the doc, the verify report or a commit. Placeholders only.
- **NFR-03** The doc's commands run as written on a Linux server with Docker Compose v2. They need nothing on the server beyond the repo, Docker and the transferred files: no Node and no host `mc`.

## Acceptance Criteria

- [ ] **AC-01** `docs/deploy.md` says 52 migrations, names the app "ai-studio", lists the four buckets with their current roles, and has no "export" wording for the user feature. (FR-01)
- [ ] **AC-02** The doc has a carry-over section with the FR-03 and FR-04 steps in that order. The "starts empty" lines point to it. (FR-02, FR-03, FR-04)
- [ ] **AC-03** **Rehearsal.** A scratch compose stack runs the doc's server steps as written, from a dump and bucket copy of the local `ai_studio`. The stack uses its own project name and ports, never `ai_studio` or `ai_studio_test`, and a non-localhost `MINIO_PUBLIC_ENDPOINT`. Afterwards:
  - the rewrite count is 0;
  - `migrate status` is up to date;
  - `ddc` signs in;
  - both Aloys posts show their image, history and captions, with image URLs on the scratch endpoint;
  - a Download returns a PNG.
    The verify report records the exact commands, output and counts. (FR-04, FR-05)
- [ ] **AC-04** After the rehearsal, the local `ai_studio` row counts (users, teams, drafts, revisions, captions, kits, templates) and its `localhost:9100` count are the same as before it. (NFR-01)
- [ ] **AC-05** `CLAUDE.md` and the memory record the override. (FR-06)
- [ ] **AC-06** No secret value appears in the diff or the verify report. (NFR-02)

## Edge Cases

- **A dump taken while the dev server writes.** The section says to stop the dev server first.
- **A different `POSTGRES_USER` on the server.** `--no-owner --no-privileges` restores under the server's user.
- **The app booting before the restore.** It would run 52 migrations on the empty database, and `pg_restore` would then conflict. The doc says to start only `postgres minio` first. If the app already booted, recreate the volume (`docker compose down -v`) before restoring.
- **A `MINIO_PUBLIC_ENDPOINT` with a trailing slash.** The rewrite and the app both use the base without a trailing slash. The doc says so.
- **Public-read buckets.** `generated-images` and `brand-kits` become public-read on the app's start. Copied E2E leftovers in them are readable by anyone who guesses the key. They are test images, and the doc names the optional sweep.

## Dependencies

- PR #2 merged into `main` (done).
- Docker Desktop running locally for the rehearsal.

## Approach

One decision: plain SQL `replace()` in one transaction, not a script. The URL is a fixed literal with no JSON-special characters, so jsonb survives a text round trip. Buckets are copied whole, because picking the referenced keys means reading 9+ columns, and missing one breaks a post.

File map:

- `docs/deploy.md`: refresh and the new carry-over section.
- `CLAUDE.md`: one line on the override.
- Memory (outside the repo): `project_fresh_start_no_import.md`, one line.

The rehearsal leaves nothing in the repo. Its notes go in `verify-report.md`.

## Notes

- `seed-admin.mjs` keeps creating `adminBTG` for the empty path. Making it take a username is out of scope.
- The rehearsal runs the app in the production image (`docker compose build`), as the server will.
