# Tasks: One general caption, curated channel captions on demand

**Change:** 039-general-and-curated-captions
**Created:** 2026-11-01
**Total Tasks:** 6

## Summary

The tasks run in this order:

1. Caption identity: the additive `caption_kind` migration, the registry and its guard, the rules data, and the store re-keyed. No behaviour changes.
2. The general caption: the generation contract, old posts, the caption route's general target, the draft `GET` shape, `Brief.channels` deprecated, and MCP/ACP `2.2.0`.
3. Curated captions: curate, the general caption as input, the rate limit, and the edit, delete and undo routes, with one-step undo.
4. Facebook and the kit website: two migrations, the link insertion and the rules.
5. Events and Insights: `caption.copied`, `CaptionKind` coverage, and the Captions section.
6. Docs and the full gate.

Each task leaves `tsc`, lint and the unit suite green, so it commits on its own (NFR-04). T1 and T2 are slice 1, and T3 and T4 are slice 2 (spec D28). Spec: `spec.md`; design: `design.md`. Questions Q1 to Q3 are planned at their recommended defaults. If the user answers otherwise before T2 (Q2) or T4 (Q3), the task notes say what changes.

**Rules for every task:**

- **Grep before you finish.** Every task that removes or renames a name, route, UI string, test id or field greps `src/`, `tests/` (including `tests/e2e/` and `tests/helpers/`) and `scripts/` for each one, and fixes every hit in the same task. **The file lists below are the known hits, not a ceiling** (038 L35: 34 files were outside every task list, 25 of them unit-test mocks). When a shared export's signature or a row shape changes, grep `tests/unit` for that export and fix every mock.
- **Guard tests fail on their fixture.** For every guard AC, quote the AC's **bold** failing-fixture clause in the task report. Then show that the guard fails on that fixture, by a test case that asserts the failure. A purity test, a sample entry or a single route does not stand in for the guard (038 L36).
- **Clear the dev cache.** A task that adds or deletes a route or a page runs `rm -rf .next` before any E2E run.
- **Stop the server properly.** After every E2E run, kill the whole `next start-server.js` process tree you started (`taskkill /T /F /PID <pid>`, or `Stop-Process` on its pids). Then confirm that no `start-server.js` process of yours remains. Stopping `npm run test:e2e:serve` kills only the npm wrapper (038 L37).
- **Write new E2E cases to these rules:**
  - A "no session" check sends a bogus `better-auth.session_token` cookie.
  - Compare object paths, not presigned URLs.
  - Create `page.waitForResponse` and `page.waitForEvent` before the action that triggers them.
  - A test that sets the caption-limit seam clears it in `finally`.
- **Keep to the test databases.** No real model calls. Never run `npm run db:migrate` against the local `ai_studio` database (the user's data). Migrate only the `test:upgrade` scratch database and `ai_studio_test` (`npm run test:e2e:db -- --reset`). `.env.test` is gitignored and local only. Run `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **Read the design system first.** Any task that touches a page reads `docs/ui-reference/DESIGN_SYSTEM.md` (§8 and §12) first, and runs the token guard and the wording guard.

## Tasks

### Wave 1: caption identity

- [x] `T1` — The `caption_kind` migration, its down section and upgrade scenario 6; the registry with the general entry, the rules data, the pure rules module and the registry guard; `FACT_WHERE`, the labels and the token budget derived; the store re-keyed on `(kind, channel)`. No behaviour change.
  - Files: prisma/schema.prisma, prisma/migrations/20261102120000_caption_kind/migration.sql, prisma/rollback/039-general-and-curated-captions.down.sql, scripts/test-upgrade-path.mjs, src/lib/channels.ts, src/lib/captions/rules.ts, src/lib/captions/undo.ts, src/lib/captions/store.ts, src/lib/captions/actionTargets.ts, src/lib/captions/extract.ts, src/lib/captions/generate.ts, src/lib/captions/requests.ts, src/lib/agent/prompts/caption.ts, src/lib/agent/generateDraft.ts, src/lib/factsCheck/types.ts, src/lib/factsCheck/refresh.ts, src/lib/drafts/factsCheckNotice.ts, src/lib/models/resolve.ts, src/lib/testHooks.ts, src/app/api/drafts/[id]/retry/route.ts, src/app/api/drafts/[id]/route.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/mcp/tools/generate.ts, src/providers/implementations/copy/anthropic.ts, src/providers/implementations/copy/openai.ts, tests/unit/channels.test.ts, tests/unit/captionRegistryGuard.test.ts, tests/unit/captionRules.test.ts, tests/unit/captionUndo.test.ts, tests/unit/captionStore.test.ts, tests/unit/captionExtract.test.ts, tests/unit/captionActionTargets.test.ts, tests/unit/captionWriters.test.ts, tests/unit/captionRoutes.test.ts, tests/unit/captionRouteStamp.test.ts, tests/unit/regenerateStamp.test.ts, tests/unit/factsCheckNotice.test.ts, tests/unit/factsCheckRefresh.test.ts, tests/unit/prompts.test.ts, tests/unit/anthropicCall.test.ts, tests/e2e/captions.test.ts, tests/e2e/model-selection.test.ts
  - Estimate: large
  - Kind: migration
  - Notes:
    - New files: prisma/migrations/20261102120000_caption_kind/migration.sql, prisma/rollback/039-general-and-curated-captions.down.sql, src/lib/captions/rules.ts, src/lib/captions/undo.ts, tests/unit/captionRegistryGuard.test.ts, tests/unit/captionRules.test.ts, tests/unit/captionUndo.test.ts.
    - Covers D1 to D4, D7, D8 (data and the check, not the prompt text), FR-01, FR-02 (no deletions yet), FR-03, FR-04 (no Facebook), AC-01 (scenario 6, the `caption_kind` half), AC-02, AC-03, and AC-25 (§C and the precondition, without Facebook or the website).
    - **Migration.** Generate the base DDL with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`, then add the partial indexes and the CHECKs by hand (design §Identity). Then:
      1. run `npx prisma generate`;
      2. run `npm run test:upgrade`: scenarios 1 to 6 must pass, and scenario 6 ends in `migrate diff --exit-code` = 0;
      3. run `npm run test:e2e:db -- --reset`.

      **If the diff reports the partial indexes, stop and report.** Do not switch to the `NULLS NOT DISTINCT` fallback without the orchestrator.

    - **Registry.** `CAPTION_REGISTRY` holds `GENERAL`, `INSTAGRAM` and `LINKEDIN`. Facebook comes in T4.
      - `GENERATION_TARGETS` stays `['HEADLINE', 'INSTAGRAM', 'LINKEDIN']`, written out, with a `039 T2 switches this` comment.
      - `PUBLISHABLE_CHANNELS`, `CHANNEL_VALUES` and `isPublishableChannel` stay until T2 removes their last callers.
      - The prompt text is unchanged: the `brief` strings stay, and `rulesPromptText` exists but is not called until T2.
    - **Store.**
      - Every query names `kind: 'CURATED'` for the rows written today.
      - Generation, `createPendingDraft` and retry create `{ kind: 'CURATED', channel }` rows.
      - `loadDraftCaptions` keeps its `{ captions: CaptionRow[] }` shape. It still fills the missing Instagram and LinkedIn rows, as `CURATED`. T2 changes the shape to `{ general, curated }` and removes the fill, together with every caller.
      - `CaptionRow` gains `kind`, `target`, `deleted` and `canUndo`. This is additive. `channel` becomes `Channel | null` in the type, so fix the type ripples in the known callers (below) without changing their behaviour.
      - `settleCaptionRow` and the edit start writing `previous` (design §Store). Undo and delete come in T3.
      - `refreshFactsCheck` uses `row.target` as `where`. It reads the new loader shape in T2.
      - The AC-15 static guard is added now, with its failing fixture.
    - **Budget.** `captionMaxTokens(targets)` replaces `CAPTION_MAX_TOKENS` in both providers.
    - **E2E `tsc` fix only.** Rewrite the eight `draftId_channel` lookups (`captions.test.ts:183,209,500,521` and `model-selection.test.ts:350,389,1049,1149`) to `findFirstOrThrow({ where: { draftId, kind: 'CURATED', channel } })`. No E2E behaviour changes, so run only `captions` and `model-selection` against a reset test DB to confirm.
    - **Down script.** Write the header, the precondition (general, Facebook as text, deleted) and §C. Scenario 6 runs it refused, then with the flag, then redeploys.

### Wave 2: the general caption (slice 1)

- [x] `T2` — Generation writes the headline and the general caption; old posts get "Generate general caption"; the caption route takes `{ kind: 'GENERAL' }` and refuses `{}`; the draft `GET` and the caption desk take the new shape; `Brief.channels` is deprecated; MCP and ACP move to `2.2.0` with the open list.
  - Files: src/lib/channels.ts, src/lib/captions/store.ts, src/lib/captions/generate.ts, src/lib/captions/requests.ts, src/lib/captions/extract.ts, src/lib/captions/external.ts, src/lib/agent/prompts/caption.ts, src/lib/agent/prompts/shared.ts, src/lib/agent/prompts/pathB.ts, src/lib/agent/pathB.ts, src/lib/agent/briefInput.ts, src/lib/agent/generateDraft.ts, src/lib/factsCheck/refresh.ts, src/lib/drafts/factsCheckNotice.ts, src/lib/drafts/detail.ts, src/lib/analytics/catalogue.ts, src/lib/testHooks.ts, src/providers/interfaces/CopyProvider.ts, src/providers/registry.ts, src/app/api/drafts/[id]/route.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/app/api/drafts/[id]/retry/route.ts, src/app/api/generate/copy/route.ts, src/app/api/briefs/route.ts, src/mcp/tools/generate.ts, src/mcp/server.ts, src/acp/agent.ts, src/app/api/acp/run/route.ts, src/app/(app)/drafts/[id]/page.tsx, src/app/(app)/page.tsx, src/components/dashboard/RecentDraftsCard.tsx, src/components/drafts/CaptionPanels.tsx, src/components/drafts/CaptionPanel.tsx, src/components/brief/useBriefWizard.ts, src/components/brief/constants.ts, src/lib/api-types.ts, prisma/schema.prisma, scripts/seed-teams.mjs, tests/unit/briefChannelsDeprecated.test.ts, tests/unit/channels.test.ts, tests/unit/captionStore.test.ts, tests/unit/captionRequests.test.ts, tests/unit/captionRoutes.test.ts, tests/unit/captionRouteStamp.test.ts, tests/unit/captionWriters.test.ts, tests/unit/captionExtract.test.ts, tests/unit/regenerateStamp.test.ts, tests/unit/modelRequests.test.ts, tests/unit/draftDetailGet.test.ts, tests/unit/mcpGenerate.test.ts, tests/unit/mcpGetDraft.test.ts, tests/unit/acpManifest.test.ts, tests/unit/analyticsCoverage.test.ts, tests/unit/analyticsCatalogue.test.ts, tests/unit/analyticsRevisions.test.ts, tests/unit/analyticsEventsRoute.test.ts, tests/unit/prompts.test.ts, tests/unit/promptBriefing.test.ts, tests/unit/postStylesPrompts.test.ts, tests/unit/postStylesWriters.test.ts, tests/unit/heroPrompts.test.ts, tests/unit/heroSeams.test.ts, tests/unit/compositeGeneration.test.ts, tests/unit/anthropicCall.test.ts, tests/unit/claudeCliArgs.test.ts, tests/unit/copyProviderCliMode.test.ts, tests/unit/actionHeartbeats.test.ts, tests/unit/modelBoundary.test.ts, tests/unit/generationUntouched.test.ts, tests/unit/factsCheckRefresh.test.ts, tests/unit/factsCheckNotice.test.ts, tests/unit/testHooks.test.ts, tests/e2e/captions.test.ts, tests/e2e/caption-route.test.ts, tests/e2e/model-selection.test.ts, tests/e2e/post-styles.test.ts, tests/e2e/async-actions.test.ts, tests/e2e/team-isolation.test.ts, tests/e2e/path-a.test.ts, tests/e2e/path-b.test.ts, tests/e2e/settle-race.test.ts, tests/e2e/acp.test.ts, tests/e2e/surfaces.test.ts, tests/e2e/download.test.ts, tests/e2e/agui-refinement.test.ts, tests/e2e/headline-badge.test.ts, tests/e2e/analytics.test.ts, tests/e2e/post-permissions.test.ts, tests/e2e/projects.test.ts, tests/e2e/resolution.test.ts, tests/e2e/create-post-button.test.ts, tests/e2e/a11y.test.ts, tests/e2e/library.test.ts, tests/e2e/ui.test.ts, tests/helpers/ui.ts, tests/helpers/api.ts
  - Estimate: large
  - Depends: T1
  - Kind: impl
  - Notes:
    - New files: src/lib/captions/external.ts, src/lib/drafts/detail.ts, tests/unit/briefChannelsDeprecated.test.ts.
    - Covers D10, D11, D12 (the general target and `{}` retired), D13 (the general ref), D18 (the T2 prompt changes; versions `2026-11-02.1`), D19 (texts and labels), D20, D21, D22 (`captionKind` on `draft_action.settled`, and `CaptionKind` coverage), FR-02 (the deletions), FR-05 (no auto-create; the claim creates `GENERAL`), FR-06, FR-07, FR-08 (minus curate and the limit), FR-11, FR-12, FR-15, FR-16 (the general panel and the old-post button), FR-17, FR-18, and FR-21 (`__DROP_CAPTION_GENERAL__`, `general`).
    - It also covers AC-03 (rest), AC-04 to AC-07, AC-20, AC-21 (the `captionKind` and `CaptionKind` half), AC-24 (minus the curate and Facebook clauses), AC-27, and AC-28 (rewritten suites).
    - **Generation.**
      - `GENERATION_TARGETS = ['HEADLINE', 'GENERAL']`.
      - `createPendingDraft` creates one `GENERAL` `PENDING` row.
      - Retry resets or creates it. Old curated rows are left as they are.
      - The failure path is scoped to `kind: 'GENERAL'`.
      - The sync path's `checkTexts` reads the registry.
      - The `generate/copy` preview returns `{ kind, channel, … }` items.
    - **Loader.** `loadDraftCaptions` creates nothing. `claimCaptionAction` creates a missing `GENERAL` row inside the claim, and returns `created`.
    - **Route.** `parseRegenerateBody` accepts `{ kind: 'GENERAL' }`, `{ channel }` (existing rows only until T3; a missing row is 404 `caption-not-found`) and `{ headline: true }`. `{}` is 400 (Q2 default; if the user keeps "Regenerate all", `{}` becomes the general caption plus the live curated captions). The trace carries `captionKind` and `channel`.
    - **Draft `GET`.**
      - The FR-15 shape: `rules` uses the T1 registry (no Facebook), and `facts` uses `captionFactsFor`.
      - `kitWebsite` is null until T4.
      - `brief.channels` is removed.
      - `loadDraft` moves to `src/lib/drafts/detail.ts`.
    - **UI.**
      - The general panel, or "Generate general caption" when `general` is null and the post is `EXPORTED` (edit tier).
      - Old curated rows render as cards.
      - "Regenerate all" and its picker are removed. So are the client caption undo (`useUndoableAction` in `CaptionPanel`) and `CaptionUndoHandle`. Server Undo comes in T3. Until then a card shows no Undo.
      - The dashboard's Channels column goes, and so does the draft header's channel list.
    - **`Brief.channels`.**
      - Every writer and reader in spec D21 stops. The schema comment is added.
      - `briefChannelsDeprecated.test.ts` has both **bold** fixtures, and each one fails.
      - `PUBLISHABLE_CHANNELS`, `CHANNEL_VALUES`, `isPublishableChannel` and `DEFAULT_CHANNELS` are deleted.
      - The E2E brief bodies that send `channels` are left as they are: they prove "ignored".
    - **MCP and ACP.**
      - `externalCaptions` is used by `generatePost` and `getDraft`.
      - The manifest output schema matches (the `mcpGetDraft.test.ts` key-set drift check).
      - `channels` is out of both input schemas and validations.
      - `2.2.0` in `src/acp/agent.ts` and `src/mcp/server.ts`. Grep `tests/` for `2.1.0`: 038's version pins exist.
    - **Prompts.** The generation prompt asks for `headline` and `general` with `rulesPromptText`. The Path B "Channels:" line goes. `PROMPT_VERSION_BASE` and `CAPTION_PROMPT_VERSION_BASE` become `2026-11-02.1`. Update `generationUntouched.test.ts` and any test that pins either literal.
    - **E2E retarget.**
      - In the list above, every assertion on `INSTAGRAM` or `LINKEDIN` rows of a newly generated post becomes the `GENERAL` row (`grep -c "INSTAGRAM\|LINKEDIN\|captions\[" tests/e2e`).
      - `captions.test.ts` §W gets TC-CAP-23 to TC-CAP-26 (AC-04 to AC-07). Its Instagram and LinkedIn generation cases are retargeted or replaced, and its "Regenerate all" case is removed.
      - `model-selection.test.ts` loses TC-MODEL-07, and its per-caption cases target the general caption.
      - `surfaces.test.ts`'s picker and button lists lose "All captions model" and "Regenerate all".
      - `post-permissions.test.ts` and `projects.test.ts` regenerate the general caption.
    - **Then:**
      1. run `npm run test:e2e:db -- --reset`;
      2. run `rm -rf .next`;
      3. start `npm run test:e2e:serve`;
      4. run every E2E file in the list;
      5. kill the server tree.

      The full suite runs in T6, but a green list here is the T2 bar.

### Wave 3: curated captions (slice 2)

- [x] `T3` — Curate (create a curated row), the general caption as input and `generalHash`, the per-user rate limit and its seam, edit with `previous`, the delete and undo routes and their tiers, and the caption desk's Curate, Delete and Undo with its rules and facts lines.
  - Files: src/lib/api/windowLimiter.ts, src/lib/analytics/rateLimit.ts, src/lib/captions/limits.ts, src/lib/captions/generalHash.ts, src/lib/captions/store.ts, src/lib/captions/requests.ts, src/lib/captions/actionTargets.ts, src/lib/agent/prompts/caption.ts, src/lib/drafts/factsCheckNotice.ts, src/lib/analytics/catalogue.ts, src/lib/authz/postActionTiers.ts, src/lib/testHooks.ts, src/lib/api-types.ts, src/providers/interfaces/CopyProvider.ts, src/providers/registry.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/app/api/drafts/[id]/route.ts, src/app/api/drafts/[id]/captions/route.ts, src/app/api/drafts/[id]/captions/undo/route.ts, src/app/api/test/caption-limit/route.ts, src/components/drafts/CaptionPanels.tsx, src/components/drafts/CaptionPanel.tsx, tests/unit/captionRateLimit.test.ts, tests/unit/factsSourcesBoundary.test.ts, tests/unit/analyticsRateLimit.test.ts, tests/unit/captionStore.test.ts, tests/unit/captionUndo.test.ts, tests/unit/captionActionTargets.test.ts, tests/unit/captionRequests.test.ts, tests/unit/captionRoutes.test.ts, tests/unit/captionWriters.test.ts, tests/unit/postActionTiers.test.ts, tests/unit/visibilityBoundary.test.ts, tests/unit/prompts.test.ts, tests/unit/generationUntouched.test.ts, tests/unit/testHooks.test.ts, tests/unit/draftDetailGet.test.ts, tests/unit/analyticsCoverage.test.ts, tests/e2e/curated-captions.test.ts, tests/e2e/post-permissions.test.ts, tests/helpers/api.ts, tests/helpers/db.ts, scripts/capture-ui.mjs
  - Estimate: large
  - Depends: T2
  - Kind: impl
  - Notes:
    - New files: src/lib/api/windowLimiter.ts, src/lib/captions/limits.ts, src/lib/captions/generalHash.ts, src/app/api/drafts/[id]/captions/route.ts, src/app/api/drafts/[id]/captions/undo/route.ts, src/app/api/test/caption-limit/route.ts, tests/unit/captionRateLimit.test.ts, tests/unit/factsSourcesBoundary.test.ts, tests/e2e/curated-captions.test.ts.
    - Covers D4 (`generalHash`), D12 (curate), D13 to D16, D18 (the curate section; `CAPTION_PROMPT_VERSION_BASE` `2026-11-02.2`), D19 (the flagged-general line, the card facts, and the sources boundary), D22 (`captionOp`), D25, FR-05 (delete and undo), FR-08 (curate and the limit), FR-09, FR-10, FR-16 (curated section), and FR-21 (`[from general]`, `__FAIL_CURATED__`, the limit seam).
    - It also covers AC-08 to AC-16, AC-23 (minus Facebook), and AC-24 (the curate clauses).
    - **Curate.**
      - `{ channel }` on a missing row creates it in the claim (`captionOp: 'create'`).
      - The general caption (`READY`, not deleted) is passed as `BriefInput.generalCaption`, fenced in the prompt, and its `generalHashOf` is stored on the settle.
      - With no general caption, nothing is passed and the hash is null (D11).
    - **Rate limit.**
      - Extract `createWindowLimiter`. `analyticsRateLimit.test.ts` must pass unchanged.
      - The caption limiter runs before the claim.
      - The seam `POST /api/test/caption-limit` answers 404 without `MOCK_AI` and 403 to a non-admin. It stores the override on `globalThis`.
    - **Delete and undo.** These are the two route files in design §Delete and undo, each edit tier, plus their `POST_ACTION_TIERS` entries. `PATCH` takes `{ kind: 'GENERAL', text }` and answers `caption-deleted` and `caption-not-found`.
    - **Guards.**
      - `factsSourcesBoundary.test.ts`: the **bold** fixture import must fail.
      - `postActionTiers.test.ts`: the existing no-entry fixture still fails.
      - `visibilityBoundary.test.ts`: the new route files import `@/lib/authz/visibility`.
    - **UI.** The design §Draft GET layout:
      - the flagged-general line;
      - the "Curate for …" buttons (edit tier; a live row hides its button);
      - curated cards with Copy, Regenerate (the card's model picker), Delete and server Undo;
      - a deleted card with "Deleted" and Undo;
      - the rules and facts lines under each field.

      The general panel gains server Undo. The wording follows §12 ("General caption", "Curate for Instagram").

    - **E2E.**
      - `curated-captions.test.ts` (§AN): TC-CUR-01 to 07 and TC-CUR-12, for Instagram and LinkedIn.
      - `post-permissions.test.ts` TC-PERM-08 and the AC-23 view-only clause.
      - A `tests/helpers/db.ts` helper sets a brief's topic, for TC-CUR-02 and TC-CUR-10 in T4.
    - **Then:**
      1. run `rm -rf .next` (routes added);
      2. run `npm run test:e2e:db -- --reset`;
      3. serve;
      4. run `curated-captions`, `post-permissions`, `captions` and `analytics`;
      5. kill the server tree.

### Wave 4: Facebook and the kit website

- [x] `T4` — The `channel_facebook` and `kit_website` migrations and their down sections; scenario 6 extended; the Facebook registry entry, the link refusal and the composer; `parseKitWebsite`, the kit API and the kit page; the Facebook curate with its no-website line.
  - Files: prisma/schema.prisma, prisma/migrations/20261102130000_channel_facebook/migration.sql, prisma/migrations/20261102140000_kit_website/migration.sql, prisma/rollback/039-general-and-curated-captions.down.sql, scripts/test-upgrade-path.mjs, src/lib/channels.ts, src/lib/captions/rules.ts, src/lib/captions/extract.ts, src/lib/captions/store.ts, src/lib/agent/prompts/caption.ts, src/lib/brandkit/website.ts, src/lib/brandkit/resolve.ts, src/lib/drafts/detail.ts, src/lib/testHooks.ts, src/lib/api-types.ts, src/app/api/admin/brandkits/[id]/route.ts, src/app/api/drafts/[id]/regenerate-copy/route.ts, src/components/admin/brandkits/KitDetail.tsx, src/components/drafts/CaptionPanels.tsx, src/components/drafts/CaptionPanel.tsx, tests/unit/kitWebsite.test.ts, tests/unit/captionRules.test.ts, tests/unit/captionExtract.test.ts, tests/unit/captionRegistryGuard.test.ts, tests/unit/channels.test.ts, tests/unit/prompts.test.ts, tests/unit/generationUntouched.test.ts, tests/unit/resolveBrandKit.test.ts, tests/unit/fontsRoute.test.ts, tests/unit/testHooks.test.ts, tests/unit/acpManifest.test.ts, tests/unit/factsCheckNotice.test.ts, tests/unit/draftDetailGet.test.ts, tests/e2e/curated-captions.test.ts, tests/e2e/brand-kit.test.ts
  - Estimate: large
  - Depends: T3
  - Kind: migration
  - Notes:
    - New files: prisma/migrations/20261102130000_channel_facebook/migration.sql, prisma/migrations/20261102140000_kit_website/migration.sql, src/lib/brandkit/website.ts, tests/unit/kitWebsite.test.ts.
    - Covers D5, D6, D8 (the Facebook row), D9, D17, D18 (Facebook lines; `CAPTION_PROMPT_VERSION_BASE` `2026-11-02.3`), D24 (§A, §B and the website count), FR-13, FR-14, FR-15 (`kitWebsite`), FR-21 (the Facebook sentinels and the default body), AC-01 (the Facebook and website half of scenario 6), AC-17 to AC-19, AC-23 (the Facebook button and the line), and AC-25 (in full).
    - **Migrations.**
      - `channel_facebook` holds the one `ADD VALUE IF NOT EXISTS` line, by hand. `kit_website` comes from `migrate diff`.
      - Then run `npx prisma generate`, `npm run test:upgrade` (scenario 6 now inserts a Facebook row and a kit website, and checks AC-25 in full) and `npm run test:e2e:db -- --reset`.
    - **Registry.**
      - The Facebook entry (D8). The guard now passes with `FACEBOOK` in both.
      - Add a guard case: removing the entry from the registry fixture yields `Channel:FACEBOOK`.
      - The manifest's channel enum is derived, so `acpManifest.test.ts` changes only its expectation.
    - **Extraction and composition.**
      - The extractor refuses a Facebook field with a link (`link-in-reply`).
      - The settle composes the stored text with `composeFacebookCaption(field.text, ctx.kit?.website)`. The route passes `website` from `postContext(draft)`.
      - `ResolvedBrandKit.website` is selected in `resolveBrandKit`.
    - **Kit.**
      - `PATCH` takes `website`. A bad value is 400 `website must be an https URL`, and `null` clears it.
      - `GET` returns it.
      - `KitDetail` adds a "Website" row: shown to every reader, editable by admins in edit mode. Read DESIGN_SYSTEM §8 for the form row. The wording is "Website".
    - **UI.** The "Curate for Facebook" button. The no-website line under it and on the Facebook card, when `kitWebsite` is null. The rules line "Facebook asks for 40 to 120 words. This has N."
    - **Q3.** If the user picks "refuse", move `words-under`, `words-over` and `hashtags-over` for Facebook into the extractor's refusals, and change TC-CUR-11 to expect a `FAILED` first curate.
    - **E2E.** `curated-captions` TC-CUR-08 to 11. `brand-kit` TC-BK-30 and 31.
    - **Then:**
      1. run `rm -rf .next`;
      2. run `npm run test:e2e:db -- --reset`;
      3. serve;
      4. run `curated-captions`, `brand-kit`, `captions` and `acp`;
      5. kill the server tree.

### Wave 5: events and Insights

- [x] `T5` — `caption.copied` through `/api/events`, with the team check, the registry check and the 10 s dedupe; `sendCaptionCopied` on every Copy; `CaptionKind` coverage completed; the Insights "Captions" section.
  - Files: src/lib/analytics/catalogue.ts, src/lib/analytics/client.ts, src/lib/analytics/queries.ts, src/app/api/events/route.ts, src/components/drafts/CaptionPanel.tsx, src/components/admin/insights/sections.tsx, src/app/(app)/admin/insights/page.tsx, tests/unit/analyticsCoverage.test.ts, tests/unit/analyticsCatalogue.test.ts, tests/unit/analyticsEventsRoute.test.ts, tests/unit/analyticsQueries.test.ts, tests/unit/visibilityBoundary.test.ts, tests/e2e/analytics.test.ts
  - Estimate: medium
  - Depends: T4
  - Kind: impl
  - Notes:
    - Covers D22 and D23, FR-19 and FR-20, AC-21 and AC-22.
    - **Catalogue.**
      - `caption.copied` (design §Events), with `kind` and `channel` from the imported enums and a registry refine.
      - `CLIENT_EVENTS` gains it.
      - `analyticsCoverage.test.ts`: `caption.copied` has exactly one emitter file (`src/app/api/events/route.ts`). Keep the "copies no owned vocabulary" fixture failing.
    - **Events route.**
      - A per-name dispatcher: `wizard.step` is unchanged.
      - `caption.copied` reads the body's top-level `draftId`, runs `canView` (404, nothing written), the registry check (400) and the dedupe window (204, counted as dropped).
      - The 60-per-minute window still applies first.
    - **Client.** `sendCaptionCopied(draftId, kind, channel)` is fire-and-forget. `CaptionPanel` calls it after a successful `navigator.clipboard.writeText`.
    - **Insights.** `captions(range)`, `shapeCaptions` and `CaptionsSection`, with the column "Copied (client-reported)" and no chart. Super admin only, as the page is.
    - **E2E.** `analytics.test.ts` TC-OBS-32 to 34. Extend TC-OBS-22 (no text in any event) over the new events.
    - **Then:** serve, run `analytics`, then kill the server tree.

### Wave 6: docs and the full gate

- [x] `T6` — Docs, the full E2E mock run, push and CI.
  - Files: CLAUDE.md, README.md, docs/deploy.md, docs/cold-start.md, docs/mcp-acp-guide.md, docs/e2e-test-plan.md, docs/ui-reference/DESIGN_SYSTEM.md, .github/workflows/e2e.yml
  - Estimate: medium
  - Depends: T5
  - Kind: docs
  - Notes:
    - Covers FR-22, AC-26, AC-28 and AC-29.
    - **`CLAUDE.md`:**
      - Rewrite the "Caption registry (026)" entry as the 039 registry:
        - kinds;
        - the partial unique indexes;
        - `FACT_WHERE` and the budget derived;
        - the guard;
        - `loadDraftCaptions` as the one reader;
        - `refreshAfterWrite` on every writer;
        - one-step undo;
        - soft delete.
      - "Caption route (024)": curated rows are stamped the same way.
      - "Analytics (006)": `caption.copied` (`/api/events`, one emitter), and `captionKind` and `captionOp` on `draft_action.settled`.
      - "Post styles (027)": the facts check covers the general caption and live curated captions; its sources are never a caption.
      - MCP/ACP `2.2.0`.
      - The 039 state entry, and "Pick up here" pointing at verify 039.
    - **`docs/mcp-acp-guide.md`:**
      - the D20 JSON shape;
      - the old-post case;
      - "treat `facts.status` `flagged` or `error` as needing review";
      - `channels` ignored;
      - `2.2.0`.
    - **`docs/e2e-test-plan.md`:**
      - §W rewritten (TC-CAP-23 to 26; the removed Regenerate-all case);
      - the new §AN `curated-captions` (TC-CUR-01 to 12);
      - TC-BK-30/31 and TC-OBS-32 to 34;
      - TC-MODEL-07 removed.
    - **`docs/deploy.md` and `docs/cold-start.md`:** the three 039 migrations are additive and need no operator step. Add the down script, its `app.allow_caption_loss` flag and the `pg_dump` before it.
    - **`DESIGN_SYSTEM.md` §12:** "General caption", "Curated caption" and "Curate for `<channel>`".
    - `README.md` (the caption line). The `e2e.yml` comment, if it names the caption suites.
    - **Run the full mock suite:**
      1. `npm run test:e2e:db -- --reset`
      2. `rm -rf .next`
      3. `npm run test:e2e:serve`
      4. `npm run test:e2e:mock`
      5. Kill the server tree.

      Fix stale assertions in this task, then re-run the affected files. Run `npm run test:upgrade` once more.

    - **Push.** Before pushing, check that `git remote get-url origin` prints `https://github.com/DDC-endpoint/ai-studio.git`, and stop if it names another repo. Push `v2`, then check `gh run list --branch v2`.

## Legend

- Waves run in order. Every task is its own wave, because each one edits files the next one edits (the store, the caption panels and the prompt).
- `Kind` hints the implementer's role. The orchestrator runs `tsc`, lint and unit and commits after each task (`CLAUDE.md`, Working rules).
