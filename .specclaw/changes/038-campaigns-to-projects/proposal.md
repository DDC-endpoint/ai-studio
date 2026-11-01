# Proposal: Replace campaigns with projects

**Created:** 2026-10-28
**Status:** 🟡 Draft

## Problem

The user (2026-10-28) wants the campaign system removed entirely. Campaigns carry four things the user wants to keep: a default brand kit, a briefing injected into generation, reference documents for the facts check, and a default post style and tone. Projects are the grouping the user wants instead. Today a project reaches a post only through a campaign (campaign → `ProjectCampaign` → project). `Brief` and `Draft` have no `projectId`, so a post cannot be assigned to a project at all.

Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`. Removing campaigns without replacing that rule would make every post private to its author.

This is change 2 of 3. It depends on 037, which removes the campaign queue.

## Proposed Solution

1. **A post belongs to zero or one project.**
   - Add a nullable `projectId` on the post (on `Brief`, unless the plan finds `Draft` the better owner).
   - Deleting a project unassigns its posts.
   - The wizard's first step, "Campaign", becomes an optional project picker.
   - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
   - The project page lists its posts, and the library filters by project.
2. **Projects take over the campaign's generation inputs:**
   - **Default brand kit.** The field exists already and now applies directly. Kit precedence becomes: explicit brief kit → project default kit → team default kit.
   - **Briefing.** The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes. It is injected wherever the campaign briefing is today: Path A, Path B, the background art director, captions and the facts-check sources.
   - **Documents.** Uploaded reference documents move to projects, and the facts check compares against them.
   - **Default post style and tone.** Post-style precedence becomes: explicit → project default → `general`. `resolvePostStyle` stays the only resolver.
3. **Permissions.** Team admins create, rename and delete projects and edit their briefing, documents and defaults. Any team member can assign or move a post.
4. **Visibility.** Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
5. **Removal.**
   - A migration drops `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId`, and creates the project equivalents. It ships a manual down script. The system starts fresh, so no data is carried over.
   - The campaign pages, nav entry, routes, components and `src/lib/campaign/*` are removed or moved under projects.
   - The dashboard's recent-drafts Campaign column becomes Project, and the dashboard gains a "Projects" count (moved here from 037 by the 037 party review).
6. **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
7. **Analytics.** Any event field that names a campaign is replaced by the project, with a `schemaVersion` bump. Insights loses anything campaign-based.
8. **Docs and tests.**
   - Update `CLAUDE.md`, `docs/mcp-acp-guide.md` and `docs/e2e-test-plan.md`.
   - Move the E2E suites `briefing-assistant`, `briefing-upgrade` and the campaign parts of `team-isolation`, `surfaces` and `library` to projects.
   - Rewrite the unit tests `visibility`, `campaignBriefing` and `campaignDocuments`.
   - The full mock suite stays green.

## Scope

### In Scope

- Everything listed under Proposed Solution.
- Project create, rename and delete, a briefing section, a documents section, defaults, and the post list on the project page.

### Out of Scope

- Scheduling and publishing removal (037, which comes first).
- Caption rework, Facebook and the caption Insights metrics (039).
- Nested projects, and a post in several projects.

## Impact

- **Size:** architectural (it changes the sharing model, the kit and post-style resolver tiers, the schema and the MCP/ACP contract)
- **Files affected:** ~80 (estimated, including tests and docs)
- **Complexity:** large
- **Risk:** medium-high. The visibility rewrite touches about 24 routes, and the team-isolation E2E suite is the guard. The resolver signature change touches every caller, and `postStylesBoundary.test.ts` is the guard.

## Open Questions

- **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post. Other members can view, download, copy captions and assign it to a project.
- The plan must confirm the right owner for `projectId` (`Brief` or `Draft`) from how regenerate and revisions use them.

### Party review (2026-10-30): CHANGES_REQUESTED, 33 upheld (6 BLOCK, 18 WARN, 9 NOTE), 2 withdrawn — see party-report.md

- (party-architect, BLOCK) The author-or-admin edit rule has no home; name one predicate (e.g. `canEditPost`) and split the ~24 `visibility.ts` callers into read, assign and edit.
- (party-security, BLOCK) Widening the read predicate widens writes unless a separate `canModify` gate and a guard test exist; add same-team non-author 403 E2E cases.
- (party-security, BLOCK) A caller-supplied project id (wizard, assign, move, MCP/ACP) must be checked against the caller's team, 404 on mismatch, with cross-team tests.
- (party-security, BLOCK) A member who may not edit a post can change its kit, style, briefing and facts-check sources by moving it; snapshot the inputs on the draft, or limit moves of an assigned post to author and admins.
- (party-security, BLOCK) The table drop needs a fail-closed guard (refuse when campaign rows exist), a named recovery path, and a rule for orphaned `CampaignDocument` objects in storage.
- (party-po, BLOCK) A cheaper variant is not weighed; justify the full move against extending the existing Project with only the link and visibility rule (party-architect and party-visionary rebut a plain rename: it would leave two project entities).
- (party-architect) Decide which table owns `projectId` (`Brief` or `Draft`) in the proposal, with the brief-to-draft cardinality; only one table carries it.
- (party-architect) Say whether project inputs are snapshotted at generation (which stamp) or read live, and what a move does to the facts check and the next regenerate.
- (party-architect) Name the single kit resolver and its guard; say whether "team default kit" is an existing field.
- (party-architect) Specify the `generate_post` project argument (id or name), the error for an unknown or foreign project, how a stale `campaign` field is handled, and the new manifest version.
- (party-architect) List the analytics events and Insights sections that change, whether the event's project is the one at generation, and whether assign and move emit events.
- (party-architect, NOTE) List which `src/lib/campaign/*` modules move and which are deleted, and which project surfaces exist today.
- (party-architect, NOTE) A plain rename of Campaign builds a second project entity; any cheaper variant should extend the existing Project.
- (party-architect, NOTE) A 038a/038b split needs an interim kit, style and briefing chain covering both `campaignId` and `projectId`.
- (party-security) Deleting a project silently strips its posts' inputs and destroys briefing history; add a confirmation naming the post count, a soft delete or retention window, and a named failure for a mid-run deletion.
- (party-security) `generate_post` must answer 400 with a named error for the retired campaign field or an unresolved project id, never treat either as "no project".
- (party-security) "Moving only relabels" is safe only with a snapshot; otherwise a non-author's move changes the author's next regenerate.
- (party-security) The principle "changes only its grouping is any member" puts the input-switching move in the open tier unless inputs are snapshotted.
- (party-security, NOTE) Posts made private under the old rule become team-visible; log the count in the migration and say so in the deploy notes.
- (party-ba) The proposal has no falsifiable acceptance criteria; list per-behaviour checks (kit and style precedence, briefing in the prompt, non-author 403, unassign on delete).
- (party-ba) Say whether the existing Project table gains briefing, documents, style and tone, or a new table replaces it, and which Project fields stay.
- (party-ba, NOTE) Say what an unassigned post uses for briefing and facts-check sources, and that a move does not re-run generation.
- (party-po) The briefing assistant, chat, Improve and upgrade routes are ported with no stated value; consider a plain versioned briefing editor first.
- (party-po) Three assignment surfaces (wizard, post page, library) and an extra permission tier are unpriced; ship wizard and post-page assign first.
- (party-po, NOTE) Name a cut line, e.g. 038a (visibility, `projectId`, picker, project page) and 038b (briefing, documents, defaults, drop, analytics).
- (party-po, NOTE) State the CI delta and caps on projects per team and documents per project.
- (party-visionary) Keep the mutable assignment and the generation provenance separate: stamp `{ projectId, briefingVersion }` on the draft at generation.
- (party-visionary) Say a post's project is single-valued for good, or keep many-valued grouping separate from the single configuration source now.
- (party-visionary) One function should return a post's project context, with a call-site guard test, so 039's new caption calls cannot miss the briefing.
- (party-visionary) State the principle behind the edit/view split and back `canEditPost` with a coverage test for every draft action.
- (party-visionary) Rebuttal: an in-place rename of Campaign leaves two "project" entities; reuse the briefing and document machinery under the existing Project instead.
- (party-visionary, NOTE) Key the briefing store and routes on an owner, and give the briefing a fallback tier (or say why none).
- (party-visionary, NOTE) Keep `visibility.ts` as the only read predicate, with a boundary test against inline team filters.

### Decisions after the party review (user, 2026-10-30)

- **Scope (party-po BLOCK):** the full move, as approved. The existing `Project` table gains the briefing, documents and default post style, and `Campaign` is dropped; a rename of Campaign is rejected because it would leave two project entities. The briefing assistant, chat, Improve and upgrade routes move too, re-keyed onto projects. The plan adds a "cheaper variant considered" note.
- **Post moves (party-security BLOCK 3):** snapshot at generation. Each draft records the project, briefing version, kit and post style it was generated with. Moving a post only relabels it. Regenerate, refine and the facts check use the recorded inputs; only a new post, or an explicit "apply the new project's defaults" by the author or a team admin, reads the current project. Any member can still assign and move.
- **Migration (party-security BLOCK 4):** fail closed, as in 037. It refuses when campaign rows exist unless the operator acknowledges, and the docs name a `pg_dump` first. An operator-run, logged script deletes the stored campaign document objects after the drop has committed; it refuses without an explicit `DATABASE_URL`. Nothing runs automatically.
- **Edit rights (party-architect and party-security BLOCK 1):** `canView` (any team member) and `canEditPost` (author or team admin, via `hasRole`). The ~24 callers of `visibility.ts` are sorted into these tiers, a coverage test gives every post action a tier, and E2E cases show a non-author editor in the same team gets 403. The rule: anything that calls a model, writes the post's content, or changes which inputs a later generation uses is author or admin only.
- **Project ids (party-security BLOCK 2):** every project id from the wizard, assign, move and MCP/ACP `generate_post` is checked against the caller's team, with 404 otherwise. `generate_post` refuses the retired campaign field with a named 400.
- The WARN and NOTE findings are settled in the plan.
