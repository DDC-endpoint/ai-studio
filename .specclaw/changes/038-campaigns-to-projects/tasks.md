# Tasks: Replace campaigns with projects

**Change:** 038-campaigns-to-projects
**Created:** 2026-10-31
**Total Tasks:** 6

## Summary

The tasks run in this order:

1. Access tiers.
2. Projects hold the briefing, documents and defaults (an additive migration).
3. A post's inputs come from its project and are recorded on the draft.
4. Assign, move and apply.
5. Drop campaigns behind a fail-closed migration.
6. Docs and the full gate.

Each task leaves `tsc`, lint and the unit suite green, so it commits on its own (NFR-04). The campaign models stay in `schema.prisma` until T5. Spec: `spec.md`; design: `design.md`.

**Rules for every task:**

- **Grep before you finish.** Every task that removes or renames a name, route, UI string or test id greps `src/`, `tests/` (including `tests/e2e/` and `tests/helpers/`) and `scripts/` for each one, and fixes every hit in the same task. 037's full run found six stale E2E assertions that its removal tasks missed. **The file lists below are the known hits, not a ceiling.**
- **Clear the dev cache.** A task that deletes a route or a page runs `rm -rf .next` before any E2E run, because a running `next dev` serves stale Turbopack and Tailwind output.
- **Write new E2E cases to these rules:**
  - A "no session" check sends a bogus `better-auth.session_token` cookie. Without a cookie, the proxy redirects to `/login` with a 200.
  - Compare object paths, not presigned URLs.
  - Create `page.waitForResponse` and `page.waitForEvent` before the action that triggers them.
- **Keep to the test databases.** No real model calls. Never run `npm run db:migrate` against the local `ai_studio` database (the user's data). Migrate only the `test:upgrade` scratch database and `ai_studio_test` (`npm run test:e2e:db -- --reset`). `.env.test` is gitignored and local only. Run `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **Read the design system first.** Any task that touches a page reads `docs/ui-reference/DESIGN_SYSTEM.md` first, and runs the token guard and the wording guard.

## Tasks

### Wave 1: access tiers

- [ ] `T1` — `canView` and `canEditPost`; every post route gets its tier; the view-only post page
  - Files: src/lib/authz/visibility.ts, src/lib/authz/postActionTiers.ts, src/lib/auth.ts, src/app/api/drafts/[id]/route.ts, src/app/api/drafts/[id]/apply-text/route.ts, src/app/api/drafts/[id]/download/route.ts, src/app/api/drafts/[id]/inline-edit/route.ts, src/app/api/drafts/[id]/refine/route.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/app/api/drafts/[id]/regenerate-design/route.ts, src/app/api/drafts/[id]/rejected/[revisionId]/adopt/route.ts, src/app/api/drafts/[id]/retry/route.ts, src/app/api/drafts/[id]/revisions/route.ts, src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts, src/app/api/generate/assemble-a/route.ts, src/app/api/generate/assemble-b/route.ts, src/app/api/generate/copy/route.ts, src/app/api/generate/image/route.ts, src/app/api/briefs/screenshots/route.ts, src/app/api/library/route.ts, src/app/(app)/page.tsx, src/app/(app)/drafts/[id]/page.tsx, src/components/drafts/ViewOnlyNote.tsx, src/lib/api-types.ts, src/mcp/systemUser.ts, tests/unit/visibility.test.ts, tests/unit/postActionTiers.test.ts, tests/unit/visibilityBoundary.test.ts, tests/unit/draftDetailGet.test.ts, tests/unit/applyTextRoute.test.ts, tests/e2e/post-permissions.test.ts, tests/e2e/team-isolation.test.ts, tests/e2e/library.test.ts, tests/e2e/ui.test.ts
  - Estimate: large
  - Kind: impl
  - Notes:
    - Covers D10, D11, FR-02, FR-03, FR-04, AC-01 to AC-04 and AC-22 (the view-only half; the Project picker comes in T4).
    - `draftVisibilityWhere` becomes `{ teamId }`. `canAccessContent` and `briefVisibilityWhere` are deleted. `getDraftAccessInfo` drops `campaignId`. Each route does a 404 check (`canView`) first, then a 403 `NOT_AUTHOR` check (`canEditPost`) for the edit tier (design §Access).
    - `DELETE /api/drafts/[id]` moves from `withTeamAdmin` to `withTeamAuth` + `canEditPost` (Q1 default). The brief-orphan sweep and the screenshot cleanup are unchanged.
    - The draft `GET` returns `canEdit`. The page hides refine, regenerate, edit, inline edit, retry, restore, adopt and delete when it is false, and shows `ViewOnlyNote`. Download and Copy stay.
    - `POST_ACTION_TIERS` has no entries for the T4 routes yet. T4 adds them.
    - `post-permissions.test.ts`: the admin makes a post; the team's editor gets 403 `not-author` on every edit route (AC-02), with the draft unchanged and the model-calls seam count unchanged (clear it first). The author, a team admin and a super admin succeed.
    - In `team-isolation.test.ts`, the "editor sees own + campaign-shared drafts" case now expects every team post to be visible to the editor.
    - The dashboard's "Drafts Ready" count becomes team-wide, through `draftVisibilityWhere`.

### Wave 2: projects hold the inputs

- [ ] `T2` — Additive migration; the briefing, documents and defaults move onto projects; the project page; the library `projectId` filter
  - Files: prisma/schema.prisma, prisma/migrations/20261101120000_project_inputs/migration.sql, prisma/rollback/038-project-inputs.down.sql, src/lib/projects/documents.ts, src/lib/projects/briefingAssistant.ts, src/lib/projects/limits.ts, src/lib/campaign/documents.ts, src/lib/campaign/briefingAssistant.ts, src/app/api/projects/route.ts, src/app/api/projects/[id]/route.ts, src/app/api/projects/[id]/briefing/route.ts, src/app/api/projects/[id]/briefing/[vid]/activate/route.ts, src/app/api/projects/[id]/briefing/chat/route.ts, src/app/api/projects/[id]/briefing/enhance/route.ts, src/app/api/projects/[id]/briefing/upgrade/route.ts, src/app/api/projects/[id]/documents/route.ts, src/app/api/projects/[id]/documents/[docId]/route.ts, src/app/api/campaigns/[id]/briefing/**, src/app/api/campaigns/[id]/documents/**, src/app/api/library/route.ts, src/app/api/admin/brandkits/[id]/artifacts/route.ts, src/app/api/admin/brandkits/[id]/documents/route.ts, src/app/api/admin/brandkits/[id]/assistant/chat/route.ts, src/app/api/admin/brandkits/[id]/prompts/generate/route.ts, src/app/api/admin/brandkits/[id]/prompts/improve/route.ts, src/app/api/admin/brandkits/[id]/prompts/upgrade/route.ts, src/app/api/briefs/enhance/route.ts, src/lib/brandkit/assistant.ts, src/lib/brandkit/documents.ts, src/lib/brandkit/templateFromImage.ts, src/lib/brandkit/voiceDraft.ts, src/lib/kitUpgrade/upgrade.ts, src/lib/testHooks.ts, src/lib/api-types.ts, src/components/projects/ProjectBriefingSection.tsx, src/components/projects/BriefingAssistantPanel.tsx, src/components/projects/classes.ts, src/components/projects/postStyleOptions.ts, src/components/campaigns/*, src/app/(app)/projects/page.tsx, src/app/(app)/projects/[id]/page.tsx, src/app/(app)/campaigns/[id]/page.tsx, src/app/(app)/library/page.tsx, src/components/library/LibraryCard.tsx, tests/unit/campaignDocuments.test.ts, tests/unit/projectDocuments.test.ts, tests/unit/campaignBriefing.test.ts, tests/unit/projectBriefing.test.ts, tests/unit/briefingAssistant.test.ts, tests/unit/briefingUpgradeRoute.test.ts, tests/unit/kitUpgradeRoute.test.ts, tests/unit/brandKitAssistant.test.ts, tests/unit/projectLimits.test.ts, tests/unit/projectDelete.test.ts, tests/unit/libraryRoute.test.ts, tests/unit/uiTokenGuard.test.ts, tests/e2e/briefing-assistant.test.ts, tests/e2e/briefing-upgrade.test.ts, tests/e2e/assistants-031.test.ts, tests/e2e/a11y.test.ts, tests/e2e/projects.test.ts, tests/helpers/ui.ts, scripts/capture-ui.mjs
  - Estimate: large
  - Depends: T1
  - Kind: migration
  - Notes:
    - Covers D1, D9, D15, D17, D18, FR-01, FR-05, FR-06, FR-16, FR-13 (the `projectId` filter only; the UI select comes in T4), AC-14 and AC-25.
    - **Migration.** Generate the DDL with `prisma migrate diff` from the edited schema (design §Migrations), then run `npx prisma generate` and `npm run test:e2e:db -- --reset`. `Campaign*` and `Brief.campaignId` stay.
    - **Module moves.** Move `src/lib/campaign/documents.ts` and `briefingAssistant.ts` to `src/lib/projects/` and re-point every importer (the brand-kit routes and libraries, `kitUpgrade/upgrade.ts`, `briefs/enhance`). `src/lib/campaign/briefing.ts` stays, because generation reads it until T3.
    - **Assistant context.** The project assistant's kit is `resolveBrandKit(teamId, undefined, project.defaultBrandKitId)`, which yields the project kit and then the team default on the current signature. T3 changes the signature.
    - **Routes.** Delete the campaign briefing and documents routes. The campaign detail page loses its briefing section (T5 deletes the rest of that page).
    - **Project API.** Projects gain `defaultPostStyle` (checked with `isStyleKey`) and `postCount` (`_count.briefs`). Create enforces `MAX_PROJECTS_PER_TEAM` (409 `project-limit`). Delete runs the D9 transaction and returns `{ unassigned }`.
    - **Document objects** use the `projects/<projectId>/` prefix.
    - **Project page.** Breadcrumb; section 01 is the briefing, with the assistant and documents; section 02 is Posts (the library route with `projectId`); the aside holds the defaults and the admin delete, whose confirmation names `postCount`.
    - **Move the E2E suites.** `briefing-assistant` and `briefing-upgrade` move onto `/api/projects/[id]/…` (the 5-document cap, editor 403, unknown project 404). `projects.test.ts` starts with the CRUD, defaults, cap, delete-unassign and cross-team 404 cases. Keep `mintCampaignFixture`'s callers working, or move them to a `mintProjectFixture`.
    - **Clear the dev cache:** `rm -rf .next` before E2E (routes deleted).

### Wave 3: a post's inputs come from its project

- [ ] `T3` — The project context, the stamp, one kit resolver, the post-style tier, the prompts, the agent tool, the wizard step, the brief route and `generate_post` 2.1.0
  - Files: src/lib/projects/inputs.ts, src/lib/projects/context.ts, src/lib/brandkit/resolve.ts, src/lib/campaign/briefing.ts, src/lib/agent/generateDraft.ts, src/lib/agent/briefInput.ts, src/lib/agent/pathA.ts, src/lib/agent/pathB.ts, src/lib/agent/background.ts, src/lib/agent/tools.ts, src/lib/agent/designAgent.ts, src/lib/agent/prompts/caption.ts, src/lib/agent/prompts/pathA.ts, src/lib/agent/prompts/pathB.ts, src/lib/agent/prompts/background.ts, src/lib/agent/prompts/shared.ts, src/lib/postStyles/resolve.ts, src/lib/postStyles/promptText.ts, src/lib/postStyles/types.ts, src/lib/postStyles/styles.ts, src/lib/designData/promptText.ts, src/lib/factsCheck/sources.ts, src/lib/factsCheck/refresh.ts, src/lib/drafts/factsCheckNotice.ts, src/lib/brief/wizardStyleState.ts, src/lib/brief/briefDraftPayload.ts, src/lib/models/catalogue.ts, src/providers/interfaces/CopyProvider.ts, src/app/api/briefs/route.ts, src/app/api/briefs/enhance/route.ts, src/app/api/generate/copy/route.ts, src/app/api/drafts/[id]/route.ts, src/app/api/drafts/[id]/refine/route.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/app/api/drafts/[id]/regenerate-design/route.ts, src/app/api/admin/look-probe/route.ts, src/app/api/campaigns/[id]/brandkit/route.ts, src/app/api/projects/[id]/briefing/upgrade/route.ts, src/lib/projects/briefingAssistant.ts, src/mcp/tools/generate.ts, src/mcp/server.ts, src/acp/agent.ts, src/app/api/acp/run/route.ts, src/components/brief/ProjectStep.tsx, src/components/brief/ProjectRow.tsx, src/components/brief/CampaignStep.tsx, src/components/brief/CampaignRow.tsx, src/components/brief/useBriefWizard.ts, src/components/brief/ContentStep.tsx, src/components/brief/SizeDesignStep.tsx, src/components/brief/ReviewStep.tsx, src/components/brief/types.ts, src/components/brief/constants.ts, src/app/(app)/brief/page.tsx, src/components/drafts/FactsCheckNotice.tsx, tests/unit/resolveBrandKit.test.ts, tests/unit/kitResolverBoundary.test.ts, tests/unit/postContext.test.ts, tests/unit/postContextSites.test.ts, tests/unit/generationInputs.test.ts, tests/unit/agentTools.test.ts, tests/unit/mcpGenerate.test.ts, tests/unit/acpManifest.test.ts, tests/unit/mcpGetDraft.test.ts, tests/unit/postStylesResolve.test.ts, tests/unit/postStylesWizard.test.ts, tests/unit/postStylesBoundary.test.ts, tests/unit/postStylesPrompts.test.ts, tests/unit/postStylesWriters.test.ts, tests/unit/prompts.test.ts, tests/unit/heroPrompts.test.ts, tests/unit/generationUntouched.test.ts, tests/unit/factsCheckRefresh.test.ts, tests/unit/briefDraftPayload.test.ts, tests/unit/captionRoutes.test.ts, tests/unit/captionWriters.test.ts, tests/unit/renderStamps.test.ts, tests/unit/analyticsGeneration.test.ts, tests/unit/fixtures/preStyleCases.ts, tests/e2e/resolution.test.ts, tests/e2e/post-styles.test.ts, tests/e2e/acp.test.ts, tests/e2e/surfaces.test.ts, tests/e2e/projects.test.ts, tests/e2e/brief-draft-recovery.test.ts, tests/e2e/create-post-button.test.ts, tests/helpers/ui.ts
  - Estimate: large
  - Depends: T2
  - Kind: impl
  - Notes:
    - Covers D3–D7, D12, D13, D20, FR-07, FR-08, FR-09, FR-12 (`inputs`, `brandKitName`), FR-14, FR-18, FR-20, AC-05 (brief, enhance, ACP), AC-06 to AC-10, AC-15, AC-21, AC-26 and AC-27.
    - **Resolver.** `resolveBrandKit(teamId, { brandKitId, projectId })` with sources `explicit | project | team`. Every caller moves to `context.ts`, except the look probe.
    - **Stamp.** `createPendingDraft` and `generateDraftForBrief` write `generationInputs`. Every existing-post reader uses `postContext(draft)`. `src/lib/campaign/briefing.ts` is deleted; generation no longer reads a campaign.
    - **Branded context.** `PostContext` is branded (design §Project context). `buildBriefInput`, `runPathADesign`, `runPathBDesign`, `generateBackgroundForBrief` and `loadFactsSources` take it. `BriefInput.campaignBriefing` becomes `projectBriefing`.
    - **Prompts.** The prompt text says "Project briefing". `PROMPT_VERSION_BASE` and `CAPTION_PROMPT_VERSION_BASE` become `2026-11-01.1`; update `generationUntouched.test.ts` and any test that pins either literal.
    - **Post style.** `resolvePostStyle`'s input `campaign` becomes `project`, and the note becomes `project-tone-ignored`.
    - **Brief route.** It takes `projectId` (D12, 404 `PROJECT_NOT_FOUND`) and refuses `campaignId` (400 `CAMPAIGN_RETIRED`). `briefs/enhance` takes `projectId`.
    - **Wizard.** `ProjectStep` replaces `CampaignStep`; choosing a project preselects its kit and style and shows its briefing read-only. Delete `/api/campaigns/[id]/brandkit` and its wizard query. The brief-draft payload uses `projectId`.
    - **Agent tool.** `getBrandKitContext` takes no input and uses the run's context kit (FR-20).
    - **MCP/ACP.** `projectId`, `CampaignRetiredError` (400) and `ProjectNotFoundError` (404), with version `2.1.0` in both. Grep `tests/e2e` for `2.0.0`: 037's TC-PS-29 pinned the manifest version.
    - **Rewritten E2E.** `resolution.test.ts` covers kit precedence through briefs with `projectId` and the draft `inputs`. `post-styles.test.ts` TC-PS-05/06 use the project default, and TC-PS-12 uses the project briefing and document (two projects in place of the two campaigns).
    - **Clear the dev cache:** `rm -rf .next` before E2E (a route is deleted).

### Wave 4: assign, move and apply

- [ ] `T4` — The assign route and the apply route with their events; the post page Project block; the library filter and card control; the dashboard
  - Files: src/app/api/drafts/[id]/project/route.ts, src/app/api/drafts/[id]/apply-project/route.ts, src/lib/authz/postActionTiers.ts, src/lib/analytics/catalogue.ts, src/app/api/drafts/[id]/route.ts, src/components/projects/ProjectPicker.tsx, src/app/(app)/drafts/[id]/page.tsx, src/app/(app)/library/page.tsx, src/components/library/LibraryCard.tsx, src/app/api/library/route.ts, src/app/(app)/page.tsx, src/components/dashboard/RecentDraftsCard.tsx, src/lib/api-types.ts, tests/unit/postActionTiers.test.ts, tests/unit/analyticsCoverage.test.ts, tests/unit/analyticsCatalogue.test.ts, tests/unit/applyProjectRoute.test.ts, tests/unit/assignProjectRoute.test.ts, tests/unit/libraryRoute.test.ts, tests/e2e/projects.test.ts, tests/e2e/post-permissions.test.ts, tests/e2e/library.test.ts, tests/e2e/ui.test.ts, tests/e2e/team-isolation.test.ts, tests/e2e/a11y.test.ts, scripts/capture-ui.mjs
  - Estimate: large
  - Depends: T3
  - Kind: impl
  - Notes:
    - Covers D8, D14, D21 (post page, library, dashboard), D22, FR-10, FR-11, FR-12 (`project`, `inputsCurrent`), FR-13 (the UI and the stamp-kit filter), FR-15, FR-17 (the dashboard), FR-19, AC-05 (assign, library), AC-11 to AC-13, AC-22 (the Project picker and Apply), AC-23 and AC-24.
    - **Assign route.** `PUT /api/drafts/[id]/project` (`canView`) writes `Brief.projectId` only and emits `draft.project_changed`. It is the only emitter, and a no-op emits nothing.
    - **Apply route.** `POST /api/drafts/[id]/apply-project` (`canEditPost`) does the compare-and-set on the stamp, recomputes the facts check, and emits `draft.inputs_applied`. It is the only emitter. Its 409 codes are `busy`, `no-change` and `changed`.
    - **Coverage.** Add both routes to `POST_ACTION_TIERS`.
    - **Draft `GET`.** It adds `project` and `inputsCurrent` (NFR-06: compared only when `EXPORTED` and idle).
    - **Library.** The kit filter switches to the stamp's `kitId`, falling back to `Brief.brandKitId` for a null stamp. The page gains a Project filter (all, no project, each project). `LibraryCard` shows the project and a `ProjectPicker`.
    - **Dashboard.** It gains a "Projects" KPI, and the recent-drafts column says "Project".
    - **`projects.test.ts`** gains AC-11 to AC-13 and the AC-21 UI case. `post-permissions.test.ts` gains the apply 403 and the picker visibility for a non-author.
    - **Wording.** The UI copy follows §12 ("Apply project settings", "No project"). Run the wording guard and the token guard.

### Wave 5: drop campaigns

- [ ] `T5` — Fail-closed drop migration, down script, clear and sweep scripts, upgrade scenario 5, seeds, and the rest of the campaign surface removed
  - Files: prisma/schema.prisma, prisma/migrations/20261101130000_drop_campaigns/migration.sql, prisma/rollback/038-drop-campaigns.down.sql, scripts/clear-campaign-data.mjs, scripts/lib/clearCampaigns.mjs, scripts/sweep-campaign-documents.mjs, scripts/lib/sweepCampaignDocs.mjs, scripts/test-upgrade-path.mjs, scripts/seed-teams.mjs, scripts/setup-test-db.mjs, scripts/capture-ui.mjs, scripts/check-folio-restore.mjs, src/app/api/campaigns/route.ts, src/app/api/campaigns/[id]/route.ts, src/app/(app)/campaigns/page.tsx, src/app/(app)/campaigns/[id]/page.tsx, src/components/campaigns/_, src/components/layout/AppShell.tsx, src/app/api/projects/route.ts, src/app/api/projects/[id]/route.ts, src/app/(app)/projects/page.tsx, src/lib/api-types.ts, src/lib/brief/briefDraftPayload.ts, src/lib/env.ts, src/components/ui/PageHead.tsx, tests/unit/clearCampaigns.test.ts, tests/unit/sweepCampaignDocs.test.ts, tests/unit/removedModules.test.ts, tests/unit/uiWordingGuard.test.ts, tests/e2e/removed-routes.test.ts, tests/e2e/team-isolation.test.ts, tests/e2e/surfaces.test.ts, tests/e2e/a11y.test.ts, tests/e2e/ui.test.ts, tests/e2e/auth.test.ts, tests/e2e/_, tests/helpers/ui.ts
  - Estimate: large
  - Depends: T4
  - Kind: migration
  - Notes:
    - Covers D18, D19, FR-17 (nav), FR-21, FR-22, FR-23, AC-16 to AC-20 and AC-28.
    - **Removals.**
      - Delete the campaign CRUD routes, the pages, `src/components/campaigns/` (what T2 did not move) and the nav entry.
      - Delete the `api-types` campaign types and the projects API's `campaigns` include and `_count.campaigns`.
      - Remove the models from `schema.prisma`, including the back-relations on `Project` and `BrandKit`.
    - **Wording guard.** `WORDING_PATTERNS` gains "campaign" → "project" (AC-28). Fix every UI string it finds.
    - **Migration.** Generate the DDL with `prisma migrate diff`, then put the precondition `DO` block first (design §Migrations). Down script: `prisma/rollback/038-drop-campaigns.down.sql`, schema only.
    - **Scripts.** Write the clear and sweep scripts with their pure planners in `scripts/lib/` (design §Operator scripts). Exit codes per FR-23.
    - **Upgrade scenario 5** is in design §Upgrade-path. Run `npm run test:upgrade` locally (Docker up; `export MSYS_NO_PATHCONV=1`).
    - **Seeds.** `seed-teams.mjs`: one project per team with a default kit, an unassigned post, and an assigned "`<Team>` Project Post". Update the `team-isolation` fixtures to match. `setup-test-db.mjs`'s comment says project.
    - **Removed routes.** `removed-routes.test.ts` gains the AC-20 routes. `removedModules.test.ts` forbids `@/lib/campaign` and `@/components/campaigns`.
    - **Then:**
      - `npx prisma generate`;
      - `npm run test:e2e:db -- --reset`;
      - `rm -rf .next`;
      - run the touched E2E files.
    - **Do not run** `npm run db:migrate` against `ai_studio`. That is the user's operator step.

### Wave 6: docs and the full gate

- [ ] `T6` — Docs, the full E2E mock run, push and CI
  - Files: CLAUDE.md, README.md, docs/deploy.md, docs/cold-start.md, docs/mcp-acp-guide.md, docs/e2e-test-plan.md, docs/ui-reference/DESIGN_SYSTEM.md, .github/workflows/e2e.yml, .env.example
  - Estimate: medium
  - Depends: T5
  - Kind: docs
  - Notes:
    - Covers FR-24, AC-29 and AC-30.
    - **`docs/deploy.md` and `docs/cold-start.md`** get the operator sequence:
      1. `pg_dump`;
      2. `clear-campaign-data.mjs` (the dry run, which prints the team-visible count);
      3. `--yes`;
      4. `npm run db:migrate`;
      5. the `migrate resolve --rolled-back` recovery, if the precondition fired first;
      6. `sweep-campaign-documents.mjs` (the dry run, then `--yes`).

      Add the line saying posts made before 038 become visible to the whole team.

    - **`CLAUDE.md`:**
      - Rewrite the "Brand kit precedence" entry (explicit → project default → team default; `resolveBrandKit` only through `src/lib/projects/context.ts`).
      - Rewrite the 027 entry: the precedence, the HOLD residue, and the facts-check sources (now the project briefing and documents from the draft's recorded inputs).
      - Add the access tiers (`canView` and `canEditPost`, the principle, `postActionTiers.test.ts`), the `PostContext` rule for new generation calls, and the 038 state entry.
      - Point "Pick up here" at verify 038.
    - **The other docs:**
      - `docs/mcp-acp-guide.md`: `projectId`, `CAMPAIGN_RETIRED`, `PROJECT_NOT_FOUND`, 2.1.0.
      - `docs/e2e-test-plan.md`: `post-permissions` and `projects`, plus the moved suites.
      - `DESIGN_SYSTEM.md`: module names, and §12 "project".
      - The `e2e.yml` comment.
    - **Run the full mock suite:**
      1. `npm run test:e2e:db -- --reset`
      2. `rm -rf .next`
      3. `npm run test:e2e:serve`
      4. `npm run test:e2e:mock`

      Fix stale assertions in this task and re-run the affected files.

    - **Push.** Before pushing, check that `git remote get-url origin` prints `https://github.com/DDC-endpoint/ai-studio.git`, and stop if it names another repo. Push `v2`, then check `gh run list --branch v2`.

## Legend

- Waves run in order. Every task is its own wave, because each one edits files the next one edits.
- `Kind` hints the implementer's role. The orchestrator runs `tsc`, lint and unit and commits after each task (`CLAUDE.md`, Working rules).
