### [WARN] party-ba — "Every member sees every post" replaces the campaign rule without establishing the pain it solves

**Quotes:**

> Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`. Removing campaigns without replacing that rule would make every post private to its author.
> Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
> **Problem:** My round-1 concern was that the proposal never names who asked for team-wide visibility. The user's recorded program decisions state explicitly that every team member sees every post, so the premise is decided and not an unverified assumption. The remaining gap is wording only.
> **Status:** withdrawn — the user's recorded decision ("Every member of a team sees every post") settles the premise, so the finding no longer holds.

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
