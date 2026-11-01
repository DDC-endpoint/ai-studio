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
