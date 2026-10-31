# Spec: Replace campaigns with projects

**Change:** 038-campaigns-to-projects
**Created:** 2026-10-31
**Size:** architectural
**Status:** 🟡 Draft

## Overview

Campaigns go. Projects take over what campaigns carried: a default brand kit, a versioned briefing (with its assistant, chat, Improve and upgrade), reference documents for the facts check, and a default post style and tone. A post belongs to zero or one project. Every member of a team sees every post in that team. Only the author and team admins change a post.

The proposal (`proposal.md`) and its "Decisions after the party review (user, 2026-10-30)" are the source of truth for scope. This spec settles what the proposal and the party report left to the plan. Change 037 (built, VERIFIED PASS) removed the campaign queue. Change 039 (general and curated captions) builds on this one.

## Decisions this plan makes

### Data

- **D1. The existing `Project` table is the project. No second entity is made.**
  - `Project` keeps `id`, `teamId`, `name`, `defaultBrandKitId`, `defaultTone`, `isDeleted`, `deletedAt` and `createdAt`.
  - It gains `defaultPostStyle` (TEXT, validated in code like `Campaign.defaultPostStyle` was) and the relations `briefings`, `documents` and `briefs`.
  - It loses `campaigns` (`ProjectCampaign` is dropped).
  - Two new tables replace the campaign ones, with the same columns re-keyed on `projectId`: `ProjectBriefing` (versioned, one active row per project, as `CampaignBriefing` was) and `ProjectDocument`.
  - `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId` are dropped. No data is carried over (the system starts fresh).
- **D2. `Brief.projectId` holds the assignment. Only `Brief` carries it.**
  - Generation runs from the brief, and the brief exists before its draft: `POST /api/briefs` creates the brief, then `assemble-a`/`assemble-b` call `createPendingDraft(brief)` (`src/lib/agent/generateDraft.ts:441`). The project the author picks must be on the brief when generation starts.
  - Every reader already joins drafts through the brief: visibility, the library's kit and style filters, the dashboard.
  - Brief to draft is one to one on every surface. The wizard creates one brief per Generate, MCP and ACP create one brief per call, and retry, regenerate and refine reuse the draft. The schema allows more, so a second draft made by calling `assemble-*` twice on one brief shares that brief's assignment. That is correct, because the two drafts share the brief's inputs.
  - The FK is `ON DELETE SET NULL`. Projects are soft-deleted (D9), so the FK only matters for an operator's hard delete.
- **D3. A draft records the inputs it was generated with, in `Draft.generationInputs` (JSONB, validated in `src/lib/projects/inputs.ts`).**
  - Shape: `{ v: 1, projectId, briefingId, briefingVersion, kitId, kitSource }`. Every field except `v` is nullable. `kitSource` is `explicit`, `project` or `team`.
  - It is written once, when the draft is created: by `createPendingDraft` (the wizard path; retry then reuses it) and by `generateDraftForBrief` (MCP and ACP). Both resolve it live from the brief.
  - After that only "apply project settings" (D8) rewrites it.
  - The post style is already recorded. `Brief.postStyle` is the resolved key written at brief creation, and `Draft.postStyle` is 027's `{ key, version, revision }` stamp. A move never touches either, so the stamp does not repeat it.
  - `DraftRevision` does not carry it. The inputs belong to the post, not to one render. Restoring an old revision does not change them.
  - Null means generated before 038. It reads as an unassigned post: kit = the brief's explicit kit → team default, with no briefing and no documents. That is exactly what an un-campaigned post used before 038, so nothing is backfilled.
- **D4. The briefing is recorded by version. Documents are read from the recorded project.**
  - The stamp holds the `ProjectBriefing` row id and version. Briefing rows are immutable versions and are never deleted, so a regenerate reads the exact text the post was made with.
  - Documents are not versioned. A regenerate or facts-check recompute reads the documents of the recorded `projectId` (soft-deleted projects included), not of the current assignment.
  - Only team admins can add or remove documents (D11). An author who is not an admin therefore cannot change what their post is checked against.
  - The project id is not copied into `Draft.factsCheck` (party-security's suggestion). The check reads only the stamp, so `generationInputs.projectId` is, by construction, the project it ran against. A change of that project is traced by the `draft.inputs_applied` event (D14).

### Resolution

- **D5. One kit resolver: `resolveBrandKit(teamId, { brandKitId?, projectId? })` in `src/lib/brandkit/resolve.ts`.**
  - The order is explicit kit → the project's default kit → the team default kit. A deleted, missing or foreign kit at a tier is skipped.
  - The "team default kit" is the existing `BrandKit.isDefault` row of the caller's team (`src/lib/brandkit/resolve.ts:105-106`). No new field is added. `BrandKitSource` becomes `'explicit' | 'project' | 'team'`: the campaign tier goes, and `system` is renamed `team` because the tier is team-scoped. The UI label is "Team default".
  - Only `src/lib/projects/context.ts` and the admin look probe (team default only) import it, enforced by `tests/unit/kitResolverBoundary.test.ts`.
  - The second copy of the chain in the API-mode design agent's `getBrandKitContext` tool (`src/lib/agent/tools.ts:68-123`) is removed. The tool returns the run's own context kit. It no longer takes a model-supplied `briefId` (`src/lib/agent/designAgent.ts:93`), which today reads any brief by id with no team check.
- **D6. One project-context module: `src/lib/projects/context.ts`.**
  - `resolveInputsFor({ teamId, projectId, brandKitId })` resolves live. It serves a new brief, the wizard's post-brief enhance, and the project's own briefing assistant.
  - `newPostContext(brief)` resolves live and returns the stamp to write. Its callers are `createPendingDraft` and `generateDraftForBrief`.
  - `postContext(draft)` reads the stamp. Its callers are retry, regenerate copy, regenerate design, refine, the facts-check refresh, and the draft `GET`'s kit name.
  - Both return a `PostContext`: `{ inputs, project, kit, briefing: { id, version, content } | null }`, plus `documentTexts()` for the facts check.
  - `PostContext` is a branded type. Its brand is a non-exported `unique symbol` in `context.ts`, so no other file can build one.
  - `buildBriefInput`, `runPathADesign`, `runPathBDesign`, `generateBackgroundForBrief` and `loadFactsSources` take a `PostContext` in place of the `(kit, campaignBriefing)` pair. A new generation call cannot reach the briefing or the kit without the context. 039's channel captions must call `buildBriefInput` too.
  - `tests/unit/postContextSites.test.ts` checks that:
    - every caller of those functions gets its context from `newPostContext` or `postContext`;
    - no file other than `context.ts` names the brand or casts to `PostContext`;
    - no file outside `src/lib/projects/` and `src/app/api/projects/` reads `prisma.projectBriefing` or `prisma.projectDocument`.
- **D7. Post-style precedence is explicit key → legacy goal → the project's default → `general`.**
  - `resolvePostStyle` stays the only resolver. Its input `campaign` becomes `project` (`{ defaultPostStyle, defaultTone }`).
  - The note `campaign-tone-ignored` becomes `project-tone-ignored`.
  - Callers: the brief route, the wizard's style state and MCP/ACP. `postStylesBoundary.test.ts` stays the guard.
- **D8. A move only relabels the post. "Apply project settings" is the one way an existing post takes new project inputs.**
  - `PUT /api/drafts/[id]/project` (assign, move, unassign) writes `Brief.projectId` and nothing else. It does not change `generationInputs`, the facts check, the kit, the briefing or the post style.
  - `POST /api/drafts/[id]/apply-project` (author or team admin) resolves the current assignment live (`resolveInputsFor`), writes `generationInputs`, and recomputes the facts check at once, so the stored verdict matches the recorded sources.
    - It does not regenerate anything. The next regenerate or refine uses the new inputs.
    - It does not change `Brief.postStyle` or `Brief.tone`, because the post style is the author's choice for the post and governs the existing headline's checklist.
    - It works on an unassigned post too (it applies "no project").
    - It is refused with 409 while `pendingAction` is set or the draft is `IN_PROGRESS`.
  - The draft `GET` returns `inputsCurrent`. It is false when the recorded inputs differ from what the current assignment resolves to, in project, active briefing or kit. The button shows only then.
- **D9. Deleting a project soft-deletes it and unassigns its posts in one transaction.**
  - The existing soft delete (`src/app/api/projects/[id]/route.ts:67-75`) is kept. In the same transaction, `Brief.projectId` is set to null for every brief assigned to the project.
  - The briefing versions, the documents and their stored objects are kept. Existing drafts' stamps point at them, so a regenerate after the delete still reads the inputs the post was made with. **Snapshots make a delete safe for existing drafts.** Only the grouping is lost.
  - The UI confirmation names the number of assigned posts (`postCount` from `GET /api/projects/[id]`). The response is `{ unassigned: n }`.
  - No restore UI is built. Restoring would only bring back the grouping, and the confirmation states that cost before the delete.
  - **A delete during a running generation:** the run reads the stamp written by `createPendingDraft` before the background run starts, so it completes with the inputs it was started with. It is neither failed nor degraded.
  - **A delete between the wizard's two requests** (brief created, `assemble-*` not yet called): the brief arrives unassigned, the stamp records no project, and the post page shows "No project". The outcome is visible, not silent. That window is one click wide, and closing it would need a second copy of the stamp on the brief.

### Access

- **D10. Two predicates in `src/lib/authz/visibility.ts`.**
  - `canView(u, { teamId })` is true for any member of the item's team.
  - `canEditPost(u, { teamId, ownerId })` is true for the author or a team admin (`teamRole === 'ADMIN'` or `isSuperAdmin`, which `withTeamAuth` derives through `hasRole`).
  - `draftVisibilityWhere(u)` becomes `{ teamId: u.teamId }`.
  - `canAccessContent`, `briefVisibilityWhere` (no caller today) and `getDraftAccessInfo`'s `campaignId` go.
  - A non-author who can view gets **403** `{ error, code: 'not-author' }`. A caller from another team gets **404** with the not-found body, as today.
- **D11. The principle behind the tiers.** Anything that calls a model, writes the post's content, or changes which inputs a later generation uses is author or team admin only (`canEditPost`). Anything that only reads the post, or changes only its grouping, is any member (`canView`). Assign and move are grouping only _because_ of D3 and D8: the inputs are recorded, so a move cannot change what the author's next regenerate uses. Every post route is classified in `src/lib/authz/postActionTiers.ts`, and `tests/unit/postActionTiers.test.ts` fails on a handler with no tier (FR-03). The tiers:

  | Route                                                     | Method                    | Tier                                                                                                                  |
  | --------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
  | `/api/drafts/[id]`                                        | GET                       | view                                                                                                                  |
  | `/api/drafts/[id]`                                        | PATCH (caption, headline) | edit                                                                                                                  |
  | `/api/drafts/[id]`                                        | DELETE                    | edit (was team admin only; see Questions)                                                                             |
  | `/api/drafts/[id]/apply-text`                             | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/download`                               | GET                       | view (it may render and store the PNG of the current content: a cache of what the viewer already sees, no model call) |
  | `/api/drafts/[id]/inline-edit`                            | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/refine`                                 | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/regenerate-copy`                        | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/regenerate-design`                      | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/rejected/[revisionId]/adopt`            | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/retry`                                  | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/revisions`                              | GET                       | view                                                                                                                  |
  | `/api/drafts/[id]/revisions/[rev]/restore`                | POST                      | edit                                                                                                                  |
  | `/api/drafts/[id]/project` (new)                          | PUT                       | assign (`canView`)                                                                                                    |
  | `/api/drafts/[id]/apply-project` (new)                    | POST                      | edit                                                                                                                  |
  | `/api/generate/assemble-a`, `assemble-b`, `copy`, `image` | POST                      | edit, on the brief (each calls a model)                                                                               |
  | `/api/briefs/screenshots?draftId=`                        | GET                       | view                                                                                                                  |
  | `/api/library`, the dashboard                             | GET                       | view                                                                                                                  |

  Project settings (the briefing, documents, defaults, create, rename, delete) stay team admin only (`withTeamAdmin`), and reading them is any member.

- **D12. Every caller-supplied project id is checked against the caller's team.**
  - This covers the brief route, assign and move, the library filter, `generate_post`, and the wizard's post-brief enhance.
  - The lookup is `{ id, teamId: caller.teamId, isDeleted: false }`. Unknown, deleted and foreign ids all get the same 404, `{ error: 'Project not found', code: 'PROJECT_NOT_FOUND' }`.
  - Inside the context module, every read is team-scoped as well, as defence in depth.

### Contracts

- **D13. `generate_post` takes `projectId` (string, optional). The retired field is refused, never ignored.**
  - A `campaignId` or `campaign` key with any value is refused with **400** `{ error: 'campaignId is retired; use projectId', code: 'CAMPAIGN_RETIRED' }` before anything is created. The same applies on MCP (`isError` with that text and code) and ACP.
  - A `projectId` that does not resolve in the key's team is refused with **404** `PROJECT_NOT_FOUND`, and no brief is created. It is never treated as "no project".
  - `POST /api/briefs` refuses `campaignId` the same way.
  - **Version: `2.1.0`** for the ACP manifest and the MCP server. 037 D8 put this change "under this same major version". 2.0.0 was never deployed (nothing deploys yet), so 037 and 038 first ship together. The input change therefore stays in major 2, and the minor bump marks the new `projectId` input. `docs/mcp-acp-guide.md` names the retired field and its error.
- **D14. Analytics.**
  - No event field, Insights section or query names a campaign today (`grep -i campaign src/lib/analytics src/components/admin/insights` finds nothing; 037 removed "Active campaigns"). So no field is replaced, no `schemaVersion` changes, and nothing goes into `RETIRED_EVENT_NAMES` or `RETIRED_SOURCES`.
  - Two new events, each with one emitter:
    - `draft.project_changed` (emitter: `PUT /api/drafts/[id]/project`). Payload `{ change: 'assign' | 'move' | 'unassign', fromProjectId, toProjectId }`. It records who moved a post (`userId` column) and when.
    - `draft.inputs_applied` (emitter: `POST /api/drafts/[id]/apply-project`). Payload `{ fromProjectId, toProjectId, kitChanged, briefingChanged, factsStatus }`. Because of this event, a changed facts verdict can be traced.
  - No event carries the project of a generation. The draft's stamp is the record of the project at generation, and it outlives the 180-day event retention. A per-project count reads the stamp, never an event. Project create and delete emit nothing, as campaign create and delete did.
- **D15. Caps.**
  - At most **200 live projects per team** (`MAX_PROJECTS_PER_TEAM`, `src/lib/projects/limits.ts`). This matches the list route's existing `take: 200` (`src/app/api/projects/route.ts:15`), so the wizard picker never misses one. A create beyond the cap is 409 `project-limit`.
  - At most **5 documents per project** (`MAX_DOCS_PER_PROJECT`), the campaign cap carried over.
- **D16. A post's project is single-valued for good.** The project is a configuration source: a kit tier, a style tier, the briefing and the facts sources. Two projects would need a conflict rule in four resolvers. A many-valued grouping, if it is ever asked for, would be tags, kept separate from the project.
- **D17. An unassigned post has no briefing and no project documents.** Its kit is the explicit kit, then the team default. Its post style is explicit, then `general`. The briefing has no team tier, because the team-wide voice already exists as the brand kit's voice prompt, which every post gets. The briefing store is keyed on `projectId` only: no second owner is asked for.
- **D18. Project document objects use the prefix `projects/<projectId>/` in `BUCKET_DOCS`.** Campaign document objects used the bare `<campaignId>/` prefix (`src/app/api/campaigns/[id]/documents/route.ts:100`). The bucket keeps its env default name `campaign-docs`, since renaming it is an env change for no behaviour change. The name is historical, like the `scheduler` container (037 D9).

### Migration

- **D19. Two migrations. The destructive one fails closed.**
  - `20261101120000_project_inputs` is additive: `Project.defaultPostStyle`, `Brief.projectId` (FK, index), `Draft.generationInputs`, `ProjectBriefing` and `ProjectDocument`. It lands first (T2), so later tasks compile against the new client while the campaign models still exist, which was 037's ordering lesson.
  - `20261101130000_drop_campaigns` (T5) starts with a `DO` block. If `Campaign`, `CampaignBriefing`, `CampaignDocument` or `ProjectCampaign` has a row, or any `Brief.campaignId` is not null, it raises an exception naming every count, and nothing else runs. Then it raises a `NOTICE` with the number of posts that are now visible to every member of their team. Then it drops the four tables and the column.
  - `scripts/clear-campaign-data.mjs` is the operator's explicit acceptance:
    - It reads `DATABASE_URL` before importing the client and refuses without it.
    - Its dry run prints the counts, the document count, and how many posts become team-visible, then exits 3 when rows exist.
    - `--yes` unassigns briefs (`campaignId = NULL`) and deletes the rows in one transaction.
    - On a database already past 038 it prints "already migrated" and exits 0.
  - `docs/deploy.md` names a `pg_dump` before the dry run.
  - `scripts/sweep-campaign-documents.mjs` deletes the stored campaign document objects, and runs only by hand:
    - It refuses (exit 4) unless `_prisma_migrations` shows `20261101130000_drop_campaigns` finished and not rolled back, and `CampaignDocument` no longer exists.
    - It refuses (exit 2) without an explicit `DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` and `MINIO_BUCKET_DOCS`.
    - It lists the `BUCKET_DOCS` keys whose first segment is not `brandkits`, `screenshots` or `projects`, the three other writers' prefixes. Campaign documents were the only writer of a bare-id prefix.
    - Its dry run prints the keys and exits 3 when any exist. `--yes` deletes each key and logs it.
  - Down scripts restore the schema only, and their headers say so.
- **D20. No 038a/038b split.** The interim state would need a kit, style and briefing chain covering both `campaignId` and `projectId`, and the `generate_post` contract would change twice. Nothing deploys between commits, so T3 removes the campaign tier from every resolver at once, and the interim exists only between commits.

### UI

- **D21. Surfaces.**
  - **Wizard step 1** becomes an optional "Project" picker (`ProjectStep`, "No project" first). Choosing a project preselects its default kit and post style, and shows its active briefing read-only.
  - **The post page** shows the project with a picker that any member can use (assign, move, unassign). It shows "Apply project settings" to the author or an admin when `inputsCurrent` is false.
    - A viewer who cannot edit sees no edit, refine, regenerate, retry, restore, adopt or delete controls, and sees one line: "Only the author or a team admin can change this post." Download and Copy stay.
  - **The library** gets a "Project" filter (all, no project, each project) and a Project control on each card, which uses the same route.
  - **The project page** has:
    - the post list (the library route with `projectId`, so ready posts only);
    - the briefing section with its assistant, chat, Improve and upgrade;
    - the documents;
    - the defaults (kit, post style, tone).

    Editing is admin only.

  - **Campaign pages,** the nav entry and the campaign components go.
  - **The dashboard** gains a "Projects" KPI (the team's live projects), and the recent-drafts Campaign column becomes Project.
  - Folio (`docs/ui-reference/DESIGN_SYSTEM.md`), the token guard and the wording guard hold. `WORDING_PATTERNS` gains "campaign" → "project", so no UI string says campaign.
- **D22. One assign route serves the post page and the library.** party-po suggested deferring the library surface. The user's program decision lists it, and with one route and one `ProjectPicker` component, the permission matrix has a single row.

### Cheaper variant considered

- **D23. Extending the existing `Project` with only the link and the visibility rule** was weighed. That variant adds `Brief.projectId` and team-wide visibility, and leaves campaigns in place as the source of the kit, briefing and documents.
  - It would cost about a third of this change: no briefing or document move, no E2E suite moves, no drop.
  - It leaves two grouping entities, each with a default kit, and a post would reach one through the other. Every later change (039's library filter, Insights, the kit chain) would have to pick which "project" it means.
  - An in-place rename of `Campaign` is worse, because it builds a second project next to the existing one (party-architect and party-visionary rebuttals).
  - The user chose the full move on 2026-10-30. This plan keeps its cost down by reusing the campaign code (moved, not rewritten), adding no restore UI, and adding no per-project Insights.

## Requirements

### Functional Requirements

- **FR-01 (schema, additive).** Migration `20261101120000_project_inputs`, as in D19. `schema.prisma` gains the following:
  - `Project.defaultPostStyle String?`, `Project.briefings`, `Project.documents` and `Project.briefs`;
  - the `ProjectBriefing` model: `id`, `projectId` (FK), `content @db.Text`, `version`, `isActive`, `createdBy`, `createdAt`, and `@@unique([projectId, version])`;
  - the `ProjectDocument` model: `id`, `teamId`, `projectId` (FK), `name`, `contentType`, `sizeBytes`, `objectKey`, `parsedText @db.Text`, `truncated`, `createdBy`, `createdAt`, with indexes on `projectId` and `teamId`;
  - `Brief.projectId String?`, with a relation (`onDelete: SetNull`) and an index;
  - `Draft.generationInputs Json?`.

  Down script: `prisma/rollback/038-project-inputs.down.sql`.

- **FR-02 (access tiers).** As D10 and D11. Every route in the D11 table calls its tier's predicate. `DELETE /api/drafts/[id]` moves from `withTeamAdmin` to `withTeamAuth` + `canEditPost`. The draft `GET` returns `canEdit`. The draft page hides the edit controls when it is false.
- **FR-03 (tier coverage).** `src/lib/authz/postActionTiers.ts` exports `POST_ACTION_TIERS`, keyed `"<route file> <METHOD>"`, with the values `'view' | 'assign' | 'edit'`. `tests/unit/postActionTiers.test.ts` checks that:
  - every exported handler under `src/app/api/drafts/**` and `src/app/api/generate/**` has an entry, and every entry has a handler;
  - an `edit` handler's file calls `canEditPost(`, and a `view` or `assign` handler's file calls `canView(` or `draftVisibilityWhere(`;
  - every `DraftAction` value maps to at least one `edit` entry.
- **FR-04 (read boundary).** `tests/unit/visibilityBoundary.test.ts`: every file under `src/app/**` and `src/mcp/**` that queries `prisma.draft` or `prisma.brief` either imports `@/lib/authz/visibility` or is on an allow-list with its reason. The allow-list:
  - the dashboard's "Posts this month", which is team-wide by design (037 D11);
  - the MCP and ACP tools, which are scoped by the API key's team;
  - `src/lib/agent/**` generation internals, which receive an already authorized id.

  The test fails if `canAccessContent` or `briefVisibilityWhere` appears anywhere in `src/`.

- **FR-05 (projects API).**
  - `GET /api/projects` (any member) returns `defaultPostStyle`, `defaultTone`, `defaultBrandKit` and `postCount` (assigned briefs).
  - `POST /api/projects` (admin) takes `defaultPostStyle` (an unknown key is 400) and enforces D15 (409 `project-limit`).
  - `GET /api/projects/[id]` (any member) returns the same fields plus `postCount`, and no `campaigns`.
  - `PATCH` (admin) takes `defaultPostStyle` (null clears it, an unknown key is 400) and `defaultTone`.
  - `DELETE` (admin) works as D9.
  - Every handler answers 404 across teams.
- **FR-06 (briefing and documents on projects).** These routes move from `/api/campaigns/[id]/…` to `/api/projects/[id]/…`, with the same guards (reads for any member, writes and model calls for team admins):
  - `GET`/`POST briefing`;
  - `POST briefing/[vid]/activate`;
  - `POST briefing/chat`, `briefing/enhance` and `briefing/upgrade`;
  - `GET`/`POST documents`;
  - `DELETE documents/[docId]`.

  `src/lib/campaign/briefingAssistant.ts` and `documents.ts` move to `src/lib/projects/`, keyed on the project. Their context comes from `resolveInputsFor({ teamId, projectId })`: the project's kit, then the team default; its documents; its active briefing. New document objects use D18's prefix. The campaign routes for these are deleted in the same task.

- **FR-07 (project context and the stamp).** As D3 to D6.
  - `createPendingDraft` and `generateDraftForBrief` write `generationInputs`.
  - `runGenerationForDraft` (generation and retry), regenerate copy, regenerate design, refine, `refreshFactsCheck` and the draft `GET` read `postContext(draft)`.
  - The `generate/copy` preview route (no draft) uses `newPostContext(brief)`.
  - `briefs/enhance` takes `projectId`, checked as D12.
- **FR-08 (prompts).**
  - The briefing section in the caption, Path A, Path B and background prompts reads "Project briefing (applies to every post in this project)". `src/lib/postStyles/promptText.ts` and `src/lib/designData/promptText.ts` say "project briefing".
  - `PROMPT_VERSION_BASE` and `CAPTION_PROMPT_VERSION_BASE` go to `2026-11-01.1`, and `generationUntouched.test.ts` pins the new literal with a 038 note.
  - The post-styles dataset and `POST_STYLES_REVISION` do not change.
- **FR-09 (post style).** As D7. The brief route reads the project's `defaultPostStyle` and `defaultTone` from the checked project. The wizard's style state reads them from `GET /api/projects`. `campaignStyleKey` becomes `projectStyleKey`.
- **FR-10 (assign, move, unassign).**
  - `PUT /api/drafts/[id]/project`, with the body `{ projectId: string | null }` and the `canView` tier.
  - It checks the project as D12 and writes `Brief.projectId`.
  - It returns `{ project: { id, name } | null }` and emits `draft.project_changed`.
  - A no-op (same project) returns 200 and emits nothing.
- **FR-11 (apply project settings).** `POST /api/drafts/[id]/apply-project`, with the `canEditPost` tier.
  - It works as D8.
  - Its 409 codes are `busy` (a pending action or `IN_PROGRESS`) and `no-change` (the inputs are already current).
  - It writes `generationInputs` with a compare-and-set on the previous stamp, so a lost race is a 409 `changed`.
  - It recomputes the facts check, emits `draft.inputs_applied`, and returns the draft `GET` body.
- **FR-12 (draft GET).** The draft `GET` adds:
  - `project: { id, name } | null` (the current assignment);
  - `inputs: { project: { id, name } | null, briefingVersion, kitName, kitSource } | null` (the stamp);
  - `inputsCurrent: boolean`;
  - `canEdit: boolean`.

  `brandKitName` comes from the stamp's kit.

- **FR-13 (library).**
  - `GET /api/library` takes `projectId` (an id, or `none` for unassigned). An unknown or foreign id is 404 (D12).
  - The kit filter matches the stamp's `kitId`. For a draft with a null stamp, it matches `Brief.brandKitId` (037 D10's promise).
  - Each item gains `project: { id, name } | null`, and `brandKitName` comes from the stamp's kit.
  - The page gains the Project filter. `LibraryCard` gains the project name and a Project control (FR-10).
- **FR-14 (wizard).** As D21.
  - `CampaignStep`, `CampaignRow` and the `/api/campaigns/[id]/brandkit` query are replaced by `ProjectStep`, `ProjectRow` and the project list's `defaultBrandKit`.
  - The brief body sends `projectId`.
  - The brief-draft payload's `campaignId` becomes `projectId` (`z.string().default('')`). An old autosave with `campaignId` parses with no project, because zod strips the unknown key.
- **FR-15 (post page).** As D21: a Project block with `ProjectPicker`, "Apply project settings" with one line naming what it will apply, and the view-only state.
- **FR-16 (project page).** As D21. The campaign page's briefing section and assistant panel move to `src/components/projects/`. `campaigns/classes.ts` and `postStyleOptions.ts` move there too. Delete asks for confirmation with the post count.
- **FR-17 (dashboard and nav).** As D21. `AppShell` loses "Campaigns".
- **FR-18 (MCP and ACP).** As D13. `src/mcp/tools/generate.ts` takes `projectId` and passes the checked project to `resolvePostStyle` and to the brief. The ACP route maps `CampaignRetiredError` to 400 and `ProjectNotFoundError` to 404, each with its code. Descriptions say "project".
- **FR-19 (analytics).** As D14. `analyticsCoverage.test.ts` checks one emitter for each new event and that no catalogue field name contains "campaign".
- **FR-20 (agent tool).** As D5. `getBrandKitContext` takes no input. It returns the kit of the run's `PostContext`, with its `feedToAI` artifacts loaded by kit id and team.
- **FR-21 (campaigns removed).**
  - Routes: `/api/campaigns`, `/api/campaigns/[id]` and `/api/campaigns/[id]/brandkit`, plus the briefing and document routes (FR-06).
  - Pages: `/campaigns` and `/campaigns/[id]`.
  - Components: `src/components/campaigns/*` (moved or deleted) and `src/components/brief/CampaignStep.tsx` and `CampaignRow.tsx`.
  - Libraries: `src/lib/campaign/*` (moved or deleted).
  - Types: the `api-types` campaign types.
  - Test hooks: the mock briefing text says "project".
  - Seeds: `scripts/seed-teams.mjs` makes one project per team with a default kit, one unassigned post and one assigned post ("`<Team>` Project Post").
- **FR-22 (schema, destructive).** Migration `20261101130000_drop_campaigns`, as in D19. `schema.prisma` loses `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign`, `Brief.campaignId`, `BrandKit.campaigns` and `Project.campaigns`. Down script: `prisma/rollback/038-drop-campaigns.down.sql`.
- **FR-23 (operator scripts).**
  - `scripts/clear-campaign-data.mjs` and `scripts/sweep-campaign-documents.mjs`, as in D19.
  - Their pure planning functions live in `scripts/lib/clearCampaigns.mjs` (`planClear`) and `scripts/lib/sweepCampaignDocs.mjs` (`planSweep`).
  - Exit codes: 0 done or nothing to do; 1 bad usage; 2 missing explicit env; 3 rows or keys found on a dry run; 4 (sweep only) the drop migration has not committed.
- **FR-24 (docs).**
  - `CLAUDE.md`: the brand kit precedence, the post styles precedence and HOLD residue, the 006 note, the 038 state entry, and "Pick up here" pointing at verify 038.
  - `docs/mcp-acp-guide.md`: `projectId`, `CAMPAIGN_RETIRED`, `PROJECT_NOT_FOUND`, 2.1.0.
  - `docs/e2e-test-plan.md`: the moved and new suites.
  - `docs/deploy.md` and `docs/cold-start.md`:
    - `pg_dump`;
    - the clear dry run;
    - `--yes`;
    - `npm run db:migrate`;
    - the `migrate resolve --rolled-back` recovery;
    - the sweep dry run and `--yes`;
    - a line saying posts made before 038 become visible to the whole team.
  - `README.md`.
  - `docs/ui-reference/DESIGN_SYSTEM.md`: the module and component names, and "project" in §12.

### Non-Functional Requirements

- **NFR-01:** No real model call in any gate. The upgrade test, the clear script and the sweep's DB check use raw SQL.
- **NFR-02:** Folio, the UI token guard and the wording guard hold on every changed screen.
- **NFR-03:** No new env var. `MINIO_BUCKET_DOCS` keeps its default.
- **NFR-04:** Each task leaves `tsc`, lint and the unit suite green and commits alone. The full E2E mock suite is green at the end.
- **NFR-05:** Fresh deploy: every migration in order on an empty database, then `prisma migrate diff` against `schema.prisma` exits 0.
- **NFR-06:** The draft `GET` is the 4 s poll. 038 adds at most three queries to it: the stamp's kit, the project names, and the live comparison for `inputsCurrent`, which runs only for an `EXPORTED` draft with no pending action.
- **NFR-07:** A foreign, deleted or unknown project id gets the same 404 status and body on every surface, so the code is not an existence oracle (as M1 in `src/app/api/briefs/route.ts`).
- **NFR-08:** CI delta. The E2E suite grows by about 25 cases. The new `post-permissions` and `projects` suites are added, and the moved campaign cases are net zero. Expected time is about +1 to 2 minutes on the ~15 minute E2E job. The unit suite gains about 9 files.

## Acceptance Criteria

- **AC-01 (view tier):**
  - E2E `team-isolation.test.ts`: a same-team editor sees the admin's unassigned post in `GET /api/library` and gets 200 on `GET /api/drafts/[id]`.
  - Unit `visibility.test.ts`: `canView` is true in the same team and false across teams, and `draftVisibilityWhere(editor)` equals `{ teamId }`.
- **AC-02 (edit tier, 403):** E2E `post-permissions.test.ts` (new). A same-team editor who is not the author gets 403 `code: 'not-author'` on each of the following:
  - `PATCH` caption;
  - `PATCH` headline;
  - `DELETE`;
  - refine;
  - regenerate copy;
  - regenerate design;
  - retry;
  - apply text;
  - inline edit;
  - restore;
  - adopt;
  - `assemble-a`, `assemble-b`, `generate/copy` and `generate/image` on the admin's brief;
  - apply project.

  In each case the draft's `updatedAt`, captions and `currentRevisionNumber` are unchanged, and `GET /api/test/model-calls` records no new call. The author (an editor), a team admin and a super admin get 2xx on `PATCH` caption and on regenerate copy.

- **AC-03 (tier coverage):** Unit `postActionTiers.test.ts` passes as FR-03. A fixture handler with no entry fails the matcher.
- **AC-04 (read boundary):** Unit `visibilityBoundary.test.ts` passes as FR-04. A fixture route that filters `prisma.draft` by `teamId` without the import fails.
- **AC-05 (cross-team project ids):** E2E `team-isolation.test.ts`. A ClientX admin using a Bistec project id gets 404 `PROJECT_NOT_FOUND` from each of:
  - `POST /api/briefs`;
  - `PUT /api/drafts/[own]/project`;
  - `GET /api/library?projectId=`;
  - `POST /api/briefs/enhance`;
  - ACP `generate_post`.

  It also gets 404 on `GET`, `PATCH` and `DELETE /api/projects/[id]` and on the project briefing and documents routes. The project is unchanged afterwards.

- **AC-06 (generate_post contract):**
  - Unit `acpManifest.test.ts`:
    - the manifest and MCP versions are `2.1.0`;
    - the manifest input has `projectId` and no `campaignId`;
    - neither `src/mcp/server.ts` nor `src/acp/agent.ts` mentions `campaign`.
  - Unit `mcpGenerate.test.ts` (new): `generatePost` with `campaignId`, or with `campaign`, throws `CampaignRetiredError`; with an unknown or foreign `projectId` it throws `ProjectNotFoundError`. In both cases `prisma.brief.create` is not called.
  - E2E `acp.test.ts`: `campaignId` gives 400 `CAMPAIGN_RETIRED`, and a foreign `projectId` gives 404 `PROJECT_NOT_FOUND`.
- **AC-07 (kit precedence):**
  - Unit `resolveBrandKit.test.ts`:
    - an explicit kit wins over the project's default;
    - with no explicit kit, the project's default is used;
    - with neither, the team default is used;
    - a deleted or foreign kit at any tier is skipped;
    - another team's default is never returned.
  - E2E `resolution.test.ts` (rewritten): a brief with `projectId` and no kit gives a draft with `inputs.kitSource` `project` and the project kit's name. With a kit, it is `explicit`. A project with no kit gives `team`.
- **AC-08 (post-style precedence):**
  - Unit `postStylesResolve.test.ts`:
    - the precedence is explicit → legacy goal → project default → `general`;
    - a project tone that is not an option adds `project-tone-ignored`.
  - E2E `post-styles.test.ts` TC-PS-05/06 (rewritten for projects): a brief on a project with a default style gets that style; another project is unaffected; an editor `PATCH` of the default gets 403; an unknown default gets 400.
- **AC-09 (briefing reaches generation):**
  - Unit `prompts.test.ts` and `postContext.test.ts`:
    - `buildBriefInput(brief, ctx)` carries the context's briefing;
    - the caption, Path A, Path B and background prompts contain "Project briefing" and the text when the briefing is set, and no such section when it is null.
  - Unit `postContextSites.test.ts` passes as D6.
  - E2E `post-styles.test.ts` TC-PS-12 (rewritten): a value stated only in the project briefing, or only in a project document, is not flagged; the same value on an unassigned post is flagged.
- **AC-10 (stamp written):**
  - Unit `generationInputs.test.ts` (new):
    - `createPendingDraft` and `generateDraftForBrief` write `{ v: 1, projectId, briefingId, briefingVersion, kitId, kitSource }`, matching the brief's project, its active briefing and the resolved kit;
    - an unassigned brief writes nulls with the kit's source;
    - `parseGenerationInputs` rejects a malformed value and returns null.
  - E2E `projects.test.ts`: the draft `GET` shows `inputs.project` and `inputs.briefingVersion`.
- **AC-11 (a move only relabels):**
  - E2E `projects.test.ts`:
    1. A post is generated under project B, whose briefing states a value.
    2. A non-author editor moves it to project A, which has no sources: 200.
    3. `inputs` is unchanged and `inputsCurrent` is false.
    4. The author edits a caption, and the facts check stays `clear`.
    5. After the author's regenerate copy, `inputs` is still B.
  - Unit `postContext.test.ts`: for a draft whose `brief.projectId` differs from its stamp's, `postContext` returns the stamp's briefing and kit, and the regenerate-copy, regenerate-design and refine routes pass that context.
- **AC-12 (apply project settings):**
  - E2E `projects.test.ts`, continuing AC-11:
    1. The author applies project settings: 200.
    2. `inputs.project` is A and `inputsCurrent` is true.
    3. The facts check is `flagged`.
    4. Exactly one `draft.inputs_applied` event exists, read through `/api/test/analytics-events`.
    5. A second apply gets 409 `no-change`.
    6. A non-author editor gets 403.
  - Unit: a pending action gives 409 `busy`, and a lost compare-and-set gives 409 `changed`.
- **AC-13 (assign, move, unassign):** E2E `projects.test.ts`:
  1. A member assigns an unassigned post (200), moves it, and unassigns it.
  2. After each step, `GET /api/drafts/[id]` shows the project.
  3. One `draft.project_changed` event exists per change, with `change` set to `assign`, `move` and `unassign`.
  4. A repeat assign to the same project emits nothing.
  5. The library `projectId` filter narrows to the post, and `none` includes it after the unassign.
- **AC-14 (project delete):**
  - E2E `projects.test.ts`:
    1. `GET /api/projects/[id]` shows `postCount` 2.
    2. An editor's `DELETE` gets 403.
    3. The admin's `DELETE` gives 200 `{ unassigned: 2 }`.
    4. Both posts read `project: null` with `inputs` unchanged.
    5. The project is gone from `GET /api/projects` and gives 404 by id.
    6. A regenerate copy on one of the posts still succeeds.
  - Unit `projectDelete.test.ts`: the transaction soft-deletes and unassigns, and never deletes a briefing, a document or an object.
- **AC-15 (delete during a run):** Unit `generationInputs.test.ts`: `runGenerationForDraft` on a draft whose stamped project was soft-deleted after `createPendingDraft` reads the stamped briefing and completes `EXPORTED`.
- **AC-16 (migration fails closed):** `npm run test:upgrade` scenario 5 (new):
  1. A database at `20261101120000_project_inputs` holds a campaign with a briefing, a document, a `ProjectCampaign` link and a brief with a `campaignId`.
  2. Deploying head fails with the 038 message naming the five counts, and every row is unchanged.
  3. After `migrate resolve --rolled-back`, `clear-campaign-data.mjs` gives exit 3 on a dry run and 0 with `--yes`, and head then deploys.
  4. The brief survives with `projectId` null.
  5. `migrate diff` exits 0.
- **AC-17 (tables):** The upgrade scenario 5 and scenario 1's head checks show that:
  - `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId` do not exist;
  - `ProjectBriefing`, `ProjectDocument`, `Brief.projectId`, `Draft.generationInputs` and `Project.defaultPostStyle` do.
- **AC-18 (clear script):** Unit `clearCampaigns.test.ts`:
  - a dry run with rows prints the five counts, the document count and the team-visible post count, runs nothing, and exits 3;
  - `--yes` issues the unassign and the four deletes in order, and exits 0;
  - no rows exits 0;
  - a missing `DATABASE_URL` exits 2 before the client is imported;
  - "already migrated" exits 0.
- **AC-19 (sweep script):** Unit `sweepCampaignDocs.test.ts`:
  - `planSweep` refuses with exit 4 when the drop is not committed;
  - it selects only keys outside `brandkits/`, `screenshots/` and `projects/`;
  - a dry run lists them and exits 3;
  - `--yes` deletes exactly those keys and logs each;
  - a missing explicit env exits 2.
- **AC-20 (campaign surfaces gone):**
  - E2E `removed-routes.test.ts`: each of these answers 404 or 405, never 2xx:
    - `GET /api/campaigns`;
    - `POST /api/campaigns`;
    - `GET /api/campaigns/x`;
    - `GET /api/campaigns/x/brandkit`;
    - `GET /api/campaigns/x/briefing`;
    - `GET /api/campaigns/x/documents`;
    - `/campaigns`.
  - Unit `removedModules.test.ts`: no `src/` file imports `@/lib/campaign` or `@/components/campaigns`.
- **AC-21 (wizard):** E2E `projects.test.ts` UI case:
  1. Step 1 shows "Project" with "No project" selected.
  2. Choosing a project selects its default kit on the kit step and its default post style.
  3. The project's active briefing shows read-only.
  4. The generated post's page shows the project.
  5. A run with "No project" shows "No project".
- **AC-22 (post page view-only):** E2E `post-permissions.test.ts` UI case:
  - A non-author editor sees the Preview, Download, the caption Copy controls and the Project picker.
  - They see no Refine, Regenerate, Edit, Retry, Delete or "Apply project settings" control, and see the view-only line.
  - The author sees "Apply project settings" only after a move.
- **AC-23 (library, dashboard and nav):** E2E `library.test.ts` and `ui.test.ts`:
  - the library Project filter (all, no project, a project) narrows the list;
  - a card shows its project and can move it;
  - the dashboard "Projects" KPI equals the live project count;
  - the recent-drafts header says "Project";
  - no nav item or page heading says "Campaign".
- **AC-24 (analytics):** Unit `analyticsCoverage.test.ts`:
  - `draft.project_changed` and `draft.inputs_applied` are in `CATALOGUE`, each with exactly one emitter file;
  - no catalogue key or payload field name matches `/campaign/i`;
  - `RETIRED_EVENT_NAMES` and `RETIRED_SOURCES` are unchanged.
- **AC-25 (caps):** Unit `projectLimits.test.ts`: with 200 live projects in the team, a create gets 409 `project-limit`, and a soft-deleted project does not count. With 5 documents, a sixth upload gets 400. E2E `briefing-assistant.test.ts` keeps its 5-document cap case, now on projects.
- **AC-26 (agent tool):** Unit `agentTools.test.ts`: `getBrandKitContext` returns the run's context kit and ignores a `briefId` in the model's input, including another team's brief id. `tools.ts` has no `campaign` and no `brandKit.findFirst({ … isDefault`.
- **AC-27 (prompt versions):** Unit `generationUntouched.test.ts` pins `PROMPT_VERSION` to `2026-11-01.1+ps<rev>`, and `prompts.test.ts` checks that `CAPTION_PROMPT_VERSION` starts with `2026-11-01.1`.
- **AC-28 (wording):** Unit `uiWordingGuard.test.ts`: a fixture string "Campaign" fails, and the scan of `src/app/(app)/**` and `src/components/**` passes.
- **AC-29 (gates):** `tsc`, lint, the unit suite and the full E2E mock suite pass in CI on `v2`. Suites moved or rewritten:
  - E2E: `briefing-assistant` and `briefing-upgrade` (onto projects), `resolution`, the campaign cases of `team-isolation`, `surfaces`, `post-styles`, `a11y`, `library` and `ui`;
  - unit: `visibility`, `campaignBriefing` → `projectBriefing`, `campaignDocuments` → `projectDocuments`, `resolveBrandKit`, and `briefingAssistant`.

  New suites:
  - E2E: `post-permissions` and `projects`;
  - unit: `postActionTiers`, `visibilityBoundary`, `kitResolverBoundary`, `postContextSites`, `postContext`, `generationInputs`, `clearCampaigns`, `sweepCampaignDocs`, `projectLimits`, `projectDelete`, `mcpGenerate` and `agentTools`.

  No suite is deleted without a replacement.

- **AC-30 (docs):**
  - A grep of `CLAUDE.md`, `README.md` and `docs/{deploy,cold-start,mcp-acp-guide}.md` finds no present-tense instruction that names a campaign. History sections may.
  - `docs/deploy.md` names `pg_dump`, both scripts and the team-visibility line.

## Edge Cases

- **A post generated by MCP or ACP:** its author is the team's system user, so only team admins can edit it. Editors can view, download, copy and assign it. Before 038, editors could not see it at all.
- **A pre-038 draft (null stamp):** it resolves as unassigned (D3). "Apply project settings" writes a stamp. A move leaves it null.
- **An explicit kit deleted after generation:** `postContext` skips the missing kit and resolves the stamp's project default, then the team default. The draft `GET` shows the kit actually used.
- **A project's briefing edited after a post was made:** the post keeps the old version. `inputsCurrent` becomes false, and the author can apply.
- **A project document deleted after a post was made:** the next facts recompute no longer sees its values, so they may flag. This is an admin action, which is consistent with D4.
- **Moving a post that is mid-regenerate:** the move succeeds (grouping only). The running action keeps the context it read at its start.
- **"Apply project settings" on a post whose project was deleted:** the assignment is null, so it applies "no project" (the explicit kit, then the team default, no briefing).
- **A second draft for one brief (a direct API caller posts `assemble-*` twice):** both drafts share the assignment (D2). Each has its own stamp.
- **A wizard autosave from before 038 holding `campaignId`:** it resumes with no project (FR-14).
- **A brief route call that still sends `campaignId: ''`:** an empty string counts as present and gets 400 `CAMPAIGN_RETIRED`. The wizard no longer sends the key.
- **The upgrade scenario 1** deploys head after 037's recovery. It seeds no campaign rows, so 038's precondition passes there.
- **The local `ai_studio` database (the user's Aloys data):** if it holds campaign rows, the precondition refuses and the dry run shows them. The user decides; nothing runs without `--yes`. No task runs `npm run db:migrate` against it.

## Grounding

- Proposal, user decisions (2026-10-30): "Each draft records the project, briefing version, kit and post style it was generated with. Moving a post only relabels it. Regenerate, refine and the facts check use the recorded inputs; only a new post, or an explicit 'apply the new project's defaults' by the author or a team admin, reads the current project." This is the basis for D3, D4 and D8.
- Proposal, user decisions: "The rule: anything that calls a model, writes the post's content, or changes which inputs a later generation uses is author or admin only." This is the basis for D11.
- Proposal, user decisions: "every project id from the wizard, assign, move and MCP/ACP `generate_post` is checked against the caller's team, with 404 otherwise. `generate_post` refuses the retired campaign field with a named 400." This is the basis for D12 and D13.
- `src/lib/authz/visibility.ts:3-4`: "Spec D6: the person is the boundary; the campaign is the sharing container. 'Team-shared' is precisely: the item's brief has a non-null campaignId." This is the rule D10 replaces.
- `src/app/api/drafts/[id]/route.ts:329`: `export const DELETE = withTeamAdmin<Params>(…)`. Delete is team admin only today (see Questions).
- `src/lib/brandkit/resolve.ts:53-54`: "Resolves brand kit precedence: explicit brief kit → campaign brand kit → project default → team default". At `:105-106`, the last tier is `{ teamId, isDefault: true, isDeleted: false }`. This is the basis for D5.
- `src/lib/agent/tools.ts:113-117`: "this tool re-implements the precedence chain independently (it's the API-mode agent's getBrandKitContext tool, not a caller of resolveBrandKit)". This is the second chain D5 removes.
- `src/lib/agent/generateDraft.ts:104-108`: kit and `getActiveCampaignBriefing(brief.campaignId)` are resolved live inside `resolveGenerationInputs`, which retry re-enters (`:479-482`, "retry re-enters here"). D3 moves this to the stamp.
- `src/lib/factsCheck/sources.ts:4-7`: the sources are "the brief's topic and description, the campaign's active briefing, the resolved brand kit's voice prompt, and the parsed text of the campaign's documents". D4 re-keys them onto the stamp.
- `src/lib/analytics/catalogue.ts:7-9`: "A payload change only ADDS optional fields. Renaming or removing a field … bumps that event's schemaVersion." D14 adds no field to an existing event, so no version changes.
- `src/acp/agent.ts:8-9`: "The version is semver: a minor bump per additive change to a capability's schema." This is read together with 037 D8: "038 changes `generate_post`'s campaign input under this same major version." This is the basis for D13's 2.1.0.
- `CLAUDE.md`: "`postStylesBoundary.test.ts` fails on any other mapping" and "Precedence is explicit style, campaign default, `general`." D7 changes the middle tier only.
- `CLAUDE.md`: "**One emitter per event name:** each event has exactly one place that writes it." This is the basis for D14.
- `CLAUDE.md`: "`scripts/purge-analytics.mjs` refuses to run without an explicit `DATABASE_URL`." FR-23 copies this guard.
- `src/app/api/projects/route.ts:15`: `take: 200`. This is the basis for D15.

## Traceability: party findings

| #   | Finding (seat, severity)                                                        | Settled in                                                                                     |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | The author-or-admin edit rule has no home; callers not split (architect, BLOCK) | D10, D11, FR-02, FR-03, AC-02, AC-03                                                           |
| 2   | Which record owns `projectId` (architect, WARN)                                 | D2                                                                                             |
| 3   | Snapshot or live; effect of a move (architect, WARN)                            | D3, D4, D8, AC-11                                                                              |
| 4   | No single kit resolver; is "team default" a field (architect, WARN)             | D5, AC-07, `kitResolverBoundary.test.ts`                                                       |
| 5   | `generate_post` argument and version unspecified (architect, WARN)              | D13, FR-18, AC-06                                                                              |
| 6   | Analytics and Insights are a rule, not a list (architect, WARN)                 | D14, AC-24                                                                                     |
| 7   | Which campaign modules move or go; what Project has (architect, NOTE)           | D1, FR-06, FR-21, design "Module map"                                                          |
| 8   | A rename of Campaign builds a second project (architect, NOTE)                  | D1, D23                                                                                        |
| 9   | 038a/038b needs an interim chain (architect, NOTE)                              | D20 (no split)                                                                                 |
| 10  | No falsifiable acceptance criteria (ba, WARN)                                   | AC-01 to AC-30, each naming its test                                                           |
| 11  | "Project" has two meanings (ba, WARN)                                           | D1                                                                                             |
| 12  | Unassigned posts and "move" undefined (ba, NOTE)                                | D8, D17                                                                                        |
| 13  | Cheaper variant never weighed (po, BLOCK)                                       | D23 (user chose the full move)                                                                 |
| 14  | Assistant, chat, Improve and upgrade carried over with no value (po, WARN)      | User decision (scope): moved, not rewritten (FR-06); cost kept down per D23                    |
| 15  | Three surfaces and a permission tier unpriced (po, WARN)                        | D22 (one route, one row); D11 table prices the tiers                                           |
| 16  | Cut line 038a/038b (po, NOTE)                                                   | D20, declined: nothing deploys between commits                                                 |
| 17  | Running cost and caps (po, NOTE)                                                | D15, NFR-08                                                                                    |
| 18  | Widening reads widens writes (security, BLOCK)                                  | D10, FR-02, AC-02                                                                              |
| 19  | Caller-supplied project id not team-checked (security, BLOCK)                   | D12, AC-05                                                                                     |
| 20  | A move changes kit, briefing and facts sources (security, BLOCK)                | D3, D8, AC-11, AC-12                                                                           |
| 21  | The drop has no fail-closed guard; orphaned objects (security, BLOCK)           | D19, FR-22, FR-23, AC-16, AC-18, AC-19                                                         |
| 22  | Project delete strips inputs and destroys history (security, WARN)              | D9, AC-14, AC-15                                                                               |
| 23  | A stale campaign field silently downgrades a run (security, WARN)               | D13, AC-06                                                                                     |
| 24  | Retroactive visibility of private posts (security, NOTE)                        | D19 (migration NOTICE, clear-script count), FR-24 (deploy line)                                |
| 25  | "Moving only relabels" is unsafe without a snapshot (security, WARN)            | D3, D8 (relabel holds because of the stamp)                                                    |
| 26  | The principle puts the move in the open tier (security, WARN)                   | D11 (move is open only because of D3 and D8)                                                   |
| 27  | `projectId` does two jobs; stamp provenance (visionary, WARN)                   | D2 (assignment), D3 (provenance on the draft)                                                  |
| 28  | Single-valued for good, or separate grouping (visionary, WARN)                  | D16                                                                                            |
| 29  | One function for the project context, with a guard (visionary, WARN)            | D6, AC-09 (`postContextSites.test.ts`)                                                         |
| 30  | State the principle; coverage test (visionary, WARN)                            | D11, FR-03, AC-03                                                                              |
| 31  | Owner-keyed briefing store; fallback tier (visionary, NOTE)                     | D17, declined: no second owner is asked for, and the kit voice prompt is already the team tier |
| 32  | Keep `visibility.ts` the only read predicate (visionary, NOTE)                  | FR-04, AC-04                                                                                   |
| 33  | A rename leaves two "project" entities (visionary, WARN)                        | D1, D23                                                                                        |

## Questions for the user

- **Q1. May an editor delete their own post?** Today `DELETE /api/drafts/[id]` is team admin only (`src/app/api/drafts/[id]/route.ts:329`). The program decision lists delete with edit ("only the author and team admins edit, refine, regenerate, change the kit of or delete a post"), which would let an editor delete a post they made. **Answered (user, 2026-10-31): yes, author or team admin.** Delete moves to `canEditPost` in T1, as the decision reads.
