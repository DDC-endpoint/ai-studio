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

### [WARN] party-visionary — "The ACP manifest version goes up" does not decide whether removing a parameter is a breaking bump, and this is the first of three removals that will copy it

**Quotes:**

> 6. **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
> **Problem:** The ACP manifest is a published contract that external clients read. Removing an accepted parameter breaks a client that sends it. Whether this bump is major or minor, and whether a call that still sends the old field is refused with a named error or silently ignored, becomes the template for every later contract removal. 037 removes `publish_post`, and 039 reshapes captions. If this one ships as a minor bump that silently drops the field, an MCP client configured before 038 keeps generating posts with no briefing and no project kit, and nothing tells it. The next removal will then do the same, because that is what this one did.
> **Fix:** Say that removing a parameter is a major manifest bump. Say that a removed field is refused with a named error rather than ignored, so the precedent is explicit.
> **Status:** withdrawn — the precedent claim rests on a misreading of the order: the proposal says "It depends on 037", so 037's removal of `publish_post` lands first and sets the contract-removal precedent, not 038. What remains is the merge-day contract (bump size, stale `campaign` field refused or ignored), and party-architect's and party-security's WARNs on the same line cover it fully.

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
