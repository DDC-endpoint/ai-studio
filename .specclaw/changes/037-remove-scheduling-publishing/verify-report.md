---

# Verification Report: 037-remove-scheduling-publishing

**Verified:** 2026-10-31 (agent pass 2026-10-30; CI clauses and the AC-19 amendment filled by the orchestrator)
**Model:** Claude Sonnet 5.5
**Verdict:** PASS

(The agent pass was PARTIAL on two points, both closed: CI run 41105198334 on `87302710` is green, E2E 552 passed / 3 skipped / 0 failed / 0 flaky, and the user amended AC-19 on 2026-10-31 to name the three extra deleted unit suites.)

## Quotes (per criterion)

### AC-01 tables gone
- AC: "`Post`, `ChannelToken` and `ScheduledGeneration` do not exist. ... `DraftStatus` has exactly `IN_PROGRESS`, `EXPORTED` and `FAILED`."
- Code: `prisma/migrations/20261031120000_remove_scheduling_publishing/migration.sql`: `DROP TABLE "ScheduledGeneration"; DROP TABLE "Post"; DROP TABLE "ChannelToken"; DROP TYPE "PostStatus"; DROP TYPE "GenerationStatus"; DROP TYPE "PostGenerationAction"; CREATE TYPE "DraftStatus_new" AS ENUM ('IN_PROGRESS', 'EXPORTED', 'FAILED');`. `prisma/schema.prisma:29-33` `enum DraftStatus { IN_PROGRESS EXPORTED FAILED }`; grep finds no `model Post|ChannelToken|ScheduledGeneration` or the three enums in schema.prisma.
- Test: `scripts/test-upgrade-path.mjs:~423-428` `check(!(await tableExists(t)), ...still exists at head)`, `types.length === 0`, `json(labels) === json(['IN_PROGRESS','EXPORTED','FAILED'])`.
- Evidence of run: `reports/T5.md:13` "npm run test:upgrade (ALL PASS, 4 scenarios, 80.4 s)". I did not re-run it (instructed not to run migrations).

### AC-02 fail closed
- AC: "a database at the migration before 037 that holds a `Post` row and a `PUBLISHED` draft fails to deploy 037. The error names the counts, and the rows and tables are unchanged ... After `clear-publishing-data.mjs --yes`, 037 deploys, the draft is `EXPORTED`, and `prisma migrate diff` exits 0."
- Code: migration.sql `IF p + t + g + d > 0 THEN RAISE EXCEPTION '037 remove_scheduling_publishing refused: % Post, % ChannelToken, % ScheduledGeneration, % PUBLISHED drafts. ...'`.
- Test: `scripts/test-upgrade-path.mjs:392-436`: `/1 Post, 0 ChannelToken, 0 ScheduledGeneration, 1 PUBLISHED drafts/` match; `tableExists('Post')`; Post row JSON equals `postBefore`; `pub === 1`; dry run `status === 3`; `--yes` status 0; `st === 'EXPORTED'`; `migrate diff ... --exit-code` `diff.status === 0`.

### AC-03 clear script
- AC: dry run exits 3 with rows; `--yes` issues deletes and one remap; missing `DATABASE_URL` exits 2 before the client is imported.
- Test: `tests/unit/clearPublishing.test.ts:17` "a dry run with rows prints counts and accounts, runs nothing and exits 3"; `:30` "--yes issues the three deletes and the one remap, in order, and exits 0"; `:59` "exits 2 without DATABASE_URL, before any client is imported". Unit suite total passed 4458/4458 (orchestrator evidence).

### AC-04 routes gone
- AC: eight routes each answer 404 or 405.
- Test: `tests/e2e/removed-routes.test.ts:19-28` lists exactly GET/POST `/api/posts`, GET `/api/team/channels`, GET `/api/scheduler/status`, GET `/api/campaigns/any-id/queue`, POST `/api/test/scheduler-tick`, POST `/api/test/generation-tick`, POST `/api/generate/export`; asserts `expect([404, 405]...)`.
- Log (`037-e2e-full.log:711-718`): `[477/555]..[484/555] tests\e2e\removed-routes.test.ts ... TC-RM-...` all eight listed as passed (not in the failed list).

### AC-05 MCP/ACP
- AC: no `publish_post` in MCP list or ACP manifest; manifest `2.0.0`; E2E `POST /api/acp/run` with `publish_post` refused.
- Test: `tests/unit/acpManifest.test.ts:11-13` `expect(AGENT_MANIFEST.version).toBe('2.0.0'); ...capabilities.map(c=>c.name)).toEqual(['generate_post'])`; `:22` `not.toMatch(/publish_post/)`; `:33-35` MCP `src/mcp/server.ts` `not.toMatch(/publish_post|publishPost/)` and version `2.0.0`; `:37-39` run route has no case.
- E2E: `tests/e2e/acp.test.ts:82-87` `capability: 'publish_post'` -> `expect(pub.status()).toBe(400)`, `Unknown capability`. Also `captions.test.ts:263` and `team-isolation.test.ts:350`. Log line 326: `captions.test.ts:263 ... publish_post is gone` passed; acp.test.ts is not in either failed list.
- Note: the MCP tool list is read from the source text, not from a live list (the server file starts a stdio transport); acceptable proxy, stated in the test header.

### AC-06 Download, current
- AC: "Download returns 200 `image/png` with an attachment `Content-Disposition`. The draft's `exportUrl` is unchanged and no render ran (`draft.downloaded` has `rendered: false`)."
- Code: `src/lib/drafts/download.ts:46` `if (current) return { ok: true, key: draft.exportUrl as string, rendered: false }`; `src/app/api/drafts/[id]/download/route.ts:74` `track('draft.downloaded', {..., outcome: 'ok', payload: { rendered: result.rendered, ...stamp } })`.
- Test: `tests/e2e/download.test.ts:59-74` TC-DL-01: `status 200`, `content-type 'image/png'`, `content-disposition` matches `^attachment; filename=...\.png"$`, `exportUrl` equal before/after, `event.payload.rendered` `false`.
- Log: full run `[225/555] ... TC-DL-01` plus `3) ... TC-DL-01` failure at `download.test.ts:70` on first attempt, passed on retry #1 (reported flaky). Rerun log `[48/106] TC-DL-01` passed with "106 passed" and no flaky entry.
- Note: line 70 is `expect(after.exportUrl?...)`, i.e. a transient signed-URL/key comparison on first attempt; rerun clean. See Issues.

### AC-07 Download, not current
- Test: `tests/unit/download.test.ts:80` "renders once when exportUrl is cleared, writes the key under the compare-and-set, and does not render again"; `:105` "renders when the draft exportUrl differs from the current revision, then both agree". Code: `download.ts:66` `tx.draft.updateMany(` (CAS), `:79` `tx.draftRevision.updateMany(` fills the revision key. E2E TC-DL-02 `events.map(e=>e.payload.rendered).sort()).toEqual([false, true])` (log `[226/555]`, rerun `[49/106]`).

### AC-08 Download fails closed
- Test: `tests/unit/download.test.ts:138` "a render that throws: 422 render-failed, no upload, no write"; `:146` "a placement failure: 422 composite-not-placed, no upload, no write" (`CompositePlacementError`); `:154` "a lost compare-and-set: 409 changed, the uploaded object is deleted" (`h.del` called with `'exports', 'exports/export-d1.png'`); `:164-168` "a draft that is not EXPORTED ... 409 not-ready, nothing rendered". Code `download.ts:32` `fail(409, 'not-ready', ...)`, `:59` `fail(422, 'render-failed', ...)`, `:86` `fail(409, 'changed', ...)`.

### AC-09 Download UI
- Test: `tests/e2e/download.test.ts:96-113` TC-DL-04: Download button visible; `Export`, `Re-export` and `/^publish$/i` buttons `toHaveCount(0)`; `page.waitForEvent('download')` created before click; `suggestedFilename()` matches `/\.png$/`. `:116-124` TC-DL-05: `getByTestId('download-line')` `toHaveText('The image shows an older headline.')`. Log `[228/555]`, `[229/555]`; rerun `[51/106]`, `[52/106]`.

### AC-10 library
- Test: `tests/e2e/library.test.ts:87-115` (kit and style filters narrow; `none` contains both; `postStyle=no-such-style` -> 400); `:117-163` TC-LIB-06: two drafts on different kits and styles, `Filter by status` group count 0, `Publish` button 0, `History` button 0, kit select narrows, style select narrows, "All" shows both. Unit: `tests/unit/libraryRoute.test.ts:41` "answers 400 for an unknown postStyle and queries nothing". Code `src/app/api/library/route.ts:20` `if (postStyle && !isStyleKey(postStyle))`. Log `[319/555]`, `[320/555]` passed.

### AC-11 dashboard
- Code: `src/app/(app)/page.tsx:172` `<KpiCard label="Posts this month" value={data.postsThisMonth} />`; `src/lib/dates.ts` `monthStartUtc` (`Date.UTC(y, m, 1, 0,0,0,0)`). grep for "Posts published|Active campaigns" in `src`: no hits.
- Test: `tests/e2e/ui.test.ts:60-63` `Posts this month` visible, `Posts Published` and `Active Campaigns` `toHaveCount(0)`; `:83-105` KPI read before, a draft generated, `expect(await readKpi()).toBeGreaterThanOrEqual(before + 1)`. Unit `tests/unit/monthStart.test.ts:9` "keeps the month at 23:59:59.999 UTC on the last day", `:13` "returns the same instant at 00:00:00.000 UTC on the 1st", `:24` year boundary and leap February. Log `[597/555]`, `[599/555]`.
- Note: E2E asserts `>= before + 1`, not exactly +1 (parallel workers share the team). Reasonable.

### AC-12 worker
- Test: `tests/unit/workerLoops.test.ts:11` `expect([...LOOPS]).toEqual(['retention'])`; `:17-19` worker source matches `LOOPS.map(` and not `generationRunner`. `tests/unit/removedModules.test.ts:30-34` FORBIDDEN `jobRunner`, `generationRunner`, `heldReason`, `lib/social`, `lib/publish` scanned over every `src` file (`files.length > 100`), plus `:37-47` removed paths do not exist.

### AC-13 retention health
- Test: `tests/e2e/retention-health.test.ts:55` "a fresh row reads "Retention running"", `:64` "an old row reads "Retention stalled"", `:73` "no row reads "Retention never ran"", `:81` "the seam refuses any loop other than retention with 400, and writes nothing", `:89` "a call with no session is refused". Code `src/components/admin/insights/sections.tsx:242-246` the three strings. Rerun log `[102/106]..[106/106]` all passed (the first full run failed `:89`, fixed in `32e0fe79`). `scheduler-heartbeat.test.ts` is gone.

### AC-14 seam gates
- Test: `tests/unit/workerHeartbeatSeam.test.ts:39` "is a 404 in production, even with MOCK_AI", `:46` "is a 404 without MOCK_AI", `:53` "is a 403 for a non-admin and writes nothing", `:60` "is a 200 for an admin and upserts the retention row", `:77` "refuses any loop other than retention with 400".

### AC-15 analytics
- `tests/unit/analyticsCoverage.test.ts` exists (not deleted) and per bullet:
  - Channel carrier: `:54-58` `CATALOGUE['draft_action.settled'].schema.safeParse({ action: 'REGENERATE_COPY', channel })` success for every `Channel` value (catalogue.ts:128 `channel: z.nativeEnum(Channel).optional()`).
  - live sources: `:60-65` every `SOURCES` value has a carrier.
  - retired names: `catalogue.ts:228` `RETIRED_EVENT_NAMES = ['scheduled_generation.settled', 'publish.settled']`; `:74-80` not in `EVENT_NAMES` nor `CATALOGUE`.
  - scheduler source: `catalogue.ts:236` `RETIRED_SOURCES = ['scheduler']`; `:67-72` no event's `source` contains it.
  - headline_edited v2: `:116-124` `schemaVersion` `toBe(2)`, no `scheduledPending` in parsed output (catalogue.ts:164 `schemaVersion: 2`).
  - one emitter: `:126-137` `expect(hits).toHaveLength(1)`; code grep: only `src/app/api/drafts/[id]/download/route.ts` calls `track('draft.downloaded'` (three call sites in one file, lines 54, 67, 74).
- Unit run: 203 files / 4458 tests passed.

### AC-16 Insights
- Test: `tests/e2e/post-styles.test.ts:812-814` `section.getByRole('columnheader', { name: 'Held' })` `toHaveCount(0)` and `Flagged` count 1; Health line: `sections.tsx:242-246` "Retention running/stalled/never ran", exercised by AC-13 suite. No `Held` in `src/app`/`src/components` tsx. The TC-PS-40 test passed in the rerun (`[101/106]`).

### AC-17 end to end
- Test: `tests/e2e/download.test.ts:148-181` TC-DL-06 (Path A, template assemble) and TC-DL-07 (Path B): generate, `POST .../refine` 202 and `waitForAction`, `context.grantPermissions(['clipboard-read','clipboard-write'])`, Download click saves `.png`, `getByRole('button', { name: 'Copy Instagram caption' }).click()`, `Caption copied` visible, `navigator.clipboard.readText()` equals the textbox value. Log `[230/555]`, `[231/555]`; rerun `[53/106]`, `[54/106]`.

### AC-18 fresh deploy
- AC: "CI's E2E job runs every migration on an empty database, and `test:upgrade` exits 0, which includes AC-02's `migrate diff`."
- Evidence: `test:upgrade` passed (T5 report) and its scenario 1 ends with `prisma migrate diff ... --exit-code` `check(diff.status === 0...)`; the local full E2E ran on `ai_studio_test` reset to head. CI run 41105198334 (`87302710`): the E2E job migrates an empty database and runs `npm run test:upgrade` (`.github/workflows/e2e.yml:117`); conclusion success.

### AC-19 gates
- AC: "`tsc`, lint, the unit suite and the full E2E mock suite pass in CI. ... No other suite is deleted; the rest are edited."
- Evidence: unit 4458/4458; lint 0 errors (7 pre-existing warnings); build passed; CI run 41105198334 on `87302710`: unit, build and E2E success; E2E "552 passed (23.0m)", "3 skipped", no failed or flaky.
- Deleted named suites confirmed by `git diff --name-status 4cd1f94f..HEAD -- tests`: `D tests/e2e/campaign-scheduling.test.ts`, `export.test.ts`, `publish.test.ts`, `scheduler-heartbeat.test.ts` (replacements `download.test.ts`, `retention-health.test.ts` exist); `D tests/unit/analyticsScheduledGeneration`, `generationRunner`, `heartbeatStatus`, `jobRunner`, `postStylesHold`, `postStylesQueueRoutes`, `queueSchema`, `schedulePlan`.
- Deleted but NOT named in AC-19: `tests/unit/captionResolve.test.ts` (tested `resolveCaptionForPublish` in the deleted `lib/captions/resolve.ts`), `tests/unit/postStylesApi.test.ts` (tested `queueEntrySchema`, `resolveEntryStyle`, `toEntryCreateData` from the deleted `lib/campaign/queue.ts`), `tests/unit/schedulerStatusRoute.test.ts` (tested the deleted `/api/scheduler/status`). T2/T4 reports `:7` record them. They test only deleted modules, so deleting is the only coherent outcome, but the AC literally says "No other suite is deleted".

### AC-20 docs
- `ls docs | grep -i social`: no output (`docs/social-publishing-setup.md` is gone).
- Grep of `README.md`: no publish/schedule hits. `docs/mcp-acp-guide.md:97` "`publish_post` was removed by change 037"; `docs/deploy.md:117-127` and `docs/cold-start.md:283-290` are the 037 upgrade sections (past-tense/migration procedure; the "published on the host" lines are port publishing); `docs/deploy.md:3,16` "analytics retention only". `CLAUDE.md` hits are removal notes (`:36` "Removed: scheduling, publishing..."), the history list in program bullets, the wave-5 table row (`:151`), and the `:171` worker health entry. No present-tense instruction to publish, schedule or connect a channel found.

### FR-10 / NFR-03 sanity
- `grep -rn "PUBLISHED" src`: no matches. `grep MOCK_SOCIAL` excluding `.specclaw/changes`, `.superpowers`: only `CLAUDE.md:36,129` (removal notes), `docs/e2e-test-plan.md` (history/removal banners), `docs/handoff.md`, `docs/history.md`, old `docs/superpowers/*` plans, and `tests/unit/testHooks.test.ts:29` "MOCK_SOCIAL and MOCK_SOCIAL_FAIL are gone (037)" (a guard that they are absent). None in `src`, `.github`, `package.json` or env files.

## Acceptance Criteria

- ✅ **AC-01:** tables and enums gone; DraftStatus has exactly three values — migration.sql drops all three tables and types and rebuilds `DraftStatus`; upgrade-path test asserts it (T5: ALL PASS).
- ✅ **AC-02:** fail-closed refusal naming counts; unchanged rows; clear script then deploy, EXPORTED, `migrate diff` 0 — `test-upgrade-path.mjs:392-436`.
- ✅ **AC-03:** clear script exits 3 on dry run, `--yes` runs the deletes and one remap, missing `DATABASE_URL` exits 2 — `clearPublishing.test.ts:17,30,59`.
- ✅ **AC-04:** eight routes answer 404/405 — `removed-routes.test.ts`, all eight passed in the full run.
- ✅ **AC-05:** no `publish_post`, manifest `2.0.0`, run route refuses with 400 — `acpManifest.test.ts`, `acp.test.ts:82-87`.
- ✅ **AC-06:** Download returns 200 `image/png` attachment, `exportUrl` unchanged, `rendered: false` — TC-DL-01 (flaky once in the full run, clean in the rerun).
  - ⚠️ Edge case: TC-DL-01 failed its first attempt at `download.test.ts:70` in the full run and passed on retry; clean in the rerun. Treat as a flake to watch in CI.
- ✅ **AC-07:** renders once then not again; CAS and revision fill — `download.test.ts:80,105`, TC-DL-02.
- ✅ **AC-08:** 422 `render-failed`, 422 `composite-not-placed`, 409 `changed` with object deleted, 409 `not-ready` — `download.test.ts:138-171`.
- ✅ **AC-09:** Download present; no Export, Re-export or Publish; `.png` download event; stale line — TC-DL-04, TC-DL-05.
- ✅ **AC-10:** each filter narrows, All shows both, no status filter, Publish or History, unit 400 on unknown style — `library.test.ts:87,117`, `libraryRoute.test.ts:41`.
- ✅ **AC-11:** "Posts this month" present, no "Posts Published" or "Active Campaigns", count rises, UTC month bound unit-tested.
  - ⚠️ Edge case: the E2E asserts `>= before + 1`, not exactly +1 (parallel workers).
- ✅ **AC-12:** `LOOPS` is `['retention']`; no `src` file refers to the five removed modules — `workerLoops.test.ts`, `removedModules.test.ts`.
- ✅ **AC-13:** retention health suite covers running, stalled, never ran, 400 on other loops — `retention-health.test.ts`, passed in the rerun.
- ✅ **AC-14:** seam gates 404/404/403/200 — `workerHeartbeatSeam.test.ts`.
- ✅ **AC-15:** all six bullets are asserted in `analyticsCoverage.test.ts`.
- ✅ **AC-16:** no Held column; Health line shows retention — `post-styles.test.ts:812`, `sections.tsx:242-246`.
- ✅ **AC-17:** Path A and B generate, refine, download, copy Instagram caption with clipboard permission — TC-DL-06, TC-DL-07.
- ✅ **AC-18:** `test:upgrade` exits 0 including `migrate diff` (T5 locally, and in CI run 41105198334 via `e2e.yml:117`); CI E2E runs every migration on an empty database and is green.
- ✅ **AC-19:** tsc/build, lint, unit and the full E2E mock suite pass in CI (run 41105198334: 552 passed, 3 skipped). The deleted suites are exactly the amended list: 4 E2E and 11 unit, including `postStylesApi`, `schedulerStatusRoute` and `captionResolve` (added to AC-19 by the user on 2026-10-31; each tested only removed code).
- ✅ **AC-20:** `docs/social-publishing-setup.md` is gone; no present-tense publish, schedule or connect-a-channel instruction in the five docs (only removal and upgrade notes).

## Test Results

- `npm run test:unit` at HEAD `87302710`: Test Files 203 passed (203), Tests 4458 passed (4458).
- `npm run lint`: 0 errors, 7 pre-existing warnings. `npm run build`: passed.
- Local E2E full mock run (`037-e2e-full.log`): "5 failed / 1 flaky / 3 skipped / 19 did not run / 527 passed (14.8m)". Failures: a11y `AC-19: /campaigns/[id] and /projects/[id]`, apply-text TC-AP-01, model-selection Models section, post-styles TC-PS-29, retention-health seam no-session. Flaky: TC-DL-01. All were stale assertions, fixed in `32e0fe79`.
- Rerun of those six files (`037-e2e-rerun.log`): "106 passed (4.0m)".
- `test:upgrade`: ALL PASS (T5 report), not re-run by me.
- CI run 41105198334 on `87302710`: unit success, build success, E2E success — "552 passed (23.0m)", "3 skipped" (the 3 intentional H11 skips), 0 failed, 0 flaky. The job also runs `npm run test:upgrade`.

## Issues Found

1. **Three extra suites deleted** — `tests/unit/captionResolve.test.ts`, `postStylesApi.test.ts`, `schedulerStatusRoute.test.ts` are not in AC-19's list. **Resolved:** the user amended AC-19 on 2026-10-31 to name them.
2. **"19 did not run" in the full run is not individually accounted for** — the skipped-after-failure tests are presumed to be in the serial groups of the five failing files, all of which passed in the rerun (a11y, apply-text, model-selection, post-styles, retention-health). I did not map the 19 one by one (assumption). **Resolved:** the CI E2E run (552 passed, 0 failed) covers every test.
3. **TC-DL-01 flaked once** (`download.test.ts:70`) — passed on retry and in the rerun. **Resolved:** the flake was the presigned URL's signature timestamp; `32e0fe79` compares the object path on both sides, and TC-DL-01 passed in the rerun and in CI.
4. **CI E2E pending** (run 41105198334) — **Resolved:** green (see Test Results).

## Summary

**Passed:** 20/20 criteria
**Failed:** 0/20 criteria
**Verdict:** PASS

---

## Per-task reviews

- T1 — WARN(1) → fixed in a second pass (revision `exportUrl` aligned so a second Download does not render; storage-read failure emits `draft.downloaded`)
- T2 — NOTE
- T3 — NOTE
- T4 — WARN(2) → fixed in a second pass (user-facing "publishing" copy reworded; dead caption resolver and loaders deleted)
- T5 — NOTE (down script `ADD VALUE 'PUBLISHED' BEFORE 'FAILED'` applied)
- T6 — no separate review; the full mock run found six stale assertions from T2–T4, fixed in `32e0fe79`

**Code Review:** skipped — `workflow.code_review` is not set in `.specclaw/config.yaml`; per-task reviews above.

## Verification

Command: gh run view 41105198334 --json conclusion,jobs
Exit: 0
Output (tail): conclusion success; e2e: success ("552 passed (23.0m)", "3 skipped"); unit: success; build: success — on `87302710`, the head of `v2` with every 037 task.
