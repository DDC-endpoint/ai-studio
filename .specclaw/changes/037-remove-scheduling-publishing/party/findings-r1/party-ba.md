### [WARN] party-ba — The user's usage claim is the only evidence and is unsourced, yet it justifies removing a lifecycle stage and a contract

**Quotes:**

> The user (2026-10-28) uses the app only to generate post images, download them and copy captions. Scheduled generation, manual publishing and auto-publishing are not needed.
> **Problem:** The whole proposal rests on this one statement. It does not say where it came from (a request, a conversation, usage data). It also speaks only for one user, while the proposal removes features from a team tool. The sentence "are not needed" is applied to three separate capabilities (scheduled generation, manual publish, auto-publish). The proposal never shows that the user would give up all three. It also never says whether other team members rely on them, or whether the MCP and ACP `publish_post` callers are used by anyone. The cost is an irreversible removal: a data drop and a contract removal.
> **Fix:** Cite the request that says each of the three is unneeded, and state whether any other user or integration (MCP and ACP clients) was checked.
> **Status:** upheld

### [WARN] party-ba — The stated pain is complexity, but no criterion shows the complexity gets removed or that nothing else breaks

**Quotes:**

> They add the most moving parts in the system: a worker container, social channel tokens, the campaign queue, the HOLD rule, `Post` rows and the publish dialogs.
> The full mock suite stays green.
> **Problem:** "Most moving parts" is a comparison asserted without any count or source. The only verifiable ship condition is "the full mock suite stays green". That condition cannot fail for the problem named. A suite that has had its publish tests removed will be green whether or not the parts are gone, and whether or not the download flow works. No criterion says the worker container is down to the retention loop, that no `Post` or `ChannelToken` table remains, or that Download produces a correct PNG. The main goal, the user's flow (generate, download, copy caption), has no matching falsifiable criterion.
> **Fix:** Add checks that can fail, for example: the dropped tables do not exist, the removed routes return 404, `publish_post` is absent from both manifests, and the generate, refine, Download and copy flow passes in E2E.
> **Status:** upheld

### [WARN] party-ba — "Download replaces Export" assumes the Export step is a pain, with no evidence, and the final PNG is called "current" without a definition

**Quotes:**

> They also gate the draft lifecycle: Publish needs `EXPORTED`, and the library filters on Published, Scheduled and Failed.
> One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
> **Problem:** The proposal states the lifecycle gating as a pain. Yet the user's own workflow is "download", so it is unclear whether Export was ever a problem for them. This turns a removal request into a workflow redesign that the stated problem does not mention. "Not current" is a load-bearing term and is never defined. It could mean no export exists, the draft was edited after export, or a refine revision is newer. Each reading gives a different build and a different chance of the user downloading a stale image.
> **Fix:** Define "current" (for example, export stamped from the latest revision) and say whether the user asked for Export to go away.
> **Status:** upheld

### [NOTE] party-ba — "Retired, or kept and made unreachable" leaves two builds that differ in what the data model means

**Quotes:**

> Draft status values that only mean "published" are retired, or kept and made unreachable, whichever the plan finds safe for Postgres enums.
> Insights drops the post styles "held" column.
> **Problem:** The proposal does not name which status values "only mean published". It also uses "held" with no definition. The HOLD rule is described as a settled `heldReason`, while the column is "held" per style. Two readings of the first term produce different schemas. The ambiguity is probably low risk because it is a listed open question.
> **Fix:** List the specific enum values in scope.
> **Status:** upheld
