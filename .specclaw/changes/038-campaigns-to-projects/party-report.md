# Party Report: 038-campaigns-to-projects

**Reviewed:** 2026-10-30
**Tier:** deep (classifier) — Removes the campaign model and its visibility rule, so every post becomes visible to the whole team with edit rights split by author and admin, while a migration drops Campaign, CampaignBriefing, CampaignDocument, ProjectCampaign and Brief.campaignId and moves kit, briefing, documents and post-style resolution to projects.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

35 findings: 6 BLOCK, 18 WARN, 9 NOTE upheld — 2 withdrawn

## Findings

### [BLOCK] party-architect — The author-or-admin edit rule has no home, and the 24 visibility callers are not split into read and write

**Quotes:** > Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`.
**Quotes:** > 4. **Visibility.** Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
**Quotes:** > - **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post. Other members can view, download, copy captions and assign it to a project.
**Problem:** The proposal sets three access levels for a post: view (any member), assign or move (any member), and edit, refine, regenerate, change kit or delete (author or team admin). Proposed Solution item 4 changes only the read predicate, and it changes it to the most permissive answer. The edit tier appears only under Open Questions. It has no named predicate or module, and no step in the solution builds it. The proposal does not say whether the ~24 callers of `visibility.ts` include write routes. If they do and the rewrite lands as written, every member gets every write. If they do not, the edit rule has no single owner, and each write route gets its own author-or-admin check. Either way the merge has to sort all ~24 callers into view, assign and edit, and put a gate on each write route, and the proposal names neither. The only guard it names, the team-isolation E2E suite, tests separation between teams. It does not test author against non-author inside one team. party-security's first BLOCK reaches the same co-change from the access-control side. This finding stays because the gap is structural too: the rule has no owning module and the callers have no assigned tiers.
**Fix:** Add the edit tier to Proposed Solution item 4. Give it one named predicate next to the visibility rule (for example a `canEditPost` in `src/lib/authz/`). List which callers move to it and which keep the read predicate. Name the test that checks a non-author editor is refused on each write route.
**Status:** upheld

### [WARN] party-architect — Which record owns `projectId` is left to the plan, but the migration, library filter, assign action and MCP contract all depend on it

**Quotes:** > - Add a nullable `projectId` on the post (on `Brief`, unless the plan finds `Draft` the better owner).
**Quotes:** > - The plan must confirm the right owner for `projectId` (`Brief` or `Draft`) from how regenerate and revisions use them.
**Quotes:** > - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
**Problem:** The column's owner decides what "a post" means for assignment. If one brief can have several drafts, putting the column on `Brief` means moving one post from the post page also moves its sibling drafts. Putting it on `Draft` means generation, which runs from the brief, has to read the project from a record that does not exist yet when generation starts. The migration, the library filter query, the project page's post list, `generate_post`'s new argument and the analytics project field all join on this column. Leaving the owner open lets two implementers build different schemas from the same proposal. It also leaves room for a column on both records, which would give one fact two writers.
**Fix:** Decide the owner in the proposal, and state the brief-to-draft cardinality that the decision relies on. Say explicitly that only one table carries `projectId`.
**Status:** upheld

### [WARN] party-architect — It is unspecified when project inputs are resolved, so the effect of moving a post on regenerate, refine and the facts check is undefined

**Quotes:** > - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
**Quotes:** > - **Briefing.** The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes. It is injected wherever the campaign briefing is today: Path A, Path B, the background art director, captions and the facts-check sources.
**Quotes:** > Kit precedence becomes: explicit brief kit → project default kit → team default kit.
**Problem:** Under campaigns the grouping was set once on the brief. Here a post can be assigned, moved or unassigned after generation, and any member can do it, including members who may not edit the post. The proposal does not say whether project inputs (default kit, briefing version, documents, default post style and tone) are copied onto the post at generation or read live at each later operation. If they are read live, one member's move silently changes the kit, briefing and post style that the author's next regenerate uses. It also leaves a stored facts-check result that was checked against the old project's documents. If they are copied, the proposal needs a stamp for them, and it names none. Two implementers would build this differently. party-security (third BLOCK), party-visionary (first WARN) and party-ba (NOTE on "move") reached the same gap from three other lenses. That agreement supports keeping this open as a contract the proposal has to state.
**Fix:** Say whether project inputs are snapshotted at generation (and where: which stamp or column) or resolved at each operation. Then say what a move does to an existing post's facts check and to its next regenerate.
**Status:** upheld

### [WARN] party-architect — Kit precedence changes, but unlike post style, no single kit resolver is named

**Quotes:** > - **Default brand kit.** The field exists already and now applies directly. Kit precedence becomes: explicit brief kit → project default kit → team default kit.
**Quotes:** > - **Default post style and tone.** Post-style precedence becomes: explicit → project default → `general`. `resolvePostStyle` stays the only resolver.
**Problem:** For post style, the proposal names the one resolver that every caller goes through and its guard (`postStylesBoundary.test.ts`, in Impact). For kits it gives the new order but names no resolver, no list of callers and no guard. So no one can check at merge whether a caller still uses the campaign tier or builds the new order itself. The last tier is also called "team default kit". The proposal never says whether that is the existing default tier under a new name or a new per-team default. If it is new, it is a schema change the proposal does not list.
**Fix:** Name the function that resolves a post's kit and the guard that keeps it the only one. Say whether "team default kit" is an existing field or a new one.
**Status:** upheld

### [WARN] party-architect — The new `generate_post` project argument and the version bump are not specified

**Quotes:** > 6. **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
**Problem:** This contract is shared with external clients, and an implementer would have to guess at least three things. First, is the project identified by id or by name? Second, what happens when the project is unknown or belongs to another team: a refusal (with what error) or a silent unassign? Third, what happens when an existing client still sends the campaign argument: an error, or is it quietly ignored? Dropping a parameter breaks the clients that send it, yet the proposal only says the version "goes up". It does not say by how much, or what changes in `docs/mcp-acp-guide.md`. MCP and ACP are two surfaces, so without a stated contract they can diverge on each of these points. party-security (cross-team BLOCK, stale-campaign WARN) and party-visionary (manifest WARN) name the same unspecified points from their own lenses.
**Fix:** In the proposal, state the argument's name and type, the error for an unknown or other-team project, how a stale `campaign` argument is handled on both surfaces, and the new manifest version.
**Status:** upheld

### [WARN] party-architect — Analytics and Insights co-changes are a rule, not a list

**Quotes:** > 7. **Analytics.** Any event field that names a campaign is replaced by the project, with a `schemaVersion` bump. Insights loses anything campaign-based.
**Quotes:** > - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
**Problem:** The proposal does not list which events carry a campaign field or which Insights sections go. It also does not say whether "project" on an event means the project at generation time or the current one. Posts can now be moved, so those two readings give different per-project counts. Assign, move and unassign are new post actions, and the proposal names no event for them. A co-change given only as a rule gets applied unevenly. The event catalogue, the emitters and the Insights queries all have to change in the same commit, and any event the rule misses leaves the catalogue change half-landed.
**Fix:** List the affected event names and the Insights sections being removed. Say whether the project field means the project at generation time. Say whether assign and move emit an event, and which one.
**Status:** upheld

### [NOTE] party-architect — Which campaign modules are moved and which are deleted is left open, and so is what Project already has

**Quotes:** > - The campaign pages, nav entry, routes, components and `src/lib/campaign/*` are removed or moved under projects.
**Quotes:** > - Project create, rename and delete, a briefing section, a documents section, defaults, and the post list on the project page.
**Problem:** "Removed or moved" does not split `src/lib/campaign/*` into code that moves (briefing versioning, the assistant, Improve and upgrade, documents) and code that is deleted. The in-scope list includes project create, rename and delete. Yet the proposal also says a project and its default kit already exist ("The field exists already") and refers to "the project page" as an existing page. If project CRUD and its page already exist, the change risks building a second set next to them. If they do not, that is new surface the proposal does not mark as new. party-ba's WARN on whether Project is new or reused is the same ambiguity read from the definitions side.
**Fix:** List the campaign modules that move and the ones that are deleted. Say which project surfaces exist today and which this change adds.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's "rename the campaign as the project" variant: on the proposal's own account, that builds a second grouping entity

**Quotes:** > Today a project reaches a post only through a campaign (campaign → `ProjectCampaign` → project).
**Quotes:** > 2. **Projects take over the campaign's generation inputs:**
**Quotes:** > - **Default brand kit.** The field exists already and now applies directly.
**Problem:** party-po's BLOCK asks for the cheaper variant: "rename or reshape the existing campaign object as the project". The proposal says a Project entity already exists, sits above campaigns through `ProjectCampaign`, and already carries a default-kit field. Renaming Campaign to Project would therefore leave two project-like entities: the existing Project and the renamed Campaign. Each would have a default kit, and a post would reach one through the other. That is the duplicate this lens exists to catch, and the kit chain would need a rule for which of the two tiers wins. Structurally, the variant that avoids a second grouping is the one the proposal picks: move the inputs onto the existing Project and drop Campaign. This rebuttal covers only the structure. Whether the move is worth its cost is still party-po's question.
**Fix:** If the panel keeps the cheaper-variant finding, its fix should be stated as "extend the existing Project with only the link and the visibility rule". It should not be "rename Campaign", which would build a second Project.
**Status:** upheld

### [NOTE] party-architect — Coupling fact behind party-po's 038a/038b split: an interim release runs two grouping columns and a kit chain that neither half states

**Quotes:** > Removing campaigns without replacing that rule would make every post private to its author.
**Quotes:** > Kit precedence becomes: explicit brief kit → project default kit → team default kit.
**Quotes:** > - A migration drops `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId`, and creates the project equivalents.
**Problem:** party-po's NOTE proposes landing visibility, `projectId` and the picker before the campaign drop and the input move. Structurally, that interim state has both `Brief.campaignId` and the new `projectId` live on the same post. The campaign kit tier, briefing and documents still feed generation, while the project default kit also applies. The stated kit chain has no campaign tier, so it does not describe that state. Either the interim release needs a chain with both tiers and an order between them, or the project tier waits for the campaign drop. The `generate_post` argument and the analytics fields would each change twice. This does not argue for or against the split. It names what must change together if the split is taken.
**Fix:** If the split is adopted, state the interim kit, post-style and briefing chain that covers both `campaignId` and `projectId`. Also state which half changes the MCP/ACP argument and the event fields.
**Status:** upheld

### [WARN] party-ba — Acceptance criteria are not falsifiable for the headline claims

**Quotes:**

> The full mock suite stays green.
> Move the E2E suites `briefing-assistant`, `briefing-upgrade` and the campaign parts of `team-isolation`, `surfaces` and `library` to projects.
> **Problem:** The proposal has no acceptance criteria. The only verification statements are that the existing suite stays green and that suites are moved. Nothing observable states the new behaviours: kit, briefing and style inherited from the project, a 403 for a non-author non-admin editor, unassignment on project delete, and facts-check using project documents. A suite rewritten alongside the code can pass without testing any of these. The main claim, that projects take over the campaign inputs, is unverified at ship time.
> **Fix:** List per-behaviour criteria, each with an observation that would fail it: kit precedence order, style precedence, briefing present in the prompt, a 403 for a non-author editor, and unassignment on delete.
> **Status:** upheld

### [WARN] party-ba — "Project" carries two meanings: existing entity versus new campaign-like entity

**Quotes:**

> Today a project reaches a post only through a campaign (campaign → `ProjectCampaign` → project).
> **Default brand kit.** The field exists already and now applies directly.
> A migration drops `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId`, and creates the project equivalents.
> **Problem:** "Project" has two readings. It is either the existing Project entity, which already has a kit field and sits above campaigns, or a new campaign-like entity ("creates the project equivalents"). The proposal never says whether the existing Project table gains briefing, document, style and tone columns, or whether a new table replaces it. It also does not say which existing Project semantics survive. The two readings produce different migrations. "The field exists already" also conflicts with "creates the project equivalents".
> **Fix:** Define Project's current role and which of its fields stay, and say whether the migration alters or replaces the Project table.
> **Status:** upheld

### [NOTE] party-ba — Optional assignment and "move" leave unassigned or reassigned posts with undefined default behaviour

**Quotes:**

> The wizard's first step, "Campaign", becomes an optional project picker.
> Any team member can assign a post to a project, move it or remove it.
> **Problem:** Assignment is optional and any member can reassign, so a post may sit in no project or the wrong one, and the project defaults then silently do not apply. The proposal does not say what briefing and facts-check sources an unassigned post uses. "Move" is ambiguous: it may re-run generation or only relabel the post.
> **Fix:** State that moving a post only relabels it, and that defaults apply at generation time only.
> **Status:** upheld

### [BLOCK] party-po — Cheapest variant never considered: a project as a plain grouping, with campaign inputs migrated later or not at all

**Quotes:**

> Projects take over the campaign's generation inputs:
> Files affected:** ~80 (estimated, including tests and docs)
> Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files
> **Problem:** The proposal bundles four separable things into one ~80-file, medium-high-risk change. They are: (a) the visibility rewrite, which is required, (b) the post-to-project link, (c) moving briefing, documents, kit and style defaults, and (d) deleting campaigns. A much cheaper variant exists. Rename or reshape the existing campaign object as the project, keep its briefing, documents and defaults machinery in place, and add only the nullable `projectId` and the team-wide visibility rule. That variant captures most of the value without moving the briefing assistant, chat, Improve and upgrade routes, the document store, the three E2E suites and the analytics schema bumps. The proposal never weighs this option or says why a move is better than a rename. Do-nothing is also unpriced. Today a post cannot be grouped at all, but the proposal gives no usage numbers and no figure for the briefing and document features it is relocating.
> **Fix:** Add a "cheaper variant considered" paragraph. Either justify the full move against an in-place rename of the campaign tables, or cut to the rename. Name the cost of each.
> **Status:** upheld

### [WARN] party-po — Briefing assistant, chat, Improve and upgrade routes are carried over with no stated value

**Quotes:**

> The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes.
> Move the E2E suites `briefing-assistant`, `briefing-upgrade`
> **Problem:** The user's stated need is the briefing text injected into generation. The assistant, chat, Improve and upgrade surfaces are authoring conveniences with their own routes, tests and model spend. The proposal ports all of them without attaching a value to each, in a program whose goal is "generate, download, copy a caption". Carrying them over increases the file count and the E2E rework.
> **Fix:** Ship a plain versioned briefing editor on projects. Keep the assistant, chat, Improve and upgrade routes as an optional follow-up, or state the value that justifies porting each one now.
> **Status:** upheld

### [WARN] party-po — Three different edit-permission tiers and an unpriced assign-anywhere rule add UI and test surface

**Quotes:**

> On the post page and in the library, any team member can assign a post to a project, move it or remove it.
> Project create, rename and delete, a briefing section, a documents section, defaults, and the post list on the project page.
> **Problem:** The proposal adds three assignment surfaces (wizard, post page, library) and a separate permission tier (any member may assign, only the author or an admin may edit). Each surface and each tier needs UI, tests and rules. No value is stated for assigning from the library as well as from the post page. The cost is also unstated, because the permission matrix is not enumerated.
> **Fix:** Ship the wizard picker and the post-page assign first. Add library bulk or inline assign only if there is demand.
> **Status:** upheld

### [NOTE] party-po — Cut line: ship visibility and projectId before the input migration

**Quotes:**

> Removing campaigns without replacing that rule would make every post private to its author.
> This is change 2 of 3. It depends on 037, which removes the campaign queue.
> **Problem:** The visibility rewrite and the project link are what unblock 039 and the user's goal. Moving the briefing, the documents and the analytics schemaVersion bumps are separately valuable and separately shippable. The proposal names no cut line, so one slip in the 80-file change delays all of it.
> **Fix:** Name an explicit split: 038a covers visibility, `projectId`, the picker and the project page. 038b covers briefing, documents, defaults, the campaign drop and the analytics bump.
> **Status:** upheld

### [NOTE] party-po — Running cost of the larger resolver and visibility change is not stated

**Quotes:**

> Risk:** medium-high. The visibility rewrite touches about 24 routes, and the team-isolation E2E suite is the guard.
> **Problem:** The proposal states no operator attention or CI cost. The full mock suite is already 598-plus tests. It is not stated whether the moved suites change CI minutes, and no bound is set on the project count or on document storage per project.
> **Fix:** State the expected CI delta, and the caps on projects per team and on documents per project (or "uncapped, as campaigns are today").
> **Status:** upheld

### [BLOCK] party-security — Widening the read predicate can widen write access, because no separate author-or-admin gate is designed

**Quotes:**

> In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`.
> **Visibility.** Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
> **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post.
> **Problem:** The Proposed Solution changes one predicate that about 24 files share, and widens it to every team member. Today a route that uses "can see" as its gate for edit, refine, regenerate, kit change or delete is safe only because "can see" is narrow. Once the predicate is rewritten, every such route lets any team member write to any teammate's post. The author-or-admin rule exists only as a decided Open Question. No item in the Proposed Solution adds the separate write check that would enforce it. The stated guard, the team-isolation E2E suite, tests across teams, not across members of one team. So the failure grants access instead of refusing it, and an over-broad write looks the same as the intended broader read. In round 2, party-architect (BLOCK, "The author-or-admin edit rule has no home") reached the same gap independently from the structural side, and party-ba's acceptance-criteria WARN asks for the same non-author 403. Nothing in round 2 shows that the 24 callers are read-only, so the exposure stands.
> **Fix:** Split the predicate in the design into `canView` (team membership) and `canModify` (author, or team admin and above via `hasRole`). Require every write route among the ~24 to call `canModify`, with a guard test that fails if a write handler calls only `canView`. Add E2E cases in which a non-author editor in the same team gets 403 on edit, refine, regenerate, kit change and delete.
> **Status:** upheld

### [BLOCK] party-security — A caller-supplied project id pulls a project's briefing, documents and kit into generation, and no team-ownership check is stated

**Quotes:**

> **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
> On the post page and in the library, any team member can assign a post to a project, move it or remove it.
> It is injected wherever the campaign briefing is today: Path A, Path B, the background art director, captions and the facts-check sources.
> **Problem:** A project id now comes from three places: an API-key holder (MCP/ACP), the wizard, and any member's assign or move request. That id then decides which briefing text goes into the model prompts, which documents the facts check reads, and which default kit is used. The proposal never says the id is checked against the caller's team, or the API key's team, before use. A project id from another team would inject that team's private briefing and documents into the caller's generation, and some of that content could come back in the output. The ACP/MCP surface is the unattended, key-authenticated entry point, so a forged id costs least to try there. party-architect's WARN on the `generate_post` contract asks "what happens when the project is unknown or belongs to another team", which confirms that the proposal leaves this unspecified. No seat showed that the check exists.
> **Fix:** State in the design that every write of `projectId` (wizard, assign, move, `generate_post`) and every read at generation time checks `project.teamId === caller team`, and answers 404 (not 403) on a mismatch. Add cross-team cases to the team-isolation suite: MCP `generate_post` with a foreign project, and a foreign project on assign and on move.
> **Status:** upheld

### [BLOCK] party-security — A member who may not edit a post can still change its kit, briefing and facts-check sources by moving it between projects

**Quotes:**

> Any team member can assign or move a post.
> Kit precedence becomes: explicit brief kit → project default kit → team default kit.
> Post-style precedence becomes: explicit → project default → `general`.
> Other members can view, download, copy captions and assign it to a project.
> **Problem:** The decided rule bars non-authors from editing, regenerating or changing the kit of a post. But any member can assign a project, and the project feeds the kit tier, the post-style tier, the briefing and the facts-check documents. On a post with no explicit kit, a non-author can switch its effective kit, style, briefing and facts sources just by moving it. The change takes effect on the author's next regenerate or caption edit, so it is the forbidden kit change by another route. The same lever lets anyone, the author included, move a flagged post into a project whose documents contain the flagged numbers and get a `clear` facts check on recompute. The party being checked can choose what it is checked against. party-architect (WARN, resolution timing) and party-visionary (WARN, `projectId` does two jobs) found the same unresolved live-versus-snapshot question from the design side. Their findings confirm that the proposal leaves it open. I keep this one at BLOCK because of the gaming angle, which is specific to this lens: the facts-check verdict can be controlled by the party it judges.
> **Fix:** Pick one of two options. Either snapshot the resolved kit, style, project and briefing version on the draft at generation, so a later move does not change what an existing post regenerates with until the author or an admin confirms; or limit moving an already-assigned post to its author and team admins. In either case, record in `Draft.factsCheck` the project id the facts check ran against, and record who moved the post (an event), so a changed verdict can be traced.
> **Status:** upheld

### [BLOCK] party-security — The destructive table drop has no fail-closed guard, and orphaned private documents are left with no recovery path

**Quotes:**

> A migration drops `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId`, and creates the project equivalents. It ships a manual down script. The system starts fresh, so no data is carried over.
> **Problem:** "The system starts fresh" describes the deploy target. The migration, however, runs on every database where `db:migrate` runs, and nothing in the proposal stops it on a database that still holds campaign rows. A down script can recreate the schema but not the dropped briefings, briefing versions or document rows. The proposal also never says what happens to the `CampaignDocument` objects in private object storage. If they are left, the uploaded reference documents become unreferenced private objects that no UI or route can list or delete. If they are deleted, that deletion is a second irreversible effect with no recovery path. Either way, the operator gets no signal about what was destroyed or orphaned. No round-1 finding from another seat addresses this, and nothing argues that the migration is guarded.
> **Fix:** Make the migration fail closed: it refuses to run, with a clear error, when `Campaign` or `CampaignDocument` has rows, unless the operator gives an explicit acknowledgment. Name the operator's recovery path (a `pg_dump` before migrating). Specify how the stored document objects are handled: either a scripted, logged sweep of the campaign prefix that runs only after the drop has committed, or a documented list of the orphaned keys.
> **Status:** upheld

### [WARN] party-security — Deleting a project silently strips the generation inputs of every assigned post and destroys its briefing history

**Quotes:**

> Deleting a project unassigns its posts.
> Team admins create, rename and delete projects and edit their briefing, documents and defaults.
> **Problem:** Deleting a project makes its posts fall back silently to the team default kit, to the `general` style and to no briefing or facts-check documents, starting with their next regenerate or caption edit. Their authors get no notice. The versioned briefing and the uploaded documents are destroyed, and no confirmation, soft delete or restore is stated. The proposal also does not cover a deletion that races an async generation already running for that project: the generation may go ahead without the briefing and look like a healthy run. party-visionary's WARN names the same silent fallback ("A regenerate after a move, or after the project is deleted, quietly runs with a different kit, briefing and style"), which supports this.
> **Fix:** Require a confirmation that names the number of assigned posts. Soft-delete the project, or keep its briefing versions and documents for a retention window, so an admin can restore it. At generation time, treat a project that vanished mid-run as a named failure, or stamp a visible "project removed, generated without briefing" note on the draft, instead of degrading silently.
> **Status:** upheld

### [WARN] party-security — An MCP/ACP client that still sends a campaign may be silently downgraded to a run without its briefing

**Quotes:**

> `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
> **Problem:** Existing MCP/ACP clients send a campaign field. The proposal does not say whether that now-unknown field, or an unknown or deleted project id, is refused or ignored. If it is ignored, an unattended caller that expected its briefing and documents gets a post generated without them, with a generic kit and no facts sources. The response looks like a success, and no human in that loop will notice. party-architect (contract unspecified) and party-visionary (precedent for removals) reached the same gap from their own lenses. This finding owns the fail-open reading only: a silent "no project" outcome.
> **Fix:** Answer 400 with a named error when `generate_post` gets the retired campaign field, or a project id that does not resolve in the caller's team. Never treat either case as "no project".
> **Status:** upheld

### [NOTE] party-security — The visibility widening applies retroactively to posts their authors created as private

**Quotes:**

> Every member of a team sees every post in that team.
> Removing campaigns without replacing that rule would make every post private to its author.
> **Problem:** Under the current rule, a post without a campaign is private to its author. On any database that already holds posts when this change deploys, every such post becomes visible to the whole team at once, and the authors get no signal. Once a teammate has seen a post, the disclosure cannot be undone. The exposure is limited because the deploy starts fresh, but the migration and the new rule apply wherever the change runs. party-ba's WARN, which asks the proposal to state that private-to-author posts are retired on purpose, covers the premise. This NOTE covers only the runtime disclosure and its visibility to the operator, so the two do not duplicate each other.
> **Fix:** Have the migration log a count of the briefs that change from author-only to team-visible. State in the deploy notes that drafts created before 038 become team-visible.
> **Status:** upheld

### [WARN] party-security — Rebuttal to party-ba's NOTE: "moving only relabels" is unsafe unless the generation inputs are snapshotted, because the next regenerate reads the new project

**Quotes:**

> On the post page and in the library, any team member can assign a post to a project, move it or remove it.
> Kit precedence becomes: explicit brief kit → project default kit → team default kit.
> **Problem:** party-ba proposes the fix "State that moving a post only relabels it, and that defaults apply at generation time only." Read against failure modes, regenerate is a generation. If the defaults are resolved live from the current assignment at each generation, a move by a non-author is not a relabel. It silently changes the kit, style, briefing and facts-check sources of the author's next regenerate, and it changes the documents a recomputed facts check runs against. That is the bypass in my third BLOCK. The fix as worded would write that bypass into the proposal as intended behaviour.
> **Fix:** Make the wording conditional on a snapshot. Moving only relabels the post, and an existing post's regenerate, refine and facts-check recompute use the project inputs stamped on the draft at first generation. Only a new post, or an explicit "apply the new project's defaults" action by the author or an admin, reads the current project.
> **Status:** upheld

### [WARN] party-security — Rebuttal to party-visionary's principle: "changes only its grouping, is any member" puts the input-switching move in the open tier

**Quotes:**

> **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post. Other members can view, download, copy captions and assign it to a project.
> **Problem:** party-visionary's fix proposes the principle "anything that calls a model or writes the post's content is author or admin; anything that only reads it, or changes only its grouping, is any member". In this design, project assignment is not only grouping: it is a tier in the kit and post-style resolvers and the source of the briefing and the facts-check documents. If the principle is adopted as worded, the coverage test it recommends would sort assign and move into the any-member tier and pass. The test would then certify the permission bypass and facts-check gaming in my third BLOCK as correct.
> **Fix:** Adopt the principle only together with a snapshot of the generation inputs on the draft, so that assignment really does change grouping alone. Otherwise add a third clause: "anything that changes which inputs a later generation resolves is author or admin".
> **Status:** upheld

### [WARN] party-visionary — `projectId` is both a folder anyone can change and the key that picks a post's generation inputs, and no draft records which project it was made under

**Quotes:**

> Add a nullable `projectId` on the post (on `Brief`, unless the plan finds `Draft` the better owner).
> On the post page and in the library, any team member can assign a post to a project, move it or remove it.
> Kit precedence becomes: explicit brief kit → project default kit → team default kit.
> Deleting a project unassigns its posts.
> **Problem:** One column does two jobs. It is a grouping that any member can change at any time, and it is also the tier that resolves the kit, the post style, the briefing and the facts-check sources. The artifact never says whether those inputs are read live from the current assignment or copied onto the draft when it is generated, and it never asks a draft to record which project and which briefing version produced it. Each later change will hit this. A regenerate after a move, or after the project is deleted, quietly runs with a different kit, briefing and style. A stored `factsCheck` becomes a check against documents the post no longer points to. 039's on-demand channel captions will be written against whichever briefing is current, not the one the image was made from. An Insights "posts per project" built on events stamped with `projectId` at emit time will disagree with the library filter as soon as someone moves a post. The codebase already copies inputs onto drafts: the post-style `goal` is a server-written snapshot, and drafts carry composition and route stamps. Every draft written between this merge and a later stamp column will have null provenance forever. That cannot be backfilled, because the assignment will have moved since. Round 2: party-architect (snapshot vs live) and party-security (move as a back-door kit change) raise the merge-day side of this. What stays mine is the one-way part: provenance not stamped from the first draft on can never be recovered, and 039 and Insights inherit the gap.
> **Fix:** Before choosing between `Brief` and `Draft`, decide that the mutable assignment and the generation provenance are separate facts. Stamp `{ projectId, briefingVersion }` on the draft or revision at generation time. Then say whether regenerate uses the stamp or the current assignment.
> **Status:** upheld

### [WARN] party-visionary — "A post in several projects" is listed as deferred, but making project a resolver tier closes that door

**Quotes:**

> Nested projects, and a post in several projects.
> Post-style precedence becomes: explicit → project default → `general`. `resolvePostStyle` stays the only resolver.
> **Documents.** Uploaded reference documents move to projects, and the facts check compares against them.
> **Problem:** Out of Scope presents multi-project membership as work for later. The change itself makes the project a single-valued tier in the kit chain and the post-style chain, the only source of an injected briefing, and the source of the facts-check documents. A later change that lets a post sit in two projects (for example, a seasonal promotion that also belongs to a product line) would first need a conflict rule for each of those: two default kits, two default styles, two briefings to merge or pick from, and a union or choice of documents. That change would really be a redesign of four resolvers, not an extension of one column. The artifact does not say that this choice is what makes "several projects" expensive.
> **Fix:** Either state in the proposal that a post's project is single-valued for good, because it is a configuration source, or keep grouping (tags or folders, many-valued) separate from the configuration source (one project, single-valued) now, while nothing depends on it yet.
> **Status:** upheld

### [WARN] party-visionary — The briefing reaches generation through five enumerated call sites with no single seam, and 039 adds the sixth

**Quotes:**

> **Briefing.** The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes. It is injected wherever the campaign briefing is today: Path A, Path B, the background art director, captions and the facts-check sources.
> **Problem:** Post style gets "`resolvePostStyle` stays the only resolver". The briefing gets a list of places. The next change on this surface is 039, which adds on-demand Instagram, LinkedIn and Facebook captions, each a new generation call. Nothing in this design makes those calls pick up the project briefing. If they miss it, the curated captions ignore the project's guidance while the general caption follows it, and no test fails. The same applies to the documents feeding the facts check and to any later surface, such as an MCP caption tool or a new look. The list is right at merge and incomplete by the second change after it.
> **Fix:** Have one function return a post's project context (kit, briefing text and version, documents, default style and tone), and add a call-site guard test, as the fonts and post-style boundaries already have. Then a new generation surface fails a test until it uses the function.
> **Status:** upheld

### [WARN] party-visionary — The edit/view split is a list of verbs, so every future post action has to be classified with no rule to follow

**Quotes:**

> **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post. Other members can view, download, copy captions and assign it to a project.
> **Problem:** The permission model is a list of actions, not a principle. The next change adds actions that are not on the list: 039's "generate a LinkedIn caption on demand" and "edit a curated caption", and later apply-to-image or undo. Each contributor will guess which tier an action belongs to, by analogy with whichever route they copied. Generating a caption calls a model and writes to the post, which looks like "edit". Copying a caption only reads, which is "view". Both live on the same card. The first wrong guess lets any member spend model calls on, or overwrite, someone else's post, and nothing flags it. Round 2: party-architect and party-security (both BLOCK) cover the missing `canEditPost`/`canModify` predicate at merge, and security's guard test covers a write handler that calls only the read check. Neither states the rule a contributor applies to an action not on today's list, which is the part that decides 039.
> **Fix:** State the principle behind the list, for example "anything that calls a model or writes the post's content is author or admin; anything that only reads it, or changes only its grouping, is any member". Implement it as one `canEditPost` predicate. Back it with a coverage test that fails when a draft action or post-mutating route has no tier, in the same way `analyticsCoverage.test.ts` fails on an unmapped `DraftAction`.
> **Status:** upheld

### [NOTE] party-visionary — The briefing machinery is moved to a new owner instead of being made owner-agnostic, which leaves unassigned posts without a briefing tier

**Quotes:**

> **Briefing.** The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes.
> **Problem:** This is the second owner the versioned briefing, with its assistant, chat, Improve and upgrade routes, has had. The kit and the post style each fall back to a team or `general` tier when a post has no project. The briefing has no such fallback, so an unassigned post gets no briefing. A team-wide briefing for unassigned posts is a likely next request, and it would mean moving or copying the whole route set a third time. The change is one step from making that free: key the briefing store and its routes on an owner reference, so a team-level briefing becomes a new owner type rather than a new copy. Round 2: this is compatible with party-po's cut of the assistant, chat, Improve and upgrade routes. If they are cut, keying the plain briefing store on an owner costs even less.
> **Fix:** While the routes are being moved anyway, key the briefing store and routes on an owner. Give the briefing the same fallback chain as kit and style, or say why it has none.
> **Status:** upheld

### [NOTE] party-visionary — `visibility.ts` is about to become trivial, and nothing keeps the 24 callers routed through it

**Quotes:**

> 4. **Visibility.** Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
> **Problem:** This change can rewrite the sharing rule cheaply because about 24 files already go through one predicate. Once that predicate is just "same team", contributors will write `where: { teamId }` inline in new routes, and the seam erodes. The next visibility change, such as private work-in-progress drafts or a project limited to some members, would then cost a search across the codebase instead of an edit to one file. A guard test would keep that leverage. Round 2: party-security's `canView`/`canModify` split guards the write side. This note is about the read side, which their guard does not cover.
> **Fix:** Keep `visibility.ts` as the only read predicate for posts even though it is now trivial. Add a boundary test that fails when a post-reading route filters by team without calling it.
> **Status:** upheld

### [WARN] party-visionary — Rebuttal of party-po's BLOCK: renaming the campaign into the project is cheaper to build but leaves two "project" entities to live with

**Quotes:**

> Today a project reaches a post only through a campaign (campaign → `ProjectCampaign` → project).
> **Default brand kit.** The field exists already and now applies directly.
> **Problem:** party-po's cheaper variant reshapes the existing campaign object as the project and keeps its machinery in place. The proposal shows that a Project entity already exists above campaigns, joined through `ProjectCampaign`, with its own default kit. An in-place rename therefore ends in one of two states. Either there are two tables that both read as "project" (the existing one and the renamed campaign), or the existing Project stays above the renamed one with the `ProjectCampaign` join left in place. Every later change that touches grouping has to pick which "project" it means: 039's library filter by project, a per-project Insights count, and the deferred multi-project question. The kit tier is the worst case, because two records would carry a default kit. The full move costs more on merge day and ends with one entity, so it is the cheaper option to live with. The cost argument stands for build cost, which is party-po's to judge. It does not stand for the year after.
> **Fix:** If the panel keeps the cheaper variant, specify it as reusing the campaign tables' briefing and document machinery under the existing Project table, not as renaming Campaign next to it, and state that `ProjectCampaign` and the second kit field go.
> **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-ba — "Every member sees every post" replaces the campaign rule without establishing the pain it solves

**Quotes:**

> Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`. Removing campaigns without replacing that rule would make every post private to its author.
> Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
> **Problem:** My round-1 concern was that the proposal never names who asked for team-wide visibility. The user's recorded program decisions state explicitly that every team member sees every post, so the premise is decided and not an unverified assumption. The remaining gap is wording only.
> **Status:** withdrawn — the user's recorded decision ("Every member of a team sees every post") settles the premise, so the finding no longer holds.

### [WITHDRAWN WARN] party-visionary — "The ACP manifest version goes up" does not decide whether removing a parameter is a breaking bump, and this is the first of three removals that will copy it

**Quotes:**

> 6. **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
> **Problem:** The ACP manifest is a published contract that external clients read. Removing an accepted parameter breaks a client that sends it. Whether this bump is major or minor, and whether a call that still sends the old field is refused with a named error or silently ignored, becomes the template for every later contract removal. 037 removes `publish_post`, and 039 reshapes captions. If this one ships as a minor bump that silently drops the field, an MCP client configured before 038 keeps generating posts with no briefing and no project kit, and nothing tells it. The next removal will then do the same, because that is what this one did.
> **Fix:** Say that removing a parameter is a major manifest bump. Say that a removed field is refused with a named error rather than ignored, so the precedent is explicit.
> **Status:** withdrawn — the precedent claim rests on a misreading of the order: the proposal says "It depends on 037", so 037's removal of `publish_post` lands first and sets the contract-removal precedent, not 038. What remains is the merge-day contract (bump size, stale `campaign` field refused or ignored), and party-architect's and party-security's WARNs on the same line cover it fully.
