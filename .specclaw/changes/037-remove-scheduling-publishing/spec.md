# Spec: Remove scheduled generation and publishing

**Change:** 037-remove-scheduling-publishing
**Created:** 2026-10-30
**Size:** architectural
**Status:** 🟡 Draft

## Overview

The app becomes: generate a post image, download it, copy a caption. This change removes every scheduling and publishing path: the campaign queue, the publish and generation worker loops, social channel tokens, `Post` rows, the HOLD rule, the publish dialogs and `publish_post`. A Download button replaces Export. The worker container keeps only the analytics retention loop.

The proposal (`proposal.md`) and its "Decisions after the party review" are the source of truth for scope. This spec settles the questions the proposal left to the plan. Change 038 (campaigns become projects) and change 039 (general and curated captions) build on this one. The last commit with publishing is tagged `pre-037-publishing` (`ea8e7f2e`).

## Decisions this plan makes

These close the proposal's Open Questions.

- **D1. Enum types are rebuilt, not left with dead values.**
  - `DraftStatus` loses `PUBLISHED` through a type rebuild (create the new type, cast the column, drop the old type, rename).
  - `PostStatus`, `PostGenerationAction` and `GenerationStatus` are dropped whole, since only `Post` and `ScheduledGeneration` use them.
  - `Channel` is unchanged; captions use it.
  - `AnalyticsSource` keeps its Postgres value `scheduler`. Existing event rows hold it, the event store is append-only and retention sweeps it in 180 days. The value is retired in code instead (D6).
- **D2. The migration fails closed. An operator script clears the data first.**
  - The migration's first statement checks for rows in `Post`, `ChannelToken` and `ScheduledGeneration`, and for drafts with status `PUBLISHED`. If any exist, it raises an exception naming each count, and nothing else runs.
  - The operator accepts the loss explicitly by running `scripts/clear-publishing-data.mjs`.
    - With no flag, it prints the counts and every connected channel account (team name and channel), then stops.
    - With `--yes`, it deletes the rows, remaps `PUBLISHED` drafts to `EXPORTED` with one `UPDATE`, and logs each count.
  - The script runs before the migration, uses raw SQL only, and refuses to run without an explicit `DATABASE_URL`, like `scripts/purge-analytics.mjs`.
  - The down script restores the schema only.
- **D3. `EXPORTED` stays and means "ready".** Generation and every design commit already set `EXPORTED` and write `exportUrl`. Renaming the value would touch every reader for no behaviour change. Only the word shown in the UI changes, from "Exported" to "Ready".
- **D4. Download.**
  - Route: `GET /api/drafts/[id]/download`. Function: `ensureCurrentExport` in `src/lib/drafts/download.ts`.
  - **Current** means `Draft.exportUrl` is not null and equals the `exportUrl` of the draft's current committed revision. The current revision is `currentRevisionNumber`; when that is null, it is the highest `revisionNumber`.
  - If the export is current, the stored PNG is streamed.
  - If it is not current, the route renders `htmlContent` exactly as Export did (`renderDraftHtml`, the composite placement included, `renderedText` left alone), uploads it to `BUCKET_EXPORTS`, and writes the key with a compare-and-set. The guard is: same `currentRevisionNumber`, same `exportUrl`, still `EXPORTED`, no `pendingAction`. Then it streams the PNG.
  - The response is `image/png` with `Content-Disposition: attachment`. The browser fetches it and saves it.
  - Storing is kept, so a re-download is cheap and refine history is unchanged.
  - `POST /api/generate/export` is removed. Download is its only replacement and the only writer of the export key outside the design commits.
- **D5. The `Channel` coverage requirement stays.**
  - `draft_action.settled` gains an optional `channel` (the Prisma `Channel` enum), set when Regenerate copy targets one caption. The field is additive, so the schemaVersion stays 1.
  - `analyticsCoverage.test.ts` keeps "every `Channel` value has a carrier". 039's `FACEBOOK` will therefore need a carrier.
- **D6. Retired analytics vocabulary is listed, not forgotten.**
  - `publish.settled` and `scheduled_generation.settled` leave `CATALOGUE`. Their names go into a new `RETIRED_EVENT_NAMES` list in the catalogue, which a name must never be reused from.
  - `scheduler` leaves every event's `source` list and goes into `RETIRED_SOURCES`.
  - `draft.headline_edited` drops `scheduledPending` and moves to schemaVersion 2. Queries that read it do not depend on the field.
  - The coverage test checks:
    - every live source has a carrier;
    - no retired name is in `CATALOGUE`;
    - no retired source is in any event's `source`.
- **D7. One new event, `draft.downloaded`.**
  - Its only emitter is the download route. Source `web`; outcomes `ok` and `failed`.
  - Payload: `rendered` (whether a render ran), `factsStatus`, `headlineState`, and on failure a `failure` from a fixed list (`render-failed`, `composite-not-placed`, `changed`, `not-ready`).
  - It carries no text.
- **D8. The ACP manifest goes to `2.0.0`, because `publish_post` is gone. 038 changes `generate_post`'s campaign input under this same major version.** MCP's server version goes to `2.0.0` too.
- **D9. The worker container keeps its name `scheduler`.** The compose service, the esbuild output `dist/scheduler/worker.js` and `src/scheduler/worker.ts` are unchanged, so the future deploy workflow sees no rename. The worker's header comment says it runs only retention and that the name is historical.
- **D10. The library filters by brand kit and post style.**
  - Post style is `Brief.postStyle`.
  - Brand kit is the brief's explicit kit or, failing that, its campaign's kit. This is the precedence chain without the project and system defaults.
  - 038 replaces the kit filter with the kit it snapshots on the draft at generation.
  - The library lists `EXPORTED` drafts only.
- **D11. "Posts this month"** counts the active team's drafts with status `EXPORTED` and `createdAt` within the current calendar month in UTC. It counts team-wide (by `teamId`), as the user decided, not through D6 draft visibility.
- **D12. Test seams.**
  - `scheduler-tick` and `generation-tick` are removed.
  - `worker-heartbeat` stays for the retention suite. Its loop is restricted to `retention`, and it keeps its gates: a 404 in production, a 404 without `MOCK_AI`, and admin only.
  - `MOCK_SOCIAL` and `MOCK_SOCIAL_FAIL` are removed from code, `src/lib/env.ts`, `.env.test`, `.env.example` and `e2e.yml`.
  - CI still runs the app in dev mode, because every remaining seam is a 404 in a production build.

## Requirements

### Functional Requirements

- **FR-01 (schema).**
  - Migration `20261031120000_remove_scheduling_publishing`:
    1. Runs the D2 precondition first.
    2. Drops `Post`, `ChannelToken` and `ScheduledGeneration`.
    3. Drops `PostStatus`, `PostGenerationAction` and `GenerationStatus`.
    4. Rebuilds `DraftStatus` without `PUBLISHED`.
    5. Deletes `WorkerHeartbeat` rows whose `loop` is not `retention`.
  - `schema.prisma` loses the three models, the three enums, the `PUBLISHED` value and every back-relation: `User.posts`, `User.scheduledGenerations`, `Campaign.scheduledGenerations`, `Brief.scheduledGenerations`, `Draft.posts`, `Draft.scheduledGenerations` and `BrandKitTemplate.scheduledGenerations`.
  - `WorkerHeartbeat` (the table) and `Brief.channels` stay.
  - A down script, `prisma/rollback/037-remove-scheduling-publishing.down.sql`, recreates the schema only, and its header says so.
- **FR-02 (operator script).** `scripts/clear-publishing-data.mjs` works as D2 describes. Its dry run lists connected channel accounts with a line telling the operator to revoke each app's access on Instagram and LinkedIn by hand, because dropping a token does not revoke the grant. Exit codes are:
  - 0: done, or nothing to clear;
  - 1: bad usage;
  - 2: no `DATABASE_URL`;
  - 3: rows found on a dry run.
- **FR-03 (worker).**
  - `src/scheduler/worker.ts` runs one loop, `retention`, through `runTick`.
  - The startup Claude-token check goes, because nothing in the worker calls Claude.
  - The Insights Health line keeps reading the `retention` heartbeat row through `retentionHealth` in `src/lib/analytics/queries.ts`. `OFFLINE_THRESHOLD_MS` moves there from `src/lib/scheduler/heartbeatStatus.ts`, which is deleted. `retention` is the only loop the code defines.
- **FR-04 (Download route).** `GET /api/drafts/[id]/download` (`withTeamAuth`) uses `canAccessContent`, as Export did, and returns 404 for a draft the caller cannot see. Its responses:
  - A draft that is not `EXPORTED`, or has no `htmlContent`: 409 `{ error, code: 'not-ready' }`.
  - A render failure: 422 `{ error, code: 'render-failed' | 'composite-not-placed' }`. Nothing is uploaded and nothing is written.
  - A lost compare-and-set: 409 `{ error, code: 'changed' }`. The uploaded object is deleted.
  - Success: 200 with the PNG. The filename is the topic as a slug (ASCII, at most 60 characters, falling back to `post`) plus the draft id.
  - Each outcome emits `draft.downloaded`.
- **FR-05 (draft page).**
  - The header has one primary Download button and no Export, Re-export or Publish.
  - Download is enabled when the draft is `EXPORTED` with `htmlContent` and no `pendingAction`. It shows a spinner while running and a toast naming the error on failure.
  - Under the button sits one muted line, which never blocks Download:
    - the headline line from `downloadLineFor(headlineState)` (today's `publishLineFor`, renamed and reworded for download), when that returns text;
    - otherwise, when `factsCheck` is `flagged`, "The facts check flagged values in this post." and the flag count.
  - The status chip says "Ready" for `EXPORTED`.
  - `PublishDialog` and its mount are removed.
- **FR-06 (library).**
  - `GET /api/library` takes `brandKitId` and `postStyle` (an unknown style key is 400). It drops `status` and lists `EXPORTED` drafts.
  - The page replaces the status filter with two selects:
    - "Brand kit": the team's kits plus "All kits".
    - "Post style": the active styles from `src/lib/postStyles` plus "All styles".
  - `PostCard` is replaced by `LibraryCard`, which has a thumbnail, topic, kit name, post style label, date and Open. It has no publish state, Publish button or history link.
  - `PublishHistoryDrawer` is removed.
- **FR-07 (dashboard).**
  - "Posts published" and "Active campaigns" are removed, and "Posts this month" (D11) is added.
  - "Published to …" activity rows are removed.
  - The recent-drafts card's chip says "Ready" for `EXPORTED`.
- **FR-08 (scheduling removed).**
  - Routes: `/api/campaigns/[id]/queue`, `…/queue/batch`, `…/queue/[gid]`, `…/queue/[gid]/rerun`, `/api/scheduler/status`, `/api/test/generation-tick`.
  - Libraries: `src/lib/campaign/queue.ts`, `src/lib/scheduler/generationRunner.ts`, `src/lib/scheduler/heldReason.ts`, `src/lib/scheduler/heartbeatStatus.ts`.
  - UI: `ScheduledQueueSection`, `QueueEntryModal` and the "Scheduler offline" banner.
  - The briefing assistant's auto-scheduling plan: the ` ```schedule ` fence, `extractSchedulePlan`, `normalisePlan`, the `schedulePlan` field of the chat response, the plan panel in `BriefingAssistantPanel` and the prompt text that asks for it. The briefing chat itself stays (038 keeps it).
  - `src/lib/models/budget.ts` drops the `GENERATION_LEASE_MS` limit and the "Scheduled generation" segments.
  - The post-style `Surface` drops `queue`; `UNATTENDED` is `mcp` and `acp`.
- **FR-09 (publishing removed).**
  - Routes: `/api/posts`, `/api/posts/[id]`, `/api/posts/[id]/publish`, `/api/team/channels`, `/api/team/channels/[channel]`, `/api/test/scheduler-tick`.
  - Libraries: `src/lib/social/*`, `src/lib/publish/*`, `src/lib/scheduler/jobRunner.ts`, `loadCaptionForPublish` (`src/lib/captions/store.ts`) and `postVisibilityWhere`.
  - UI: `PublishDialog`, `PublishHistoryDrawer`, `PostCard` and the `/team` "Social channels" section with its `ChannelRow`.
  - `api-types` loses `ChannelStatus`, `ChannelMap`, the post types, `ScheduledGeneration`, `PostGenerationAction` and `SchedulerStatus`.
  - Test hooks lose `shouldMockPublishFail`, the mock `platformId` helper and the `__FAIL_*__` publish sentinels.
- **FR-10 (draft lifecycle).**
  - No code reads or writes `PUBLISHED`. The caption, headline, inline-edit, apply-text, regenerate and retry gates test `EXPORTED` alone.
  - The draft `PATCH` no longer refuses edits on a published draft.
  - The admin `DELETE` no longer deletes `Post` rows.
  - The draft detail `GET` drops its post aggregate.
- **FR-11 (MCP and ACP).**
  - `publish_post` is removed from the MCP server, the ACP manifest and `POST /api/acp/run`. A call to it is answered as an unknown tool or capability, the way any other unknown name is.
  - The manifest is `2.0.0` (D8), and its description no longer says "publishing".
  - `generate_post` is unchanged.
- **FR-12 (analytics).**
  - D5, D6 and D7 as above.
  - Insights drops the post styles "Held" column and the held count in `queries.ts`. Old `scheduled_generation.settled` rows stay in the store, and nothing reads them.
- **FR-13 (test seams).** As D12.
- **FR-14 (wording).** Every user-facing reference to scheduled runs or publishing is removed or rewritten:
  - `CaptionRouteCard`, `ModelsCard` and the team Claude token copy. The token becomes "MCP/ACP and member fallback".
  - The `.env.example` comment.
  - The ACP description.
  - The wording guard (`uiWordingGuard.test.ts`) holds.
- **FR-15 (docs).**
  - `docs/social-publishing-setup.md` is removed.
  - These docs are updated: `CLAUDE.md` (the 023 scheduler health entry, the 027 HOLD rule, the 030 publish line, the 006 `scheduler` source and third loop, and the 037 state entry), `README.md`, `docs/deploy.md`, `docs/cold-start.md`, `docs/mcp-acp-guide.md` (no `publish_post`, manifest 2.0.0) and `docs/e2e-test-plan.md` (the removed and rewritten suites).
  - The operator steps for D2 go in `docs/deploy.md` and `docs/cold-start.md`.

### Non-Functional Requirements

- **NFR-01:** No real model call in any gate. The upgrade-path test and the clear script use raw SQL only.
- **NFR-02:** The UI token guard, the wording guard and `docs/ui-reference/DESIGN_SYSTEM.md` hold for every changed screen.
- **NFR-03:** No new env var. `MOCK_SOCIAL` and `MOCK_SOCIAL_FAIL` are removed.
- **NFR-04:** Each task leaves `tsc`, lint and the unit suite green, so it can be committed on its own. The full E2E mock suite is green at the end (`CLAUDE.md`: "The full mock suite stays green" is the proposal's own requirement).
- **NFR-05:** The fresh-deploy path still works: every migration in order on an empty database, then `prisma migrate diff` against `schema.prisma` exits 0.

## Acceptance Criteria

- **AC-01 (tables gone):** On a database migrated to head, `Post`, `ChannelToken` and `ScheduledGeneration` do not exist. The types `PostStatus`, `PostGenerationAction` and `GenerationStatus` do not exist. `DraftStatus` has exactly `IN_PROGRESS`, `EXPORTED` and `FAILED`. Checked by the upgrade-path test.
- **AC-02 (fail closed):** In `npm run test:upgrade`, a database at the migration before 037 that holds a `Post` row and a `PUBLISHED` draft fails to deploy 037. The error names the counts, and the rows and tables are unchanged afterwards. After `clear-publishing-data.mjs --yes`, 037 deploys, the draft is `EXPORTED`, and `prisma migrate diff` exits 0.
- **AC-03 (clear script):** A unit test of the script's pure planning function, or of the script run under a fake client, shows:
  - a dry run prints counts and accounts and exits 3 when rows exist;
  - `--yes` issues the deletes and the one remap;
  - a missing `DATABASE_URL` exits 2 before the client is imported.
- **AC-04 (routes gone):** E2E: `GET /api/posts`, `POST /api/posts`, `GET /api/team/channels`, `GET /api/scheduler/status`, `GET /api/campaigns/<id>/queue`, `POST /api/test/scheduler-tick`, `POST /api/test/generation-tick` and `POST /api/generate/export` each answer 404 or 405, never 2xx.
- **AC-05 (MCP/ACP):** A unit test shows the MCP tool list and the ACP manifest have no `publish_post`, and the manifest version is `2.0.0`. In E2E, `POST /api/acp/run` with `publish_post` is refused, with no 2xx.
- **AC-06 (Download, current):** E2E: on a generated draft, Download returns 200 `image/png` with an attachment `Content-Disposition`. The draft's `exportUrl` is unchanged and no render ran (`draft.downloaded` has `rendered: false`).
- **AC-07 (Download, not current):** A unit test of `ensureCurrentExport` with the draft's `exportUrl` cleared, or different from the current revision's, renders once, uploads, writes the key under the compare-and-set and returns the bytes. A second call does not render.
- **AC-08 (Download fails closed):** Unit tests:
  - a render that throws, and a `CompositePlacementError`: 422 with the named code; no upload; no draft write;
  - a lost compare-and-set: 409 `changed`; the uploaded object deleted;
  - a draft that is not `EXPORTED`: 409 `not-ready`.
- **AC-09 (Download UI):** E2E: the draft page shows Download and no Export, Re-export or Publish button. Clicking Download saves a `.png` file (a Playwright `download` event). A draft whose headline is stale shows the download line next to the button.
- **AC-10 (library):** E2E:
  - with two drafts on different kits and styles, each filter narrows the list to the matching draft;
  - "All" shows both;
  - no status filter, Publish button or history control exists.

  A unit test shows the route returns 400 on an unknown `postStyle`.

- **AC-11 (dashboard):** E2E: the dashboard shows "Posts this month", and the count goes up by one after a generation. It shows no "Posts published" or "Active campaigns". A unit test of the month bound covers the UTC month edges.
- **AC-12 (worker):** A unit test of the worker module shows it registers exactly one loop, `retention`. A grep-style unit guard shows no `src/` file imports `jobRunner`, `generationRunner`, `heldReason`, `src/lib/social` or `src/lib/publish`.
- **AC-13 (retention health):** The rewritten E2E suite (`retention-health.test.ts`, which replaces `scheduler-heartbeat.test.ts`) seeds the `retention` row through `worker-heartbeat`. It shows Insights reads "Retention running", "Retention stalled" and "Retention never ran" for a fresh row, an old row and no row. The seam refuses any loop other than `retention` with 400.
- **AC-14 (seam gates):** A unit test of `worker-heartbeat` shows a 404 when `NODE_ENV` is `production`, a 404 when `MOCK_AI` is unset, a 403 for a non-admin and a 200 for an admin.
- **AC-15 (analytics):** `analyticsCoverage.test.ts`, updated but not deleted, passes. It checks:
  - every `Channel` value has a carrier (`draft_action.settled.channel`);
  - every live source (`web`, `mcp`) has a carrier;
  - `RETIRED_EVENT_NAMES` holds `publish.settled` and `scheduled_generation.settled`, and neither is in `CATALOGUE`;
  - `scheduler` is in `RETIRED_SOURCES` and in no event's `source`;
  - `draft.headline_edited` is schemaVersion 2 without `scheduledPending`;
  - `draft.downloaded` has one emitter.
- **AC-16 (Insights):** E2E or unit: the post styles table has no "Held" column, and the Health line still shows retention.
- **AC-17 (end to end):** E2E: generate a post (Path A and Path B under `MOCK_AI`), refine it, Download it, and copy a caption. The copy uses the existing caption Copy control (`aria-label` "Copy Instagram caption" in `CaptionPanel.tsx`), with clipboard permission granted to the browser context. Every step succeeds.
- **AC-18 (fresh deploy):** CI's E2E job runs every migration on an empty database, and `test:upgrade` exits 0, which includes AC-02's `migrate diff`.
- **AC-19 (gates):** `tsc`, lint, the unit suite and the full E2E mock suite pass in CI. Suites removed:
  - E2E: `publish.test.ts`, `campaign-scheduling.test.ts`, `export.test.ts` (replaced by `download.test.ts`) and `scheduler-heartbeat.test.ts` (replaced by `retention-health.test.ts`).
  - Unit: `jobRunner`, `generationRunner`, `heartbeatStatus`, `analyticsScheduledGeneration`, `postStylesHold`, `postStylesQueueRoutes`, `queueSchema` and `schedulePlan`.
  - Unit, added at verify (2026-10-31, user decision): `postStylesApi` and `schedulerStatusRoute` (T2; they tested only the queue schema and `/api/scheduler/status`), and `captionResolve` (T4; it tested only `resolveCaptionForPublish`, deleted with `src/lib/captions/resolve.ts`).

  No other suite is deleted; the rest are edited.

- **AC-20 (docs):** `docs/social-publishing-setup.md` is gone. A grep of `CLAUDE.md`, `README.md` and `docs/{deploy,cold-start,mcp-acp-guide}.md` finds no present-tense instruction to publish, schedule or connect a channel. History sections may mention them.

## Edge Cases

- **A draft refined while Download renders:** the compare-and-set loses, the route answers 409 `changed`, and the new object is deleted. The user clicks again.
- **A legacy draft whose current revision has no `exportUrl`:** it is never current, so Download renders and writes `Draft.exportUrl`. It also fills the revision's null `exportUrl` in the same compare-and-set, so the next Download does not render again.
- **A draft with a `device-screen` screenshot whose object is missing:** `CompositePlacementError`, then 422 `composite-not-placed`, as Export did.
- **An editor without access to the draft:** 404, with the same body as an unknown id.
- **A Postgres `scheduler` value in `AnalyticsEvent`:** still valid. `track` refuses to write it, because no event lists it.
- **An MCP client calling `publish_post` after the upgrade:** an unknown-tool error, never a silent success.
- **A local `ai_studio` database with no publishing rows:** the precondition passes and the migration runs. Today's local database (the Aloys reset of 2026-10-28) is expected to be this case. The operator still sees the dry-run output if they run the script.
- **`Brief.channels`:** still written by the wizard and `generate_post`, and unchanged. 039 deprecates it.
- **`PUBLISHABLE_CHANNELS`:** keeps its name in this change, because `Brief.channels` validation and the caption resolver still use it. 039 reworks the registry.

## Grounding

- `CLAUDE.md` says "Use `npm run db:migrate` and `npm run test:e2e:db -- --reset`, never a bare `prisma migrate deploy`." D2's operator steps use `npm run db:migrate`.
- `CLAUDE.md` says "`scripts/purge-analytics.mjs` refuses to run without an explicit `DATABASE_URL`." FR-02 copies this guard.
- `CLAUDE.md` says "**One emitter per event name:** each event has exactly one place that writes it." This is the basis for D7.
- `CLAUDE.md` says "`analyticsCoverage.test.ts` fails if a `DraftAction`, `Channel` or `source` value has no event that can carry it." This is the basis for D5 and D6.
- `CLAUDE.md` says "Test-only seams … (all dormant in prod)" and "**CI runs the app in `next dev` mode** because that seam is intentionally inert in a prod build." This is the basis for D12.
- In the catalogue header, `src/lib/analytics/catalogue.ts:7-9`: "A payload change only ADDS optional fields. Renaming or removing a field … bumps that event's schemaVersion." D5 adds a field; D6 removes one and bumps the version.
