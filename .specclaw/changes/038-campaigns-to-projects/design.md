# Design: Replace campaigns with projects

**Change:** 038-campaigns-to-projects
**Created:** 2026-10-31
**Spec:** `spec.md` (decisions D1–D23, FR-01–FR-24, AC-01–AC-30)

## Technical approach

Four things change together:

- the sharing model: every member views, and the author or a team admin edits;
- where generation inputs come from: a project, recorded on the draft;
- the campaign entity, which is removed;
- the `generate_post` contract.

The order keeps every commit compiling, and keeps the Prisma campaign models until the last code task, as 037 did:

1. **Access tiers.** No schema is needed. The visibility rule stops reading `campaignId`, and every post route gets its tier. This lands first, so every later task writes its new routes against `canView` and `canEditPost`.
2. **Projects hold the inputs.** An additive migration. The briefing and document routes, libraries and UI move from campaigns to projects. The project API, the project page and the library's `projectId` filter. Generation still reads campaigns.
3. **A post's inputs come from its project, recorded on the draft.** The context module, the kit resolver, the stamp, every generation reader, the prompts, the post-style tier, the brief route, the wizard step, the agent tool, and MCP/ACP 2.1.0. After this task nothing in generation reads a campaign.
4. **Assign, move, apply.** The two new post routes and their events, plus the post page, library and dashboard surfaces.
5. **Drop campaigns.** The remaining campaign routes, pages, components and models. The fail-closed migration, the clear and sweep scripts, the upgrade scenario and the seeds.
6. **Docs and the full gate.**

## Architecture

### Access (D10, D11)

```ts
// src/lib/authz/visibility.ts (pure: a type import only)
export const isTeamAdmin = (u: TeamAuthedUser) => u.teamRole === 'ADMIN' || u.isSuperAdmin
export const draftVisibilityWhere = (u: TeamAuthedUser) => ({ teamId: u.teamId })
export const canView = (u: TeamAuthedUser, item: { teamId: string | null }) =>
  item.teamId === u.teamId
export const canEditPost = (u: TeamAuthedUser, item: { teamId: string | null; ownerId: string }) =>
  item.teamId === u.teamId && (item.ownerId === u.userId || isTeamAdmin(u))
export const NOT_AUTHOR = {
  error: 'Only the author or a team admin can change this post',
  code: 'not-author',
} as const
```

Every edit route follows the same pattern:

```ts
if (!row || !canView(user, { teamId: row.teamId })) return 404 (unchanged body)
if (!canEditPost(user, { teamId: row.teamId, ownerId: row.brief.userId })) return NextResponse.json(NOT_AUTHOR, { status: 403 })
```

- The 404 check runs first, so a foreign team still cannot tell a missing id from an existing one.
- `getDraftAccessInfo` (`src/lib/auth.ts:69`) returns `{ teamId, ownerId }` without `campaignId`.
- `POST_ACTION_TIERS` (`src/lib/authz/postActionTiers.ts`) is plain data, for example `'src/app/api/drafts/[id]/refine/route.ts POST': 'edit'`. The coverage test (FR-03) walks the route files, reads their `export const <METHOD>` lines, and checks:
  - each handler has a key, and each key has a handler;
  - the predicate call matches the tier;
  - every `DraftAction` value is covered. The map lists `REFINE`, `REGENERATE_COPY`, `REGENERATE_DESIGN` and `APPLY_TEXT` against their routes in a second constant, `DRAFT_ACTION_ROUTES`.
- The draft page reads `canEdit` from the `GET` and renders a `ViewOnlyNote` (a muted line) in place of the edit controls. No control is merely disabled, because a hidden control cannot be clicked, and the routes are the real gate.

### Project context and the stamp (D3–D6)

```
                  new post (live)                          existing post (recorded)
POST /api/briefs ─▶ Brief{projectId?}                       Draft.generationInputs
                        │                                           │
createPendingDraft / generateDraftForBrief              retry · regenerate copy/design · refine
        │ newPostContext(brief)                          refreshFactsCheck · draft GET
        │   └─ resolveInputsFor({teamId, projectId, brandKitId})    │ postContext(draft)
        │        ├─ project   = findFirst{id, teamId, isDeleted:false}│   ├─ project  = findFirst{id: inputs.projectId, teamId} (deleted OK)
        │        ├─ briefing  = active ProjectBriefing               │   ├─ briefing = ProjectBriefing{id: inputs.briefingId}
        │        └─ kit       = resolveBrandKit(teamId,{brandKitId, │   └─ kit      = resolveBrandKit(teamId,{brandKitId: inputs.kitId,
        │                         projectId})                        │                    projectId: inputs.projectId})
        ▼                                                            ▼
   PostContext{inputs, project, kit, briefing, documentTexts()}  (branded; built only in context.ts)
        │
        ├─ buildBriefInput(brief, ctx) ──▶ captions (writeCaptions)
        ├─ runPathADesign(brief, ctx, template, …) / runPathBDesign(brief, ctx, …)
        │       └─ generateBackgroundForBrief(brief, ctx, …)  (Path B art director)
        └─ loadFactsSources(brief, ctx)  →  topic, description, ctx.briefing, ctx.kit.voicePrompt, ctx.documentTexts()
```

- **`src/lib/projects/inputs.ts`** is pure (zod only).
  - `generationInputsSchema`: `v: z.literal(1)`, `projectId`, `briefingId`, `briefingVersion`, `kitId`, and `kitSource: 'explicit' | 'project' | 'team'`, each nullable.
  - `parseGenerationInputs(raw)`, a tolerant parse that returns null on anything unreadable, like `parseCompositionStamp`.
  - `sameInputs(a, b)`, which compares `projectId`, `briefingId` and `kitId`.
  - `NO_PROJECT_INPUTS(kit)`.
- **`src/lib/projects/context.ts`** is the only reader of `ProjectBriefing`, and the only reader of `ProjectDocument` outside the document routes.
  - `postContext` with a null stamp uses `{ projectId: null, briefingId: null, kitId: brief.brandKitId }` (D3).
  - With a recorded kit that is gone, `resolveBrandKit` falls through the recorded project's default, then the team default.
  - `documentTexts()` is lazy: only the facts check calls it. It reads `ProjectDocument.parsedText` for `inputs.projectId` and `teamId`.
- **The brand.** `declare const brand: unique symbol; export type PostContext = {...} & { readonly [brand]: true }`. Only `context.ts` holds a value of the brand type, behind a non-exported `make()` helper. A `PostContext` written by hand elsewhere fails `tsc`, and `postContextSites.test.ts` fails on `as PostContext`.
- **The stamp write** sits inside the same `prisma.draft.create` that already writes the draft (`createPendingDraft`, and the sync create at `generateDraftForBrief`). It adds no transaction.
- **`resolveGenerationInputs(brief, templateId)`** keeps its template validation. It now takes a `PostContext` and no longer resolves the kit or the briefing itself. `NoBrandKitError`'s message drops "campaign".
- **`refreshFactsCheck`** selects `generationInputs` and the brief, and builds the context through `postContext`. `computeFactsCheck` takes the context from its caller (generation), so nothing is read twice. `FactsBrief.campaignId` goes.
- **The draft `GET`.** `inputsCurrent` is `sameInputs(stamp, (await resolveInputsFor({ teamId, projectId: brief.projectId, brandKitId: brief.brandKitId })).inputs)`. It is computed only when the draft is `EXPORTED` and has no `pendingAction` (NFR-06); otherwise it reads `true`.

### Kit resolver (D5)

```ts
export type BrandKitSource = 'explicit' | 'project' | 'team'
export async function resolveBrandKit(
  teamId: string,
  { brandKitId, projectId }: { brandKitId?: string | null; projectId?: string | null } = {},
): Promise<ResolvedBrandKit | null>
//  1. brandKitId → brandKit.findFirst({ id, teamId, isDeleted: false })              → 'explicit'
//  2. projectId  → project.findFirst({ id, teamId }) with defaultBrandKit (not deleted) → 'project'
//     (the project row itself may be soft-deleted: a recorded project still supplies its kit)
//  3. brandKit.findFirst({ teamId, isDefault: true, isDeleted: false })                → 'team'
```

- The live path (`resolveInputsFor`) passes only a project that passed the D12 check, which is not deleted. The recorded path may pass a soft-deleted one.
- `kitResolverBoundary.test.ts` allows imports only from `src/lib/projects/context.ts` and `src/app/api/admin/look-probe/route.ts` (no options: the team default).
- **The agent tool (FR-20).** `executeTool` in `designAgent.ts` receives the run's `PostContext` through `DesignAgentOptions`. `toolGetBrandKitContext(ctx)` loads `brandKit.findFirst({ id: ctx.kit.id, teamId })` with its active prompt and `feedToAI` artifacts. With no kit, it returns the empty context it returns today. The tool's input schema drops `briefId`.

### Post styles (D7)

- `ResolveInput.campaign` → `project`, and the note `campaign-tone-ignored` → `project-tone-ignored`.
- In `src/app/api/briefs/route.ts`, the project lookup replaces the campaign lookup in the parallel `Promise.all`:
  - it uses `{ id: projectId, teamId: user.teamId, isDeleted: false }`, and an empty result is 404 `PROJECT_NOT_FOUND`;
  - its `{ defaultPostStyle, defaultTone }` goes to `resolvePostStyle`;
  - `campaignId` in the body is 400 `CAMPAIGN_RETIRED` before any lookup.
- `src/lib/brief/wizardStyleState.ts`: the `campaign` input becomes `project`, and `campaignStyleKey` becomes `projectStyleKey`.

### Assign and apply (D8, FR-10, FR-11)

```
PUT  /api/drafts/[id]/project   { projectId: string | null }    withTeamAuth + canView
  draft → brief (404 if not viewable)
  projectId ? project.findFirst({id, teamId, isDeleted:false}) : null   → 404 PROJECT_NOT_FOUND
  same as brief.projectId → 200, no event
  brief.update({ projectId })                 (Brief only; generationInputs untouched)
  track('draft.project_changed', { change, fromProjectId, toProjectId })
  → 200 { project: {id,name} | null }

POST /api/drafts/[id]/apply-project                               withTeamAuth + canView(404) + canEditPost(403)
  status IN_PROGRESS or pendingAction → 409 busy
  next = resolveInputsFor({ teamId, projectId: brief.projectId, brandKitId: brief.brandKitId }).inputs
  sameInputs(stamp, next) → 409 no-change
  draft.updateMany({ where: { id, generationInputs: <stamp as read> (DbNull when null), pendingAction: null }, data: { generationInputs: next } })
      count 0 → 409 changed
  refreshFactsCheck(id)                                           (reads the new stamp)
  track('draft.inputs_applied', { fromProjectId, toProjectId, kitChanged, briefingChanged, factsStatus })
  → 200 <draft GET body>
```

The compare-and-set on a JSON column uses Prisma's `equals` on the JSON value, or `Prisma.DbNull` for a null stamp. If `equals` on JSONB proves unreliable in the client, the fallback is an `updatedAt` guard (the same value as read). Either is acceptable, as long as the unit test's lost-race case passes.

### Project delete (D9)

```ts
await prisma.$transaction(async (tx) => {
  const { count } = await tx.brief.updateMany({
    where: { projectId: id, teamId },
    data: { projectId: null },
  })
  await tx.project.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } })
  return count
}) // → 200 { unassigned: count }
```

No briefing, document or object is touched.

### Migrations (D19)

**`20261101120000_project_inputs`** (T2) is additive:

- `ALTER TABLE "Project" ADD COLUMN "defaultPostStyle" TEXT`;
- `ALTER TABLE "Brief" ADD COLUMN "projectId" TEXT`, with the FK `ON DELETE SET NULL` and an index;
- `ALTER TABLE "Draft" ADD COLUMN "generationInputs" JSONB`;
- `CREATE TABLE "ProjectBriefing"` and `"ProjectDocument"`, with their FKs, the unique key and the indexes.

The DDL is generated with `prisma migrate diff --from-migrations … --to-schema-datamodel …` and checked by hand.

**`20261101130000_drop_campaigns`** (T5):

```sql
-- 1. Fail-closed precondition (038 D19). Nothing below runs if this raises.
DO $$
DECLARE c int; b int; d int; l int; r int; v int;
BEGIN
  SELECT count(*) INTO c FROM "Campaign";
  SELECT count(*) INTO b FROM "CampaignBriefing";
  SELECT count(*) INTO d FROM "CampaignDocument";
  SELECT count(*) INTO l FROM "ProjectCampaign";
  SELECT count(*) INTO r FROM "Brief" WHERE "campaignId" IS NOT NULL;
  IF c + b + d + l + r > 0 THEN
    RAISE EXCEPTION '038 drop_campaigns refused: % Campaign, % CampaignBriefing, % CampaignDocument, % ProjectCampaign, % briefs with a campaign. Run scripts/clear-campaign-data.mjs first (see docs/deploy.md).', c, b, d, l, r;
  END IF;
  SELECT count(*) INTO v FROM "Brief";
  RAISE NOTICE '038: % posts are now visible to every member of their team (see docs/deploy.md).', v;
END $$;

-- 2. Drop (FKs go with the tables), then the column.
DROP TABLE "ProjectCampaign"; DROP TABLE "CampaignDocument"; DROP TABLE "CampaignBriefing";
ALTER TABLE "Brief" DROP CONSTRAINT "Brief_campaignId_fkey";
DROP INDEX "Brief_campaignId_idx";
ALTER TABLE "Brief" DROP COLUMN "campaignId";
DROP TABLE "Campaign";
```

- The exact DDL in step 2 comes from `migrate diff`. Step 1 goes first, and `migrate diff` must exit 0 afterwards (NFR-05).
- Prisma does not print a `NOTICE` during `migrate deploy`. The count is therefore also printed by the clear script's dry run, which `docs/deploy.md` makes the first step of every 038 upgrade (spec D19, finding 24).
- When the precondition raises, Prisma records the migration as failed. The recovery is the 037 sequence:
  1. `npx prisma migrate resolve --rolled-back 20261101130000_drop_campaigns`
  2. `DATABASE_URL=… node scripts/clear-campaign-data.mjs` (the dry run)
  3. the same command with `--yes`
  4. `npm run db:migrate`
  5. `node scripts/sweep-campaign-documents.mjs`, then the same with `--yes`

### Operator scripts (FR-23)

Both copy `scripts/clear-publishing-data.mjs`: the env guard runs before a dynamic `import('@prisma/client')` with `datasourceUrl`, the logic sits in a pure function in `scripts/lib/`, and all SQL is raw (the head client has no campaign models).

- **`planClear(counts, { yes, migrated })`** returns `{ lines, statements, exitCode }`.
  - The counts come from `to_regclass` checks. A missing `Campaign` table means `migrated: true`, which prints "already migrated" and exits 0.
  - The lines name the five counts, the `CampaignDocument` count ("their stored files are removed by the sweep after the migration"), and the number of posts private to their author today. Under the old rule, that is the drafts whose brief has no campaign.
  - The statements, run in one transaction:
    1. `UPDATE "Brief" SET "campaignId" = NULL WHERE "campaignId" IS NOT NULL`
    2. `DELETE FROM "ProjectCampaign"`
    3. `DELETE FROM "CampaignDocument"`
    4. `DELETE FROM "CampaignBriefing"`
    5. `DELETE FROM "Campaign"`
- **`planSweep(keys, { dropCommitted, documentTableExists }, { yes })`** returns `{ lines, deletes, exitCode }`.
  - It refuses with exit 4 unless the drop has committed and the table is gone.
  - It selects the keys whose first `/` segment is not `brandkits`, `screenshots` or `projects`.
  - The script lists `BUCKET_DOCS` with `ListObjectsV2Command` (paged) through `@aws-sdk/client-s3`, the client `src/lib/storage/minio.ts` already uses. It builds the client from the explicit env (no `minioadmin` default), and deletes and logs one key at a time.

### Upgrade-path scenario 5 (AC-16, AC-17)

`scripts/test-upgrade-path.mjs` gains `PRE_038 = '20261101120000_project_inputs'`, `DROP_CAMPAIGNS = '20261101130000_drop_campaigns'` and `GUARD_038_PREFIX = '038 drop_campaigns refused:'`. Scenario 5:

1. Deploy up to `PRE_038` on a fresh scratch database.
2. Seed with raw SQL: a team, a user, a project, a campaign linked through `ProjectCampaign`, a `CampaignBriefing`, a `CampaignDocument`, and a brief with that `campaignId` plus its draft.
3. Deploy head. Expect a non-zero exit, the 038 prefix, and `/1 Campaign, 1 CampaignBriefing, 1 CampaignDocument, 1 ProjectCampaign, 1 briefs with a campaign/`. Every seeded row is still present.
4. Run `migrate resolve --rolled-back DROP_CAMPAIGNS`. The clear script's dry run gives exit 3, and `--yes` gives exit 0.
5. Deploy head. Then run AC-17's table and column checks, check that the brief exists with `projectId` null, read the draft with the head client, and run `migrate diff --exit-code`.

`upTo()` and the scenario 1 constants stay. Scenario 1 seeds no campaign rows, so its head deploy passes 038's precondition.

### Analytics (D14)

```ts
'draft.project_changed': {
  schemaVersion: 1, source: ['web'], outcomes: [],
  schema: z.object({
    change: z.enum(['assign', 'move', 'unassign']),
    fromProjectId: z.string().max(64).nullable(),
    toProjectId: z.string().max(64).nullable(),
  }),
},
'draft.inputs_applied': {
  schemaVersion: 1, source: ['web'], outcomes: ['ok'],
  schema: z.object({
    fromProjectId: z.string().max(64).nullable(),
    toProjectId: z.string().max(64).nullable(),
    kitChanged: z.boolean(),
    briefingChanged: z.boolean(),
    factsStatus: z.enum(FACTS_STATUSES).nullable(),
  }),
},
```

The coverage test's one-emitter scan is extended to both names. A new assertion checks that no catalogue key and no payload field name matches `/campaign/i`. Insights is unchanged.

### MCP and ACP (D13)

- `src/mcp/tools/generate.ts` exports `class CampaignRetiredError` (`code = 'CAMPAIGN_RETIRED'`) and `class ProjectNotFoundError` (`code = 'PROJECT_NOT_FOUND'`). `generatePost` checks the input in this order:
  1. `'campaignId' in args || 'campaign' in args` → `CampaignRetiredError`;
  2. `projectId` → `project.findFirst({ id, teamId: args.teamId, isDeleted: false })`, and none → `ProjectNotFoundError`;
  3. `resolvePostStyle({ …, project })`;
  4. `brief.create({ …, projectId })`;
  5. `generateDraftForBrief`, which writes the stamp.
- `src/app/api/acp/run/route.ts`: `validateGenerateInput` refuses the retired keys with 400 `CAMPAIGN_RETIRED`, which is the early and cheap path. The catch maps `CampaignRetiredError` to 400, `ProjectNotFoundError` to 404, and anything else to 422 as today. Each answer is `{ error, code }`.
- MCP's `CallToolRequestSchema` handler already returns `isError` text for a thrown error. The text becomes `${code}: ${message}`.
- The version is `2.1.0` in `src/acp/agent.ts` and `src/mcp/server.ts`. The input schemas drop `campaignId` and add `projectId: { type: 'string', description: 'Project id (optional): its briefing, documents, default kit and default post style apply' }`. The descriptions say "or the project default".

### Library (FR-13)

```ts
if (projectId === 'none') and.push({ brief: { projectId: null } })
else if (projectId) {
  const p = await prisma.project.findFirst({ where: { id: projectId, teamId: user.teamId, isDeleted: false } })
  if (!p) return 404 PROJECT_NOT_FOUND
  and.push({ brief: { projectId } })
}
if (brandKitId)
  and.push({ OR: [
    { generationInputs: { path: ['kitId'], equals: brandKitId } },
    { generationInputs: { equals: Prisma.DbNull }, brief: { brandKitId } },
  ] })
```

- The select adds `generationInputs` and `brief.project { id, name }`.
- Kit names for the page come from one `brandKit.findMany({ where: { id: { in: kitIds }, teamId } })`.

### UI

- **`src/components/projects/`** holds `ProjectPicker` (a Select: "No project" plus the team's live projects; used by the wizard step, the post page and the library card), `ProjectBriefingSection` and `BriefingAssistantPanel` (moved), `classes.ts` (moved), and `postStyleOptions.ts` (moved).
- **The post page** gets a Project block in the right column, below Captions. (Amended at build, T4: above Captions it pushed the captions card down and broke 021 AC-12, "tops level", in `surfaces.test.ts`. FR-15 sets no position.)
  - The picker shows for every viewer.
  - When `canEdit && !inputsCurrent`, it shows the line "Made with `<inputs.project ?? 'no project'>` settings." and the button "Apply project settings".
  - When `!canEdit`, the `ViewOnlyNote` replaces the action rows.
  - Read `docs/ui-reference/DESIGN_SYSTEM.md` §8 before building it.
- **The project page** (`src/app/(app)/projects/[id]/page.tsx`) reuses the campaign detail layout:
  - a breadcrumb "Projects / name";
  - section 01 is the briefing (with the assistant panel and documents);
  - section 02 is Posts (the library grid for `projectId`);
  - the aside holds the default kit, post style and tone (admin selects; others read) and the admin "Delete project" with its confirmation naming `postCount`.
- **The projects list page** shows the post count in place of the campaign count.

### Module map (finding 7)

| Today                                                                                                                     | After 038                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/campaign/briefing.ts` (`getActiveCampaignBriefing`)                                                              | Folded into `src/lib/projects/context.ts` (briefing by active row or by id)                                                                                                                         |
| `src/lib/campaign/documents.ts`                                                                                           | Moved: `src/lib/projects/documents.ts` (parse, `buildDocsContext`, `projectDocsContext`, `projectDocImageUrls`, `MAX_DOCS_PER_PROJECT`)                                                             |
| `src/lib/campaign/briefingAssistant.ts`                                                                                   | Moved: `src/lib/projects/briefingAssistant.ts` (`resolveAssistantModel` and `runBriefingModel` keep their names; `kitUpgrade/upgrade.ts`, `brandkit/*` and `briefs/enhance` re-point their imports) |
| `src/app/api/campaigns/[id]/briefing/**`, `documents/**`                                                                  | Moved: `src/app/api/projects/[id]/briefing/**`, `documents/**`                                                                                                                                      |
| `src/app/api/campaigns/route.ts`, `[id]/route.ts`, `[id]/brandkit/route.ts`                                               | Deleted (T5; `brandkit` in T3)                                                                                                                                                                      |
| `src/components/campaigns/CampaignBriefingSection.tsx`, `BriefingAssistantPanel.tsx`, `classes.ts`, `postStyleOptions.ts` | Moved: `src/components/projects/`                                                                                                                                                                   |
| `src/app/(app)/campaigns/**`                                                                                              | Deleted                                                                                                                                                                                             |
| `src/components/brief/CampaignStep.tsx`, `CampaignRow.tsx`                                                                | Replaced: `ProjectStep.tsx`, `ProjectRow.tsx`                                                                                                                                                       |
| `src/app/api/projects/route.ts`, `[id]/route.ts`, `src/app/(app)/projects/**`                                             | Exist today (list, create, rename, default kit, soft delete, list and detail pages). Extended, not rebuilt.                                                                                         |

## Key decisions

All of these are in `spec.md`. These have the most structural weight:

| Decision                                                       | Why                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The assignment on `Brief`, the record on `Draft` (D2, D3)      | Generation starts from the brief, and every reader joins through it. The draft is the post that is regenerated, so the inputs it was made with live there. One mutable fact and one written-once fact, each with one writer. |
| A branded `PostContext` (D6)                                   | The type system, not review, makes 039's caption calls go through the context. A guard test alone would catch only the call names it lists.                                                                                  |
| Briefing by version id; documents by the recorded project (D4) | Briefing versions are immutable rows, so a reference is exact and costs nothing. Documents are not versioned, and copying their text onto every draft would store megabytes per post. Only admins change them.               |
| A move never touches the stamp; an explicit apply does (D8)    | This makes the open tier for assign safe (finding 20), and it keeps the facts verdict tied to sources the author did not choose.                                                                                             |
| Two migrations, the second fail-closed (D19)                   | Later tasks need the new columns while the campaign models still compile. The destructive step is the one that must refuse.                                                                                                  |
| A sweep by key shape, after the drop (D18, D19)                | Campaign documents were the only bare-id writer in `BUCKET_DOCS`, so the shape identifies them without a manifest the operator could lose. Running it after the commit means a refused migration never loses a file.         |
| 2.1.0, not 3.0.0 (D13)                                         | 2.0.0 never shipped. 037 D8 placed this change in major 2, and the retired field is refused by name, so no client silently degrades.                                                                                         |

## Risks

| Risk                                                                        | Mitigation                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A route keeps the read predicate as its only gate and lets any member write | `postActionTiers.test.ts` (each handler has a tier and calls its predicate) and `post-permissions.test.ts` (403 on every edit route, with no model call recorded).                       |
| A new generation call (039) skips the briefing                              | The branded `PostContext` in the signatures, plus `postContextSites.test.ts`.                                                                                                            |
| A stale E2E assertion on campaign routes, copy or test ids survives a task  | Each task greps `src/`, `tests/` and `tests/e2e/` (and `scripts/`) for every name, route, UI string and test id it removes, and fixes the hits in the same task. T6 runs the full suite. |
| `next dev` serves a deleted route from its cache                            | Tasks that delete routes or pages note `rm -rf .next` before any E2E run.                                                                                                                |
| The local `ai_studio` database holds campaign rows the user cares about     | The precondition refuses, and the dry run lists them. No task runs `npm run db:migrate` on `ai_studio`. Only the `test:upgrade` scratch database and `ai_studio_test` are migrated.      |
| The `inputsCurrent` comparison slows the 4 s poll                           | It runs only for an `EXPORTED`, idle draft, at three or fewer extra queries (NFR-06).                                                                                                    |
| The JSON compare-and-set misbehaves in Prisma                               | The `updatedAt` fallback (see "Assign and apply"). The unit test fixes the behaviour, not the mechanism.                                                                                 |
| Editors suddenly see posts that used to be private                          | Decided by the user. The clear script's dry run prints the count, and `docs/deploy.md` says it.                                                                                          |
| The prompt wording change shifts output                                     | The prompt versions are bumped (FR-08), so output is attributable. The section content is unchanged apart from the word.                                                                 |
| `seed-teams.mjs` and `team-isolation` fixtures drift                        | T5 changes the seed and the suite together. `setup-test-db.mjs` reseeds on `--reset`.                                                                                                    |

## Grounding sources

- `CLAUDE.md`, "Working rules":
  - "One task at a time: an implementer subagent does it, `specclaw:code-reviewer` reviews it, and the orchestrator runs tsc, lint and unit and commits." This is NFR-04.
  - "No real model calls in gates." This is NFR-01.
  - "A `page.waitForResponse` must be created before the action that triggers the request." This applies to the assign, apply and delete UI cases.
- `CLAUDE.md`: "Roles are hierarchical … every check goes through `hasRole()`." `withTeamAuth` derives `isSuperAdmin` with `hasRole(user.role, 'super_admin')` (`src/lib/api/handler.ts:79`). `isTeamAdmin` reads that field.
- 037 `reports/T6.md`: "Full mock run fixes (stale assertions from T2–T4): a11y campaign page …, retention-health (bogus-cookie context …), TC-DL-01 (compare the object path, not the presigned URL)." These are the lessons built into `tasks.md`.
- 037 `design.md`, "Migration": the precondition, `migrate resolve --rolled-back` and clear-script pattern reused in D19.
- `src/app/api/campaigns/[id]/documents/route.ts:100`: `` const objectKey = `${params.id}/${Date.now()}-${safeName}` ``. This is the key shape the sweep selects.
- `src/app/api/admin/brandkits/[id]/documents/route.ts:101` (`brandkits/…`) and `src/lib/brief/compositeSource.ts` (`screenshots/…`) are the two other `BUCKET_DOCS` writers.
- `src/lib/models/modelCalls.ts:23-36`: `ModelCallRecord` carries no prompt-derived field. The briefing-in-prompt proof is therefore the prompt unit tests plus the facts-check E2E (TC-PS-12), not the recorder.
