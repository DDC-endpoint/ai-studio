# Tasks: Remove scheduled generation and publishing

**Change:** 037-remove-scheduling-publishing
**Created:** 2026-10-30
**Total Tasks:** 6

## Summary

Add Download first, then remove scheduled generation, then the publishing UI, then the publishing backend, then drop the schema, and last update the docs and run the full gate. Each task leaves `tsc`, lint and the unit suite green, so it commits on its own (NFR-04). The Prisma models stay in `schema.prisma` until T5. Spec: `spec.md`; design: `design.md`.

**Every removal task first greps `src/`, `tests/` and `scripts/` for each name it removes, and updates or deletes every hit in the same task.** The file lists below are the known hits, not a ceiling.

## Tasks

### Wave 1: Download

- [x] `T1` — Download replaces Export
  - Files: src/lib/drafts/download.ts, src/app/api/drafts/[id]/download/route.ts, src/app/api/generate/export/route.ts, src/app/(app)/drafts/[id]/page.tsx, src/lib/renderedText/noticeText.ts, src/components/library/PublishDialog.tsx, src/lib/analytics/catalogue.ts, src/lib/api-types.ts, tests/unit/download.test.ts, tests/unit/fontInjectionSites.test.ts, tests/unit/compositeRerender.test.ts, tests/unit/renderedText.test.ts, tests/unit/analyticsCatalogue.test.ts, tests/e2e/export.test.ts, tests/e2e/download.test.ts, tests/e2e/regression.test.ts
  - Estimate: medium
  - Kind: impl
  - Notes:
    - Deletes: `src/app/api/generate/export/route.ts` and `tests/e2e/export.test.ts`.
    - Covers D4, D7, FR-04, FR-05 (the Download button, the download line and the "Ready" chip), and AC-06 to AC-09.
    - `ensureCurrentExport` returns a tagged result, and the route maps it and emits `draft.downloaded` (the only emitter). Copy the render call and the `CompositePlacementError` handling from the export route.
    - The compare-and-set uses `prisma.draft.updateMany` with `{ id, currentRevisionNumber, exportUrl, status: 'EXPORTED', pendingAction: null }`, in one transaction that also fills the current revision's `exportUrl` when it is null. A lost compare-and-set calls `deleteObject` and returns 409 `changed`.
    - Stream with `getObjectBytes`.
    - Rename `publishLineFor` to `downloadLineFor` and reword it for download. `PublishDialog` keeps working through the rename until T3 removes it.
    - The Publish button stays in this task.
    - The E2E uses Playwright's `page.waitForEvent('download')`, created before the click.
    - Read `docs/ui-reference/DESIGN_SYSTEM.md` before touching the page.

### Wave 2: remove scheduled generation

- [x] `T2` — Remove the campaign queue, the generation loop and the briefing plan; rewrite the heartbeat suite for retention
  - Files: src/app/api/campaigns/[id]/queue/**, src/app/api/scheduler/status/route.ts, src/app/api/test/generation-tick/route.ts, src/lib/campaign/queue.ts, src/lib/scheduler/generationRunner.ts, src/lib/scheduler/heldReason.ts, src/lib/scheduler/heartbeatStatus.ts, src/components/campaigns/ScheduledQueueSection.tsx, src/components/campaigns/QueueEntryModal.tsx, src/app/(app)/campaigns/[id]/page.tsx, src/lib/campaign/briefingAssistant.ts, src/components/campaigns/BriefingAssistantPanel.tsx, src/app/api/campaigns/[id]/briefing/chat/route.ts, src/scheduler/worker.ts, src/scheduler/loops.ts, src/lib/models/budget.ts, src/lib/postStyles/resolve.ts, src/lib/postStyles/styles.ts, src/lib/analytics/catalogue.ts, src/lib/analytics/queries.ts, src/components/admin/insights/sections.tsx, src/app/api/test/worker-heartbeat/route.ts, src/lib/api-types.ts, src/lib/testHooks.ts, tests/unit/workerHeartbeatSeam.test.ts, tests/unit/workerLoops.test.ts, tests/e2e/campaign-scheduling.test.ts, tests/e2e/scheduler-heartbeat.test.ts, tests/e2e/retention-health.test.ts, tests/e2e/surfaces.test.ts, tests/e2e/a11y.test.ts, tests/e2e/assistants-031.test.ts, tests/e2e/post-styles.test.ts, tests/e2e/analytics.test.ts, tests/unit/generationRunner.test.ts, tests/unit/heartbeatStatus.test.ts, tests/unit/analyticsScheduledGeneration.test.ts, tests/unit/postStylesHold.test.ts, tests/unit/postStylesQueueRoutes.test.ts, tests/unit/queueSchema.test.ts, tests/unit/schedulePlan.test.ts, tests/unit/actionBudget.test.ts, tests/unit/postStylesBoundary.test.ts, tests/unit/postStylesAnalytics.test.ts, tests/unit/briefingAssistant.test.ts, tests/unit/analyticsCoverage.test.ts
  - Estimate: large
  - Depends: T1
  - Kind: refactor
  - Notes:
    - Deletes: the queue routes, `scheduler/status`, `generation-tick`, `campaign/queue.ts`, `generationRunner`, `heldReason`, `heartbeatStatus`, `ScheduledQueueSection`, `QueueEntryModal`; the unit tests `generationRunner`, `heartbeatStatus`, `analyticsScheduledGeneration`, `postStylesHold`, `postStylesQueueRoutes`, `queueSchema` and `schedulePlan`; the E2E suites `campaign-scheduling` and `scheduler-heartbeat`.
    - Covers FR-08, FR-03 (the generation loop goes; the `scheduler` loop stays until T4), D12 (the seam's loop becomes `retention` only), and AC-13 and AC-14.
    - `scheduled_generation.settled` leaves `CATALOGUE` and goes into a new `RETIRED_EVENT_NAMES`.
    - Insights loses the "Held" column (AC-16).
    - `OFFLINE_THRESHOLD_MS` moves into `queries.ts`.
    - `UNATTENDED` becomes `mcp` and `acp`.
    - The worker's startup Claude-token check goes.
    - `PostGenerationAction` is no longer imported anywhere in `src/` after this task. The enum itself goes in T5.
    - The retention E2E seeds `retention` rows and reads the Insights Health chip. A super admin sees `/admin/insights`.

### Wave 3: remove the publishing UI

- [x] `T3` — Remove the publish UI; library filters and `LibraryCard`; dashboard KPIs; team wording
  - Files: src/components/library/PublishDialog.tsx, src/components/library/PublishHistoryDrawer.tsx, src/components/library/PostCard.tsx, src/components/library/LibraryCard.tsx, src/app/(app)/library/page.tsx, src/app/api/library/route.ts, src/app/(app)/page.tsx, src/components/dashboard/RecentDraftsCard.tsx, src/app/(app)/drafts/[id]/page.tsx, src/app/(app)/team/page.tsx, src/components/team/CaptionRouteCard.tsx, src/components/team/ModelsCard.tsx, src/components/team/TeamClaudeTokenCard.tsx, src/lib/dates.ts, scripts/capture-ui.mjs, tests/unit/libraryRoute.test.ts, tests/unit/monthStart.test.ts, tests/unit/libraryHeadlineState.test.ts, tests/e2e/library.test.ts, tests/e2e/ui.test.ts, tests/e2e/team-settings.test.ts, tests/e2e/a11y.test.ts, tests/e2e/headline-badge.test.ts, tests/helpers/ui.ts
  - Estimate: large
  - Depends: T2
  - Kind: impl
  - Notes:
    - Deletes: `PublishDialog`, `PublishHistoryDrawer`, `PostCard`.
    - Covers FR-05 (the Publish button goes), FR-06, FR-07, FR-14 (UI copy), D10, D11, and AC-10 and AC-11.
    - The backend publish routes still exist after this task. Nothing in the UI calls them.
    - The library route drops `status` and takes `brandKitId` and `postStyle`. An unknown style is 400; validate it with the post-style module's `isStyleKey`.
    - "Posts this month" is team-wide, by `teamId` (D11).
    - The token copy becomes "MCP/ACP and member fallback".
    - Run the wording guard and the token guard.
    - Read `docs/ui-reference/DESIGN_SYSTEM.md` first.

### Wave 4: remove the publishing backend

- [x] `T4` — Remove the posts routes, social clients, the publish loop, `publish_post`, the `MOCK_SOCIAL` seams and the publish analytics
  - Files: src/app/api/posts/**, src/app/api/team/channels/**, src/app/api/test/scheduler-tick/route.ts, src/lib/social/**, src/lib/publish/**, src/lib/scheduler/jobRunner.ts, src/mcp/tools/publish.ts, src/scheduler/worker.ts, src/scheduler/loops.ts, src/mcp/server.ts, src/acp/agent.ts, src/app/api/acp/run/route.ts, src/lib/captions/store.ts, src/lib/authz/visibility.ts, src/lib/analytics/catalogue.ts, src/lib/drafts/draftActions.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/lib/renderedText/track.ts, src/lib/testHooks.ts, src/lib/env.ts, src/lib/api-types.ts, .env.test, .github/workflows/e2e.yml, tests/unit/jobRunner.test.ts, tests/unit/acpManifest.test.ts, tests/unit/removedModules.test.ts, tests/e2e/publish.test.ts, tests/e2e/removed-routes.test.ts, tests/e2e/acp.test.ts, tests/e2e/surfaces.test.ts, tests/e2e/team-isolation.test.ts, tests/e2e/auth.test.ts, tests/e2e/captions.test.ts, tests/e2e/caption-route.test.ts, tests/e2e/settle-race.test.ts, tests/e2e/analytics.test.ts, tests/e2e/regression.test.ts, tests/unit/analyticsCoverage.test.ts, tests/unit/analyticsCatalogue.test.ts, tests/unit/analyticsEmitters.test.ts, tests/unit/analyticsTrack.test.ts, tests/unit/trackHeadlineEdited.test.ts, tests/unit/captionStore.test.ts, tests/unit/testHooks.test.ts, tests/unit/mcpGetDraft.test.ts, tests/unit/channels.test.ts
  - Estimate: large
  - Depends: T3
  - Kind: refactor
  - Notes:
    - Deletes: `src/app/api/posts/**`, `src/app/api/team/channels/**`, `scheduler-tick`, `src/lib/social/**`, `src/lib/publish/**`, `jobRunner`, `src/mcp/tools/publish.ts`; the unit test `jobRunner`; the E2E suite `publish`.
    - Covers FR-09, FR-11, FR-03 (the worker runs `retention` only), D5, D6, D8 and D12 (`MOCK_SOCIAL` removed), and AC-04, AC-05, AC-12 and AC-15.
    - `publish.settled` goes into `RETIRED_EVENT_NAMES`.
    - `scheduler` leaves every source list and goes into `RETIRED_SOURCES`.
    - `draft_action.settled` gains an optional `channel`, set by regenerate-copy for a single-caption target.
    - `draft.headline_edited` goes to schemaVersion 2 without `scheduledPending`.
    - ACP and MCP versions go to `2.0.0`.
    - CI stays in dev mode; rewrite the e2e.yml comment to say every seam is a 404 in a prod build.

### Wave 5: drop the schema

- [x] `T5` — Fail-closed migration, down script, clear script, upgrade-path scenario and the `PUBLISHED` removal
  - Files: prisma/schema.prisma, prisma/migrations/20261031120000_remove_scheduling_publishing/migration.sql, prisma/rollback/037-remove-scheduling-publishing.down.sql, scripts/clear-publishing-data.mjs, scripts/lib/clearPublishing.mjs, scripts/test-upgrade-path.mjs, scripts/seed-teams.mjs, src/app/api/drafts/[id]/route.ts, tx.post, src/app/api/drafts/[id]/apply-text/route.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/app/api/drafts/[id]/retry/route.ts, src/lib/drafts/inlineEdit.ts, src/components/drafts/CaptionPanel.tsx, src/components/drafts/CaptionPanels.tsx, src/components/drafts/HeadlinePanel.tsx, src/components/dashboard/RecentDraftsCard.tsx, src/app/(app)/drafts/[id]/page.tsx, src/lib/api-types.ts, tests/unit/clearPublishing.test.ts, tests/unit/inlineEdit.test.ts, tests/unit/draftDetailGet.test.ts, tests/unit/applyTextRoute.test.ts, tests/e2e/*
  - Estimate: large
  - Depends: T4
  - Kind: migration
  - Notes:
    - Covers D1, D2, FR-01, FR-02 and FR-10, and AC-01, AC-02, AC-03 and AC-18.
    - Generate the DDL with `prisma migrate diff` and put the precondition `DO` block first (design §Migration).
    - Scenario 1 of the upgrade test:
      1. Deploy up to the migration before 037 and run today's checks there.
      2. Assert that deploying head fails with the 037 message and leaves the `Post` row and the `PUBLISHED` draft intact.
      3. Run `prisma migrate resolve --rolled-back`.
      4. Run the clear script with `--yes` against the scratch URL.
      5. Deploy head, then assert AC-01.
      6. Run the head-client read and `migrate diff`.
    - Then:
      - `npx prisma generate`.
      - Run `npm run test:upgrade` locally (Docker up; `export MSYS_NO_PATHCONV=1` before any docker command with a container path).
      - Run `npm run test:e2e:db -- --reset`.
    - Do not run `npm run db:migrate` against the local `ai_studio` database in this task. That is an operator step for the user.

### Wave 6: docs and the full gate

- [x] `T6` — Docs, the full E2E mock run and CI
  - Files: docs/social-publishing-setup.md, CLAUDE.md, README.md, docs/deploy.md, docs/cold-start.md, docs/mcp-acp-guide.md, docs/e2e-test-plan.md, .env.example
  - Estimate: medium
  - Depends: T5
  - Kind: docs
  - Notes:
    - Deletes: `docs/social-publishing-setup.md`.
    - Covers FR-15, AC-17, AC-19 and AC-20.
    - `docs/deploy.md` and `docs/cold-start.md` get the operator sequence for the migration:
      1. the dry run;
      2. `--yes`;
      3. `npm run db:migrate`;
      4. the `migrate resolve` recovery, if the precondition fired first;
      5. the manual revoke of Instagram and LinkedIn app access.
    - `CLAUDE.md`:
      - Rewrite the 023, 027 HOLD, 030 publish line and 006 `scheduler` source entries, and the testing notes (`MOCK_SOCIAL`, the scheduler-tick seam).
      - Add the 037 state entry.
      - Point "Pick up here" at verify 037.
    - Add AC-17's end-to-end case (generate, refine, Download, Copy) to `download.test.ts` if T1 did not.
    - Run the full mock suite:
      1. `npm run test:e2e:db -- --reset`
      2. `npm run test:e2e:serve`
      3. `npm run test:e2e:mock`
    - Before pushing, check that `git remote get-url origin` prints the fork.
    - Push to `v2` and check `gh run list --branch v2`.

## Legend

- Waves run in order; every task is its own wave because each one edits files the next one edits.
- `Kind` hints the implementer's role. The orchestrator runs `tsc`, lint and unit and commits after each task (`CLAUDE.md`, Working rules).
