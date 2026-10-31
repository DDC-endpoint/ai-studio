# Verification Report: 038-campaigns-to-projects

**Verified:** 2026-11-01
**Model:** claude-opus-5-5 (orchestrator) with two claude-sonnet verifiers (AC-01–AC-15, AC-16–AC-30)
**Verdict:** PASS

All 30 acceptance criteria pass. The first verifier pass found one FAIL (AC-14) and two partly-met criteria (AC-02, AC-03): the tests the criteria name did not exercise some of their clauses. The orchestrator closed those gaps in `7b279ed0` (tests only, no product code), re-ran the two E2E files (22 passed), and CI on `7b279ed0` is green.

## Acceptance Criteria

- ✅ **AC-01 (view tier):** every member sees every team post — `draftVisibilityWhere = u => ({ teamId: u.teamId })`; unit `visibility.test.ts`; E2E TC-PERM-02 and team-isolation "editor and team admin both see every team post".
- ✅ **AC-02 (edit tier, 403):** TC-PERM-01 loops all 16 edit routes (PATCH headline, **PATCH caption** added at verify, DELETE, apply-text, apply-project, inline-edit, refine, regenerate copy/design, retry, restore, adopt, assemble-a/b, generate copy/image): 403 `not-author`, snapshot unchanged, zero model calls. **TC-PERM-05b** (added at verify): the author (editor), a team admin and a super admin get 200 on PATCH caption and 202 on regenerate copy.
- ✅ **AC-03 (tier coverage):** `postActionTiers.test.ts` — every handler has a tier, every tier a handler, the predicate matches the tier, every DraftAction has an edit route; **a fixture handler with no entry fails the matcher** (added at verify).
  - ⚠️ Deviation: the tier values are `view | edit | none`; spec FR-03 names `view | assign | edit`. `assign` is folded into `view` (PUT project is any-member, `canView`), and `none` marks the brief-creating routes, which act on the caller's own new objects. The predicate rule is equivalent. Spec text not amended.
- ✅ **AC-04 (read boundary):** `visibilityBoundary.test.ts` walks `src/app/**` and `src/mcp/**`; the fixture route filtering `prisma.draft` by `teamId` without the import fails; `canAccessContent` and `briefVisibilityWhere` are gone (the FR-04 walk was added by the orchestrator at T1).
- ✅ **AC-05 (cross-team project ids):** team-isolation (brief, enhance, ACP: 404 `PROJECT_NOT_FOUND`, same body as an unknown id; assign, apply and library across teams, both directions); projects TC-PROJ-04 (project, briefing, documents, chat, library filter: one 404 body).
- ✅ **AC-06 (MCP/ACP 2.1.0):** `acpManifest.test.ts`, `mcpGenerate.test.ts` (`campaignId`/`campaign` → `CAMPAIGN_RETIRED` before any read; unknown, foreign or non-string `projectId` → `PROJECT_NOT_FOUND`); E2E acp.
- ✅ **AC-07 (kit precedence):** `resolveBrandKit.test.ts`; E2E resolution TC-RES-01..04 assert `inputs.kitSource` explicit, project and team.
- ✅ **AC-08 (post-style tier):** `postStylesResolve.test.ts`; E2E TC-PS-05/06.
- ✅ **AC-09 (project briefing in prompts):** `prompts.test.ts`, `promptBriefing.test.ts`, `heroPrompts.test.ts`, `postContextSites.test.ts`; E2E TC-PS-12.
- ✅ **AC-10 (the stamp):** `generationInputs.test.ts`; E2E TC-PROJ-08.
- ✅ **AC-11 (a move relabels):** E2E TC-PROJ-11; `postContext.test.ts` (the stamp wins over the moved brief).
- ✅ **AC-12 (apply):** E2E TC-PROJ-11 (403 non-author; 200 author with one `draft.inputs_applied`; 409 `no-change`); `applyProjectRoute.test.ts` (409 `busy`, `changed`).
- ✅ **AC-13 (assign):** E2E TC-PROJ-10 (any member assigns, moves, unassigns; one event each, none on a repeat; library filter).
- ✅ **AC-14 (project delete):** **TC-PROJ-07b** (added at verify): postCount 2, editor DELETE 403, admin DELETE `{ unassigned: 2 }`, both posts `project: null` with `inputs` unchanged, gone from the list and 404 by id, regenerate copy 202 then settled `EXPORTED`. Unit `projectDelete.test.ts` covers the transaction and that no briefing, document or object is deleted.
- ✅ **AC-15 (delete during a run):** `generationInputs.test.ts` — a stamped, soft-deleted project still supplies the stamped briefing; the run completes `EXPORTED`.
- ✅ **AC-16 (fail-closed drop):** upgrade scenario 5 — the head deploy refuses with the five counts and every row unchanged; recovery through `migrate resolve --rolled-back` and the clear script; `migrate diff` exit 0. Independent runs: local `npm run test:upgrade` (ALL PASS, 108.4 s) and the CI step "Upgrade path from main's schema" (ALL PASS).
- ✅ **AC-17 (schema after):** scenario 5 asserts the four campaign tables and `Brief.campaignId` are gone, and `ProjectBriefing`, `ProjectDocument`, `Brief.projectId`, `Draft.generationInputs` and `Project.defaultPostStyle` exist.
- ✅ **AC-18 (clear script):** `clearCampaigns.test.ts` — dry-run counts and exit 3, the `--yes` statement order and exit 0, no-rows and already-migrated exit 0, no `DATABASE_URL` exit 2 before the client import.
- ✅ **AC-19 (sweep script):** `sweepCampaignDocs.test.ts` — exit 4 until the drop has committed; only old campaign-shaped keys are selected (`brandkits/`, `screenshots/`, `projects/` and any other prefix are kept); dry run exit 3; `--yes` deletes exactly those keys; env and `minioadmin` exit 2.
- ✅ **AC-20 (removed routes and modules):** `removed-routes.test.ts` (7 routes); `removedModules.test.ts`.
- ✅ **AC-21 (wizard project step):** the projects wizard case (No project selected; a project preselects its kit and style; briefing read-only) and TC-PROJ-12 (the post page shows the project or "No project").
- ✅ **AC-22 (post page by tier):** TC-PERM-06/07 and TC-PROJ-12; the code gates every edit control on `canEdit`; Apply shows only when `canEdit && !inputsCurrent`.
  - ⚠️ No UI assertion that Retry (shown only on a failed draft) is absent for a non-author; it is gated on `canEdit`, and the route is covered by TC-PERM-01.
- ✅ **AC-23 (library, dashboard, nav):** TC-LIB-07 (project filter, card picker), TC-UI-08 (Projects KPI, "Project" column, no "Campaign" column); the nav has no Campaign entry (`AppShell.tsx`), backed by the wording guard (AC-28).
- ✅ **AC-24 (analytics):** `analyticsCoverage.test.ts` — one emitter each for `draft.project_changed` and `draft.inputs_applied`; no `campaign` in catalogue keys or fields; the retired lists are unchanged.
- ✅ **AC-25 (caps):** `projectLimits.test.ts` (200 projects → 409 `project-limit`; 5 documents → 400); E2E briefing-assistant 5-document cap.
  - ⚠️ The project cap is count-then-create, so two concurrent creates could overshoot by one (outside the AC).
- ✅ **AC-26 (agent tool):** `agentTools.test.ts` — `getBrandKitContext` takes no input and loads the run's kit by id and team; `kitResolverBoundary.test.ts`.
- ✅ **AC-27 (prompt versions):** `generationUntouched.test.ts` and `prompts.test.ts` pin `2026-11-01.1+ps<rev>`.
- ✅ **AC-28 (wording):** `uiWordingGuard.test.ts` holds `['campaign', /\bcampaigns?\b/i]`; its sample must hit and the UI scan is clean (the pattern was added by the orchestrator at T5).
- ✅ **AC-29 (gates):** local: tsc clean, lint 0 errors, build OK, unit 218 files / 4579 tests, full E2E mock 586/3/0/0. CI run 41246026617 on `7b279ed0` (HEAD with the verify test fixes): build, unit (4580), render harness (154), upgrade path and E2E (**588 passed, 3 skipped, 0 failed**) all success.
- ✅ **AC-30 (docs):** `docs/deploy.md` §10 and `docs/cold-start.md` (pg_dump, clear dry run and `--yes`, migrate, the resolve recovery, the sweep, the team-visibility line); `docs/mcp-acp-guide.md` (2.1.0, `projectId`, both codes); `docs/e2e-test-plan.md`; CLAUDE.md (precedence, tiers, PostContext, the 027 entry, the 038 state). README has no campaign mention.

## Test Results

- `npm run test:unit`: 218 files, 4579 tests passed (4580 with the AC-03 fixture case).
- `npm run lint`: 0 errors (7 pre-existing warnings). `npm run build`: success. `npx tsc --noEmit`: clean.
- `npm run test:upgrade` (local, independent run): scenarios 1–5 PASS, ALL PASS in 108.4 s.
- Full E2E mock run (T6 gate, fresh `ai_studio_test`): 586 passed, 3 skipped (TC-REG-H11a/b/c, intentional), 0 failed, 0 flaky. After the verify fixes, `post-permissions` and `projects`: 22 passed.
- CI run 41246026617 (`7b279ed0`): success — E2E 588 passed / 3 skipped / 0 failed (21.5 min); unit 4580; render harness 154; upgrade path ALL PASS.

## Issues Found

1. **Spec FR-03 names the tiers `view | assign | edit`; the code ships `view | edit | none`.** The behaviour matches the spec's intent (assign is any-member, so it checks `canView`). **Fix:** amend FR-03's wording, or rename the tiers; left for the user to decide.
2. **The project cap is not atomic** (count, then create). **Fix (optional):** serialise the create, or accept a soft cap.
3. **Design deviation, recorded:** the post page's Project block sits below Captions (design.md amended at T4; above Captions it broke 021 AC-12).

## Per-task reviews

- T1 — WARN(1) (FR-04 walk missing; fixed before commit)
- T2 — WARN(1) (NFR-07 one 404 body; fixed before commit)
- T3 — NOTE(4) (non-string MCP `projectId`; fixed before commit)
- T4 — WARN(1) (Project block placement; design amended)
- T5 — WARN(1) (AC-28 pattern missing; fixed before commit), NOTE (sweep key shape; taken)
- T6 — no review (docs; the full gate was run by the orchestrator)

## Summary

**Passed:** 30/30 criteria
**Failed:** 0/30 criteria
**Verdict:** PASS

## Verification

Command: gh run view 41246026617 --json conclusion
Exit: 0
Output (tail): success — e2e: success (588 passed, 3 skipped), build: success, unit: success (4580 passed)
