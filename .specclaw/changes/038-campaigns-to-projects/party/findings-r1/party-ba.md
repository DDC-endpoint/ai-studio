### [WARN] party-ba — "Every member sees every post" replaces the campaign rule without establishing the pain it solves

**Quotes:**

> Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`. Removing campaigns without replacing that rule would make every post private to its author.
> Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
> **Problem:** The proposal frames the visibility rewrite as forced by campaign removal. The user wants the campaign system removed, but nothing says they want the "has a campaign" rule to widen to "all posts visible". Per the Open Questions, the user did decide this, so the premise holds, but the proposal never states who suffered from the old rule or whether anyone relied on private-by-default posts. If a post had no campaign, its author may have expected it to stay private. The proposal does not say that expectation is dropped.
> **Fix:** State explicitly that private-to-author posts are retired deliberately, and name the party who asked for team-wide visibility.
> **Status:** upheld

### [WARN] party-ba — Acceptance criteria are not falsifiable for the headline claims

**Quotes:**

> The full mock suite stays green.
> Move the E2E suites `briefing-assistant`, `briefing-upgrade` and the campaign parts of `team-isolation`, `surfaces` and `library` to projects.
> **Problem:** The proposal has no acceptance criteria. The only verification statements are that the existing suite stays green and that suites are moved. Nothing observable states the actual new behaviours. For example, a post assigned to a project picks up that project's kit, briefing and style. A non-author, non-admin member cannot edit or regenerate. Deleting a project unassigns its posts. Facts-check uses project documents. A suite that was rewritten alongside the code can pass without testing any of these. The main claim, that projects take over the campaign inputs, is unverified at ship time.
> **Fix:** List per-behaviour criteria, each with an observation that would fail it: kit precedence order, style precedence, briefing present in the prompt, a 403 for a non-author editor, and unassignment on delete.
> **Status:** upheld

### [WARN] party-ba — "Briefing ... moves to projects" and "default post style and tone" are ambiguous about whether project data is new or reused

**Quotes:**

> Today a project reaches a post only through a campaign (campaign → `ProjectCampaign` → project).
> **Default brand kit.** The field exists already and now applies directly.
> A migration drops `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId`, and creates the project equivalents.
> **Problem:** "Project" is a load-bearing term with two readings. It is the existing Project entity, which already has a kit field and sits above campaigns. It is also a new campaign-like entity, "creates the project equivalents". The proposal never says whether an existing Project table gains briefing, documents, style and tone columns, or whether a new table is created. It also never says what existing Project semantics, such as team-default grouping, survive. The two readings produce different migrations. The sentence that the kit field "exists already" also conflicts with "creates the project equivalents".
> **Fix:** Define Project's current role and which of its fields stay, and say whether the migration alters or replaces the Project table.
> **Status:** upheld

### [NOTE] party-ba — "Admins create projects, any member assigns" assumes members behave this way and keeps the wizard picker optional

**Quotes:**

> The wizard's first step, "Campaign", becomes an optional project picker.
> Any team member can assign a post to a project, move it or remove it.
> **Problem:** Because assignment is optional and any member can reassign, a post may sit in no project or the wrong one. The briefing, kit and style defaults then silently do not apply. The proposal assumes users will assign posts, but it does not say what happens to the facts-check sources and briefing for an unassigned post. A moved post's already-generated content also does not change. "Move" is ambiguous: it may re-run generation or only relabel the post.
> **Fix:** State that moving a post only relabels it, and that defaults apply at generation time only.
> **Status:** upheld
