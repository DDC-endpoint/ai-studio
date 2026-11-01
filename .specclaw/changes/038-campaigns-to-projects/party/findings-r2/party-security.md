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
