### [BLOCK] party-architect — The author-or-admin edit rule has no home, and the 24 visibility callers are not split into read and write

**Quotes:** > Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`.
**Quotes:** > 4. **Visibility.** Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
**Quotes:** > - **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post. Other members can view, download, copy captions and assign it to a project.
**Problem:** The proposal sets three access levels for a post: view (any member), assign or move (any member), and edit, refine, regenerate, change kit or delete (author or team admin). Proposed Solution item 4 changes only the read predicate, and it changes it to the most permissive answer. The edit tier appears only under Open Questions. It is not given a named predicate or module, and no step in the solution builds it. The proposal does not say whether those ~24 callers of `visibility.ts` include write routes. If they do and the rewrite lands as written, every member gets every write. If they do not, the edit rule has no single owner, and each write route gets its own author-or-admin check. Either way the merge needs all ~24 callers sorted into view, assign and edit, plus a gate on each write route, and the proposal names neither. The only guard it names, the team-isolation E2E suite, tests separation between teams and does not test author versus non-author inside one team.
**Fix:** Add the edit tier to Proposed Solution item 4. Give it one named predicate next to the visibility rule (for example a `canEditPost` in `src/lib/authz/`). List which callers move to it and which keep the read predicate. Name the test that checks a non-author editor gets refused on each write route.
**Status:** upheld

### [WARN] party-architect — Which record owns `projectId` is left to the plan, but the migration, library filter, assign action and MCP contract all depend on it

**Quotes:** > - Add a nullable `projectId` on the post (on `Brief`, unless the plan finds `Draft` the better owner).
**Quotes:** > - The plan must confirm the right owner for `projectId` (`Brief` or `Draft`) from how regenerate and revisions use them.
**Quotes:** > - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
**Problem:** The column's owner decides what "a post" means for assignment. If one brief can have several drafts, putting it on `Brief` means moving one post from the post page moves its siblings too. Putting it on `Draft` means generation, which runs from the brief, has to read the project from a record that does not exist yet when generation starts. The migration, the library filter query, the project page's post list, `generate_post`'s new argument and the analytics project field all join on this column. Deferring the owner lets two implementers build different schemas from the same proposal. It also leaves room for a column on both records, which would put two writers on one fact.
**Fix:** Decide the owner in the proposal and state the cardinality between brief and draft that the decision relies on. Say explicitly that only one table carries `projectId`.
**Status:** upheld

### [WARN] party-architect — It is unspecified when project inputs are resolved, so the effect of moving a post on regenerate, refine and the facts check is undefined

**Quotes:** > - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
**Quotes:** > - **Briefing.** The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes. It is injected wherever the campaign briefing is today: Path A, Path B, the background art director, captions and the facts-check sources.
**Quotes:** > Kit precedence becomes: explicit brief kit → project default kit → team default kit.
**Problem:** Under campaigns the grouping was set once on the brief. Here a post can be assigned, moved or unassigned after generation, and any member can do it, including members who may not edit the post. The proposal does not say whether project inputs (default kit, briefing version, documents, default post style and tone) are copied onto the post at generation or read live at each later operation. If they are read live, one member's move silently changes the kit, briefing and post style that the author's next regenerate uses, and leaves a stored facts-check result checked against the old project's documents. If they are copied, the proposal needs a stamp for them, and that stamp is not named. Two implementers would build this differently.
**Fix:** Say whether project inputs are snapshotted at generation (and where: which stamp or column) or resolved at each operation. Then say what a move does to an existing post's facts check and its next regenerate.
**Status:** upheld

### [WARN] party-architect — Kit precedence changes, but unlike post style, no single kit resolver is named

**Quotes:** > - **Default brand kit.** The field exists already and now applies directly. Kit precedence becomes: explicit brief kit → project default kit → team default kit.
**Quotes:** > - **Default post style and tone.** Post-style precedence becomes: explicit → project default → `general`. `resolvePostStyle` stays the only resolver.
**Problem:** For post style the proposal names the one resolver that every caller goes through, plus its guard (`postStylesBoundary.test.ts` in Impact). For kits it gives the new order but names no resolver, no list of callers and no guard. So the merge cannot be checked for a caller that still uses the campaign tier, or one that builds the new order itself. The last tier is also called "team default kit". The proposal never says whether that is the existing default tier under a new name or a new per-team default. If it is new, it is an unlisted schema change.
**Fix:** Name the function that resolves a post's kit and the guard that makes it the only one. Say whether "team default kit" is an existing field or a new one.
**Status:** upheld

### [WARN] party-architect — The new `generate_post` project argument and the version bump are not specified

**Quotes:** > 6. **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
**Problem:** This contract is shared with external clients, and an implementer would have to guess at least three things. First, is the project identified by id or by name? Second, what happens when the project is unknown or belongs to another team: a refusal (with what error) or a silent unassign? Third, what happens when an existing client still sends the campaign argument: an error, or quietly ignored? Dropping a parameter is a breaking change for those clients, yet the proposal only says the version "goes up". It does not say by how much, or what changes in `docs/mcp-acp-guide.md`. MCP and ACP are two surfaces, so without a stated contract they can diverge on each of these points.
**Fix:** In the proposal, state the argument's name and type, the error for an unknown or other-team project, how a stale `campaign` argument is handled on both surfaces, and the new manifest version.
**Status:** upheld

### [WARN] party-architect — Analytics and Insights co-changes are a rule, not a list

**Quotes:** > 7. **Analytics.** Any event field that names a campaign is replaced by the project, with a `schemaVersion` bump. Insights loses anything campaign-based.
**Quotes:** > - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
**Problem:** The proposal does not list which events carry a campaign field, which Insights sections are removed, or whether "project" on an event means the project at generation time or the current one. Because posts can now be moved, those two readings give different per-project counts. Assign, move and unassign are new post actions, and the proposal names no event for them. A co-change described only as a rule gets applied unevenly: the event catalogue, the emitters and the Insights queries all have to change in the same commit, and an event missed by the rule is a half-landed migration of the catalogue.
**Fix:** List the affected event names and the Insights sections being removed. Say whether the project field is the project at generation time. Say whether assign and move emit an event, and which one.
**Status:** upheld

### [NOTE] party-architect — Which campaign modules are moved and which are deleted is left open, and so is what Project already has

**Quotes:** > - The campaign pages, nav entry, routes, components and `src/lib/campaign/*` are removed or moved under projects.
**Quotes:** > - Project create, rename and delete, a briefing section, a documents section, defaults, and the post list on the project page.
**Problem:** "Removed or moved" does not split `src/lib/campaign/*` into code that moves (briefing versioning, the assistant, Improve and upgrade, documents) and code that is deleted. The in-scope list puts project create, rename and delete in scope. Yet the proposal also says a project and its default kit already exist ("The field exists already"), and it refers to "the project page" as an existing page. If project CRUD and its page already exist, the change risks building a second one next to them. If they do not, that is new surface the proposal does not mark as new.
**Fix:** List the campaign modules to move and the ones to delete. Say which project surfaces exist today and which this change adds.
**Status:** upheld
