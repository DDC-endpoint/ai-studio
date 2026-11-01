### [BLOCK] party-security — Widening the read predicate can widen write access, because no separate author-or-admin gate is designed

**Quotes:**

> In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`.
> **Visibility.** Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
> **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post.
> **Problem:** The Proposed Solution changes one predicate that about 24 files share, and widens it to every team member. Today a route that uses "can see" as its gate for edit, refine, regenerate, kit change or delete is safe only because "can see" is narrow. Once the predicate is rewritten, every such route lets any team member write to any teammate's post. The author-or-admin rule exists only as a decided Open Question. No item in the Proposed Solution adds the separate write check that would enforce it, and the stated guard (the team-isolation E2E suite) tests across teams, not across members of one team. So the failure grants access instead of refusing it, and an over-broad write looks the same as the intended broader read.
> **Fix:** Split the predicate in the design: `canView` (team membership) and `canModify` (author, or team admin and above via `hasRole`). Require every write route among the ~24 to call `canModify`, with a guard test that fails if a write handler calls only `canView`. Add E2E cases in which a non-author editor in the same team gets 403 on edit, refine, regenerate, kit change and delete.
> **Status:** upheld

### [BLOCK] party-security — A caller-supplied project id pulls a project's briefing, documents and kit into generation, and no team-ownership check is stated

**Quotes:**

> **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
> On the post page and in the library, any team member can assign a post to a project, move it or remove it.
> It is injected wherever the campaign briefing is today: Path A, Path B, the background art director, captions and the facts-check sources.
> **Problem:** A project id now comes from an API-key holder (MCP/ACP), from the wizard and from any member's assign or move request. That id then decides which briefing text goes into the model prompts, which documents the facts check reads, and which default kit is used. The proposal never says the id is checked against the caller's team (or the API key's team) before use. A project id from another team would inject that team's private briefing and documents into the caller's generation, and some of it could come back in the output. The ACP/MCP surface is the unattended, key-authenticated entry point where a forged id is cheapest to try.
> **Fix:** State in the design that every write of `projectId` (wizard, assign, move, `generate_post`) and every read at generation time checks `project.teamId === caller team`, and answers 404 (not 403) on a mismatch. Add cross-team cases to the team-isolation suite: MCP `generate_post` with a foreign project, and a foreign project on assign and move.
> **Status:** upheld

### [BLOCK] party-security — A member who may not edit a post can still change its kit, briefing and facts-check sources by moving it between projects

**Quotes:**

> Any team member can assign or move a post.
> Kit precedence becomes: explicit brief kit → project default kit → team default kit.
> Post-style precedence becomes: explicit → project default → `general`.
> Other members can view, download, copy captions and assign it to a project.
> **Problem:** The decided rule bars non-authors from editing, regenerating or changing the kit of a post. But assigning a project is open to every member, and the project feeds the kit tier, the post-style tier, the briefing and the facts-check documents. On a post with no explicit kit, a non-author can switch its effective kit, style, briefing and facts sources just by moving it, and the change takes effect on the author's next regenerate or caption edit. That is the forbidden kit change by another route. The same lever lets anyone, the author included, move a flagged post into a project whose documents contain the flagged numbers and get a `clear` facts check on recompute. The party being checked can choose what it is checked against.
> **Fix:** Pick one of two options. Either snapshot the resolved kit, style and project on the brief at generation, so a later move does not change what an existing post regenerates with until the author or an admin confirms; or limit moving a post that is already assigned to its author and team admins. In either case, record the project id that the facts check ran against in `Draft.factsCheck`, and record who moved the post (an event), so that a changed verdict can be traced.
> **Status:** upheld

### [BLOCK] party-security — The destructive table drop has no fail-closed guard, and orphaned private documents are left with no recovery path

**Quotes:**

> A migration drops `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId`, and creates the project equivalents. It ships a manual down script. The system starts fresh, so no data is carried over.
> **Problem:** "The system starts fresh" describes the deploy target. The migration, however, runs on every database where `db:migrate` runs, and nothing in the proposal stops it on a database that still holds campaign rows. A down script can recreate the schema but not the dropped briefings, briefing versions or document rows. The proposal also never says what happens to the `CampaignDocument` objects in private object storage. If they are left, the uploaded reference documents become unreferenced private objects that no UI or route can list or delete. If they are deleted, that deletion is a second irreversible effect with no recovery path. Either way, the operator gets no signal about what was destroyed or orphaned.
> **Fix:** Make the migration fail closed: it refuses to run (with a clear error) when `Campaign` or `CampaignDocument` has rows, unless an explicit operator acknowledgment is given, matching 037's fail-closed migration. Name the operator's recovery path (a `pg_dump` before migrating). Specify how the stored document objects are handled: either a scripted, logged sweep of the `campaign` prefix that runs only after the drop has committed, or a documented list of the orphaned keys.
> **Status:** upheld

### [WARN] party-security — Deleting a project silently strips the generation inputs of every assigned post and destroys its briefing history

**Quotes:**

> Deleting a project unassigns its posts.
> Team admins create, rename and delete projects and edit their briefing, documents and defaults.
> **Problem:** Deleting a project makes its posts fall back silently to the team default kit, to `general` style and to no briefing or facts-check documents, starting with their next regenerate or caption edit. Their authors get no notice. The versioned briefing and the uploaded documents are destroyed with no stated confirmation, soft delete or restore. The proposal also does not cover a deletion that races an async generation already running for that project: generation may go ahead without the briefing and look like a healthy run.
> **Fix:** Require a confirmation that names the number of assigned posts. Soft-delete the project (or keep its briefing versions and documents for a retention window) so an admin can restore it. At generation time, treat a project that vanished mid-run as a named failure, or stamp a visible "project removed, generated without briefing" note on the draft, instead of degrading silently.
> **Status:** upheld

### [WARN] party-security — An MCP/ACP client that still sends a campaign may be silently downgraded to a run without its briefing

**Quotes:**

> `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
> **Problem:** Existing MCP/ACP clients send a campaign field. The proposal does not say whether that now-unknown field, or an unknown or deleted project id, is refused or ignored. If it is ignored, an unattended caller that expected its briefing and documents gets a post generated without them, with a generic kit and no facts sources. The response looks like a success, and there is no human in that loop to notice.
> **Fix:** Answer 400 with a named error when `generate_post` gets the retired campaign field or a project id that does not resolve in the caller's team. Never treat either case as "no project".
> **Status:** upheld

### [NOTE] party-security — The visibility widening applies retroactively to posts their authors created as private

**Quotes:**

> Every member of a team sees every post in that team.
> Removing campaigns without replacing that rule would make every post private to its author.
> **Problem:** Under the current rule, a post without a campaign is private to its author. On any database that already holds posts when this change deploys, every such post becomes visible to the whole team at once, with no signal to the authors. Once a teammate has seen a post, the disclosure cannot be undone. The exposure is limited because the deploy starts fresh, but the migration and the new rule apply wherever the change runs.
> **Fix:** Have the migration log a count of the briefs that change from author-only to team-visible. State in the deploy notes that drafts created before 038 become team-visible.
> **Status:** upheld
