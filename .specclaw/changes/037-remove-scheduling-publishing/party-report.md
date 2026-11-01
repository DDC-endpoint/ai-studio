# Party Report: 037-remove-scheduling-publishing

**Reviewed:** 2026-10-28
**Tier:** deep (classifier) — Drops the Post, ChannelToken, ScheduledGeneration and WorkerHeartbeat tables and their enums in a migration, removes the publish_post MCP/ACP capability, and removes the HOLD gate in the publish path, which changes persisted data shape and removes a capability other surfaces assume.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

29 findings: 2 BLOCK, 20 WARN, 6 NOTE upheld — 1 withdrawn

## Findings

### [WARN] party-architect — Download's contract is underspecified, and the Export route and `EXPORTED` status it replaces are never dispositioned

**Quotes:** > One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
**Quotes:** > The separate Export step goes.
**Quotes:** > They also gate the draft lifecycle: Publish needs `EXPORTED`, and the library filters on Published, Scheduled and Failed.
**Quotes:** > Remove or rewrite the E2E suites `publish`, `campaign-scheduling`, `scheduler-heartbeat` and `export`, and the matching unit tests.
**Problem:** Download takes over Export's job, but the proposal does not say whether it calls Export's existing server path or adds a new one beside it. "Stores it as Export does today" could mean either, and a new path would be a second writer of the stored export. Item 4 lists the removed routes and does not include an export route, so an implementer cannot tell whether that route is kept, renamed or deleted. "If it is not current" has no stated rule: is it a revision id, a render stamp, or a timestamp compared with the stored object? The proposal also never says whether Download still sets `EXPORTED`, or what that value means once Publish no longer reads it. Only "published" values are named for retirement. Finally, the `export` suite may be "removed", so the only mechanism this change adds could ship with no test. In round 1, party-ba (undefined "current") and party-security (no failure path) reached the same sentence from their own lenses. That supports the finding and does not duplicate it: the structural gap is the unnamed route and the second-writer risk.
**Fix:** Say that Download reuses Export's render-and-store function, and name the route it calls (Export's, renamed, or new with the old one deleted). Define "current" against a named stamp. Decide whether `EXPORTED` is still written or is retired along with the published values. Require the `export` suite to be rewritten as a Download suite, not removed.
**Status:** upheld

### [WARN] party-architect — `PostGenerationAction` is said both to be dropped with its model and to keep retired values, which implies a consumer the proposal does not name

**Quotes:** > A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows other than retention's, along with their enums and back-relations.
**Quotes:** > Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values?
**Problem:** If `PostGenerationAction` belongs to `ScheduledGeneration`, item 1 drops the whole type ("along with their enums"), and the question of retiring individual values does not arise. If the question is real, a model that survives this change still references the enum. That model then needs a co-change: its column, any rows holding the retired values, and the down script. The proposal never names it. The two readings lead to different migrations and different down scripts.
**Fix:** Name every model that keeps a `PostGenerationAction` column after the migration, or state that the type is dropped whole and remove it from the open question.
**Status:** upheld

### [WARN] party-architect — With `/api/scheduler/status` gone, nothing says what the Insights Health line reads or which loops it expects

**Quotes:** > The scheduler container keeps only the analytics `retention` loop and its heartbeat. The `scheduler` (publish) and `generation` (queue) loops are removed. The Insights Health line keeps working.
**Quotes:** > `/api/posts*`, `/api/team/channels*`, `/api/scheduler/status` and `/api/campaigns/[id]/queue*`
**Quotes:** > `src/lib/scheduler/{jobRunner,generationRunner,heldReason}.ts`
**Problem:** The proposal promises that Health keeps working, but it removes the status route and deletes the heartbeat rows of two of the three loops. It does not say what Health reads after the merge, or where the set of expected loops is defined. If anything still lists `scheduler` and `generation` as expected loops (a loop key type, the health rule's list, a Health query), that must change in the same commit. Otherwise Health reports two loops as permanently offline. The listed deletions keep the rest of `src/lib/scheduler/`, but the proposal does not say which part of it still serves Health. This co-change belongs to the runtime removal of the loops, not to the schema work. It applies under party-po's proposed Part A/Part B split as well.
**Fix:** Name the reader that the Health line uses after the merge. Also name each place where the expected loop set is defined, and add those places to the co-change list.
**Status:** upheld

### [WARN] party-architect — Making the test-seam removal conditional leaves the surviving loop with no named deterministic test

**Quotes:** > the test seams `scheduler-tick` and `worker-heartbeat`, if nothing else needs them
**Quotes:** > the `MOCK_SOCIAL` and `MOCK_SOCIAL_FAIL` seams
**Quotes:** > Remove or rewrite the E2E suites `publish`, `campaign-scheduling`, `scheduler-heartbeat` and `export`, and the matching unit tests.
**Problem:** The retention loop and its heartbeat survive, and so does the Health line. The proposal leaves it to the implementer whether the seams that drive a tick and a heartbeat are kept, and whether `scheduler-heartbeat` is removed or rewritten. If both seams are removed "because nothing else needs them", the only way to test the surviving loop and Health is real wall-clock timing. This change keeps a time-driven mechanism, so its test seam needs to be specified, not left conditional. party-security's round-1 finding on the same lines covers the gate's strength. This finding covers whether a deterministic seam exists at all. The two fixes are compatible: a seam that survives, behind a mock flag that is still in use.
**Fix:** State which seam drives the retention tick and heartbeat in tests after the merge, and which env gate it sits behind once `MOCK_SOCIAL` is gone. Require `scheduler-heartbeat` to be rewritten for the retention loop rather than removed.
**Status:** upheld

### [WARN] party-architect — The analytics vocabulary changes are written as either/or choices, so two implementers would build different catalogues

**Quotes:** > The `scheduler` source and the `Channel` carrier for `analyticsCoverage.test.ts` are handled deliberately: retired in the catalogue, or carried by another event. The test is updated, not deleted.
**Quotes:** > `draft.headline_edited.scheduledPending` is removed.
**Quotes:** > `publish.settled` and `scheduled_generation.settled` stop being emitted.
**Problem:** The catalogue and the coverage test are a contract shared by every emitter. The proposal leaves open whether `scheduler` and the `Channel` carrier are retired or moved to another event, and if moved, to which event. It does not say whether the retention loop, which keeps running in the scheduler container, still emits under the `scheduler` source. It also removes a field from a live event, `draft.headline_edited.scheduledPending`, without saying whether that event's schema version changes. Nor does it say whether the two retired event names stay in the catalogue as readable but unemitted, which matters for the Insights reads of rows already stored. party-visionary's round-1 finding gives a long-horizon reason to resolve the `Channel` half one specific way. This finding asks only that the artifact pick one disposition, so it stands either way.
**Fix:** Pick one disposition for `scheduler` and for the `Channel` carrier, and name the carrying event if there is one. State whether `draft.headline_edited` gets a schema version bump. State whether `publish.settled` and `scheduled_generation.settled` stay in the catalogue as readable only, or are deleted from it.
**Status:** upheld

### [WARN] party-architect — The dashboard's "Projects" KPI and the facts-check "held" path depend on 038's model, which this change does not contain

**Quotes:** > The dashboard's "Posts published" and "Active campaigns" KPIs become "Posts this month" and "Projects", and "Published to…" activity is removed.
**Quotes:** > Campaigns themselves, their briefing and documents, and projects. That is 038, which also adds the library's project filter.
**Problem:** Projects are explicitly out of scope and belong to 038, yet this change ships a "Projects" KPI. Merged alone, 037 must either count campaigns under a "Projects" label or count a model that does not exist yet. The proposal defers the project filter to 038 but not the KPI, which is inconsistent. Coupling fact: the "Projects" KPI cannot land correctly without 038's model. The replacement KPI "Posts this month" also has no definition: drafts created, drafts generated, or Downloads. party-po's round-1 finding questions whether the replacement KPIs should exist at all, which is their call. This finding covers only the merge-time coupling and the undefined count.
**Fix:** Move the "Projects" KPI to 038, as the library filter already is, or state what it counts in 037. Define "Posts this month" in terms of a named row and timestamp.
**Status:** upheld

### [NOTE] party-architect — "The ACP manifest version goes up" does not say which version component

**Quotes:** > `publish_post` is removed from both. The ACP manifest version goes up.
**Problem:** Removing a capability breaks ACP clients that call it. "Goes up" lets one implementer bump the minor version and another the major, and clients version-check against that number. The proposal does not give the target version. party-visionary's round-1 finding covers the precedent this sets for 038. This NOTE covers only the merge-day ambiguity of the number written in this commit.
**Fix:** State the new manifest version and whether this counts as a breaking (major) bump.
**Status:** upheld

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

### [WARN] party-po — Do-nothing option is never priced, and the cost of keeping dormant code is never compared

**Quotes:**

> They add the most moving parts in the system: a worker container, social channel tokens, the campaign queue, the HOLD rule, `Post` rows and the publish dialogs.
> **Size:** architectural (it removes two subsystems and changes the draft lifecycle, schema, worker, MCP/ACP contract and analytics vocabulary)
> **Problem:** The value claimed is "fewer moving parts". The proposal never says what is lost or gained concretely. It gives no running cost for the worker, no incident history, and no estimate of what leaving the features unused costs the user. The user does not use them, so doing nothing costs almost nothing. The proposal does not say why deleting about 90 files beats leaving the code dormant. Removal is a legitimate choice, but the trade is not stated.
> **Fix:** State the value as a number or a named benefit, for example one fewer container to deploy, no social tokens to hold, or a smaller surface for the CI suite. Compare it to the estimated cost of about 90 files and a schema migration.
> **Status:** upheld

### [BLOCK] party-po — A strictly cheaper cut line exists and is not named: UI and route removal without the destructive schema work

**Quotes:**

> A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows other than retention's, along with their enums and back-relations.
> Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values?
> **Risk:** medium. This is broad deletion across shared enums, analytics coverage and guard tests.
> **Problem:** Most of the user-visible value is in the UI and runtime: no Publish button, no worker loops, no queue, one Download button. The schema drop, the enum rebuild, the down script and the analytics vocabulary changes add the most risk and return no user benefit. Dropping the tables is not needed to stop using them. The proposal packages everything as one large, architectural change. It never considers shipping the runtime and UI removal first and leaving the tables, enums and analytics catalogue entries for a later change, or never.
> **Fix:** Split the change. Part A: UI, routes, worker loops, MCP/ACP `publish_post` and the Download button. Part B: migration, enum rebuild and analytics vocabulary cleanup. State that Part B is optional and justify it separately.
> **Status:** upheld

### [WARN] party-po — Download replaces Export is scope beyond the stated removal, and the storage default has a cost it does not state

**Quotes:**

> One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
> The separate Export step goes.
> The default is to keep storing, so re-downloads are cheap and refine history is unchanged.
> **Problem:** The Problem section says Publish needed `EXPORTED`, so removing Publish removes that gate. It does not follow that the Export step must also go. The Download merge is new feature and UI work that the user did not ask for in this change. It also removes a step that works today, and the `export` E2E suite is rewritten or dropped as a result. No cost is stated for the render-on-click wait or for MinIO storage growth.
> **Fix:** Either keep Export and add a plain download link to the existing export, or state the value of merging the two. If kept, name the render latency per click and the storage growth per download.
> **Status:** upheld

### [WARN] party-po — Dashboard KPI and library filter rework is scope with no stated value

**Quotes:**

> The dashboard's "Posts published" and "Active campaigns" KPIs become "Posts this month" and "Projects", and "Published to…" activity is removed.
> The library drops its publish-status filters and filters by brand kit and post style.
> **Problem:** Removing KPIs that count published posts is forced. Adding a new "Posts this month" KPI, a "Projects" KPI that depends on 038, and brand kit and post style filters is not. No stated user need backs any of them. The "Projects" KPI also cannot ship until 038 lands.
> **Fix:** Drop the removed KPIs and the removed filters, and leave replacements to the changes that need them. Defer "Projects" to 038.
> **Status:** upheld

### [NOTE] party-po — Sequencing: this change cannot name its own cut line against 038 and 039

**Quotes:**

> This is change 1 of 3 from one user request. 038 replaces campaigns with projects, and 039 reworks captions into one general caption plus curated Instagram, LinkedIn and Facebook captions on demand.
> `generate_post` stays; its campaign input is 038's.
> **Problem:** The Download button, the KPI rename and the library filters each touch work that 038 or 039 also touches. The shipping order between the three is stated but the dependencies are not. For example, 037 ships a "Projects" KPI that exists only after 038. The ACP manifest version bump here may need a second bump in 038 and 039, and the proposal does not say whether those collapse into one.
> **Fix:** Name the order and the cut line in the proposal: what 037 ships alone and what waits. State whether the manifest version bumps once or three times.
> **Status:** upheld

### [BLOCK] party-security — The drop migration destroys rows unconditionally, and the "down script" cannot bring them back

**Quotes:**

> A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows other than retention's, along with their enums and back-relations. It ships a manual down script in `prisma/rollback/`, as every migration does. The system starts fresh, so no data is migrated.
> Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values? The plan decides, and the down script must match.
> **Problem:** Dropping four tables and rebuilding enum types destroys data, and the drop cannot be undone. The only recovery the proposal names is a down script. That script can recreate empty tables and enum values. It cannot restore the dropped `Post`, `ChannelToken` or `ScheduledGeneration` rows. It also cannot record which drafts held a retired `DraftStatus` before the type rebuild remapped or rejected them. "The system starts fresh" is an assumption about the database the migration happens to run on, and nothing in the design checks it. On any database that does hold rows, the migration deletes them with no warning. That includes a dev stack, `ai_studio_test`, or a self-hosted deploy made before this change lands (the proposal leaves "Any deploy workflow" out of scope, so it does not rule out a deploy in between). A rollback would then look like it succeeded while restoring nothing.

Round 2: no seat showed that a check exists. The visionary seat's "nothing is deployed and nothing is lost" restates the same unchecked premise. The PO seat's split, with the schema drop as an optional Part B, would reduce this exposure but does not remove it. If Part B ships, it still needs the precondition below.
**Fix:** Make the migration fail closed. Before any DROP, it checks `Post`, `ChannelToken`, `ScheduledGeneration`, and drafts that hold a status value about to be retired. If any of them has rows, it aborts with a named error unless the operator has explicitly accepted the loss (for example, through a documented one-line override). State in the down script's header and in `docs/deploy.md` that the down script restores the schema only. Require a `pg_dump` of the affected tables as the data recovery path. If the enum is rebuilt, any remapping of retired values must be an explicit, logged UPDATE, not an implicit cast.
**Status:** upheld

### [WARN] party-security — Dropping `ChannelToken` leaves live third-party grants in place and deletes the only record of them

**Quotes:**

> A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows
> the `/team` social channels section
> **Problem:** A stored channel token is a live grant held at Instagram or LinkedIn. Dropping the table and the `/team` channels section removes the app's copy of the token and the only UI that could disconnect it. It does nothing to the grant at the provider. After the migration, any connected channel keeps a valid publish grant for this app at the provider, and nobody inside the system can see or revoke it. The operator's only recovery is to remember which accounts were connected and revoke each one by hand in each provider's settings. The proposal does not mention this step. Round 2: no seat addressed this. A fresh system with no connected channels has no exposure, but nothing in the design confirms that state before the table goes.
> **Fix:** Add a pre-migration step: disconnect every channel, revoking the grant at the provider where its API allows. At minimum, have the precondition from the finding above list the connected accounts on stderr. Before deleting `docs/social-publishing-setup.md`, document the manual revoke for each provider in `docs/deploy.md`.
> **Status:** upheld

### [WARN] party-security — Download's render-on-demand has no stated failure path, and the natural fallback serves a stale image as if it were current

**Quotes:**

> One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
> The separate Export step goes.
> **Problem:** Download becomes the only point where an image leaves the system, and it renders on the way out. Renders can fail: a screenshot that cannot be placed, a renderer timeout, a storage error. The design does not say what Download does when the render fails. The easiest implementation hands back the last stored PNG. That file is exactly what "not current" means: an image whose headline or design differs from the draft the user sees. It saves to the user's machine looking exactly like a successful download, and once the user posts it by hand it cannot be recalled. Before this change, the separate Export step made "the stored PNG is out of date" a visible state, and that state is gone.

Round 2: the architect and BA seats independently found that "current" is undefined. That is the same gap seen from the contract side, and it strengthens this finding: without a defined "current", the fail-closed rule cannot be written either. If the PO seat's option of keeping Export is chosen, this finding becomes moot. As written, it stands.
**Fix:** Specify that if the PNG is not current and the render fails, Download fails closed: no file is saved, a named error is shown, and nothing is written. If serving the previous PNG is ever allowed, the user must choose it explicitly, and both the downloaded file and the UI must mark it as out of date.
**Status:** upheld

### [WARN] party-security — Test seams may survive while the env var that gated them is removed

**Quotes:**

> the test seams `scheduler-tick` and `worker-heartbeat`, if nothing else needs them
> the `MOCK_SOCIAL` and `MOCK_SOCIAL_FAIL` seams
> **Problem:** Whether the seam routes are removed depends on a condition the plan settles later, but `MOCK_SOCIAL` is removed unconditionally. A surviving seam gives test-only write access over HTTP: it can tick the scheduler or forge a heartbeat. If its gate included `MOCK_SOCIAL`, removing that variable leaves the plan two options. It can delete the check, which weakens the gate in place. Or it can keep a check on a variable that is never set again, which leaves the gate as dead code nobody owns. Either way the remaining protection is narrower than before, and the proposal does not say so. A forged heartbeat would also make the Insights Health line, which "keeps working", report a dead retention loop as healthy.

Round 2: the architect seat argues that the seams should be kept to test the retention loop and Health. That makes it more likely a seam survives, so this gate question needs an answer, not less.
**Fix:** State that any seam that survives keeps at least two independent gates: a production 404, plus a mock flag that is still in use, such as `MOCK_AI`. It also stays admin-only. Add a unit test that the seam returns 404 when the mock flag is unset.
**Status:** upheld

### [NOTE] party-security — Removing the publish line and HOLD leaves no flagged-facts or stale-headline check where the image leaves the system

**Quotes:**

> `src/lib/campaign/queue.ts`, `loadCaptionForPublish` and `publishLineFor`.
> The facts check stays: it still computes and shows its notice. Only the HOLD rule goes.
> **Problem:** The publish dialog's line and the HOLD rule were the two checks that ran at the point of egress. With both gone, a draft whose facts check is `flagged` or `error`, or whose headline is `stale`, downloads with no prompt at the moment it leaves. The notices stay on the draft page, so a person can still see them, and the exposure is small. However, nothing acts on the `error` state (the check did not run) any more.
> **Fix:** Show the facts-check and headline state next to the Download button, or in a one-line confirmation when either is not clean. The check should be visible but not blocking, so the warning `publishLineFor` gave carries over to the new point of egress.
> **Status:** upheld

### [NOTE] party-security — Rebuttal to party-visionary: "nothing is deployed and nothing is lost" is the unchecked premise, not a reason to prefer the rebuild

**Quotes:**

> Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values? The plan decides, and the down script must match.
> The system starts fresh, so no data is migrated.
> **Problem:** The visionary seat recommends the type rebuild "since nothing is deployed and nothing is lost". I do not dispute the long-horizon case for the rebuild. The failure-mode reading is different: a type rebuild is the step that must either remap or reject every draft row that holds a retired value. "Nothing is lost" is true only on a database where those rows do not exist, and the design never checks that. Choosing the rebuild because the system is fresh, without the precondition, turns an assumption into a silent data rewrite on any database that does not match it.
> **Fix:** Adopt the rebuild only behind the fail-closed precondition in this seat's BLOCK finding: abort if any draft holds a value being retired, and make any remap an explicit, logged UPDATE. With that guard in place, the visionary seat's preference and this seat's objection are compatible.
> **Status:** upheld

### [WARN] party-visionary — Once 038 and 039 land on top of this removal, publishing can no longer be brought back by reverting it, and the artifact does not say so

**Quotes:**

> The user (2026-10-28) uses the app only to generate post images, download them and copy captions. Scheduled generation, manual publishing and auto-publishing are not needed.
> This is change 1 of 3 from one user request. 038 replaces campaigns with projects, and 039 reworks captions into one general caption plus curated Instagram, LinkedIn and Facebook captions on demand.
> **Problem:** The case for removing publishing rests on how the app is used today, and nothing in the artifact treats that as a permanent decision. On the day 037 merges, reverting it would bring publishing back. But the code it deletes reads things that the next two changes take away. The queue runs on campaigns (`src/lib/campaign/queue.ts`, `/api/campaigns/[id]/queue*`), and 038 replaces campaigns. `loadCaptionForPublish` reads per-channel captions, and 039 rebuilds those. After 039, bringing back scheduling would no longer be `git revert 037`. It would mean building a new subsystem against projects and general-plus-curated captions, with a new schema, new worker loops, a new MCP/ACP surface and new analytics vocabulary. The decision becomes one-way two changes from now, and the artifact never asks whether the user means to give it up for good. Round 2 adds support from two other seats. party-ba's finding that the usage claim is unsourced and covers three capabilities, and party-po's proposed A/B split, both leave this horizon unchanged. Splitting the removal does not change what 038 and 039 build on.
> **Fix:** State in the proposal that this removal becomes irreversible once 038 and 039 build on it, and record that the user accepts this. Tag the last commit that still has publishing (for example `pre-037-publishing`), so a later rebuild starts from a known reference point instead of digging through about 90 files.
> **Status:** upheld

### [WARN] party-visionary — Retiring the `Channel` requirement in the coverage test turns off the guard just before 039 adds a channel

**Quotes:**

> The `scheduler` source and the `Channel` carrier for `analyticsCoverage.test.ts` are handled deliberately: retired in the catalogue, or carried by another event. The test is updated, not deleted.
> `Channel` stays, because captions use it.
> **Problem:** The next change to touch `Channel` is already named: 039 adds Facebook. The coverage test exists to make that change fail until some event can carry the new value. Under the first option ("retired in the catalogue"), the test stops requiring a `Channel` carrier. 039 then adds `FACEBOOK` and passes the guard even though no event can report a Facebook caption. Nobody notices until someone opens Insights and finds no Facebook data. party-architect asks for one disposition to be picked, which settles things for merge day. This finding is about which pick matters: one option keeps the guard working, and the other turns it off for exactly the next value it was built to catch. 038 will copy the same "or" when it retires campaign vocabulary from the same catalogue.
> **Fix:** Retire the `scheduler` source if that is the right call, but rule out retiring the `Channel` requirement. Keep that requirement, carried by a caption event that exists today, so that 039's `FACEBOOK` fails the test until 039 gives it a carrier.
> **Status:** upheld

### [WARN] party-visionary — The rule for retired enum values considers only migration safety, not what later code has to carry

**Quotes:**

> Draft status values that only mean "published" are retired, or kept and made unreachable, whichever the plan finds safe for Postgres enums.
> Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values? The plan decides, and the down script must match.
> **Problem:** The only test the plan is given is "safe for Postgres enums", which is a test that applies on merge day only. If the values are kept, they stay in the generated Prisma types for good. Every later exhaustive `switch` on `DraftStatus` then needs an arm for a status that can no longer happen. Every filter, label map and zod schema built from the enum still offers it. The first changes to pay are 038's library project filter, or any later change that reworks the draft lifecycle around Download. Each inherits a `PUBLISHED`-style value that nothing writes and no comment explains. If publishing ever comes back, a dormant `PUBLISHED` invites someone to reuse it with a meaning that has since moved on. This is also the first time the project retires values from a live enum, so whatever 037 does becomes the template for 038's campaign-era values. party-architect has a point: `PostGenerationAction` may go away whole with `ScheduledGeneration`, which narrows this finding to `DraftStatus` but does not remove it. party-security's fail-closed precondition fits with the fix below: a rebuild with a guarded, logged remap is still the cheaper thing to live with.
> **Fix:** Make the criterion explicit and long-term. Prefer the type rebuild while the system is still fresh: nothing is deployed, so nothing is lost. If values are kept anyway, mark them retired in the code and state that the name is never reused, the way post styles and looks already treat their keys.
> **Status:** upheld

### [WARN] party-visionary — Download is Export under a new label, and its events are left to 039, so one fact will have two names

**Quotes:**

> One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
> The separate Export step goes.
> The Insights caption, download and copy metrics. That is 039.
> **Problem:** The user-facing action becomes "Download", but its storage path keeps the Export name. Going by "stores it as Export does today", its status value and any event Export emits today probably keep that name too. 037 ships the new action and leaves its analytics to 039, so between the two changes, downloads are recorded under Export's name. 039's download metric then has two choices. It can add a new event and combine it with the Export rows for the whole 180-day retention window. Or it can keep the Export name for good, so the code, events and database say "export" for something the UI calls "download". Either way, one fact ends up with two names, and every later reader of Insights or the draft lifecycle has to know they mean the same thing. Later changes will also copy the precedent of adding an action and leaving its events to someone else. party-architect's finding that `EXPORTED` is never dispositioned and party-po's challenge to the merge itself are about this change. This finding is about the name the next two changes inherit. It assumes Export has an event today, which the artifact does not say.
> **Fix:** Decide in 037 what Download's event is called and who emits it, even if 039 builds the metric on top. Or state that the Export names are kept on purpose as the internal name for Download, so 039 does not create a second one.
> **Status:** upheld

### [NOTE] party-visionary — Keeping a whole container for a single retention sweep locks that setup into the future deploy workflow without saying why

**Quotes:**

> The scheduler container keeps only the analytics `retention` loop and its heartbeat.
> **Problem:** After 037, the worker container, the `WorkerHeartbeat` table, the health logic and the Insights Health line all exist to watch a single 180-day retention sweep. The container is still named "scheduler", though it no longer schedules anything. The next change to touch this is the deploy workflow, which the artifact names as future work. That workflow will add a second long-running service to the server's setup, with its own restart policy, monitoring and env. Once it exists, removing the container costs a deploy change, not a code change. The artifact gives no reason why this loop needs its own process, so it stops one step short of the simplification the removal makes possible. party-architect asks what Health reads on merge day, which is a separate question. Its answer only matters if the container is still worth having.
> **Fix:** Choose one of two options and state it. Either keep the container on purpose as the home for future background jobs and rename it to match, or note that retention could run another way (a cron entry, a sweep on read, or the app process), so the deploy workflow does not take on the container by default.
> **Status:** upheld

### [WARN] party-visionary — Rebuttal to party-po: leaving the schema drop "optional, or never" is the more expensive thing to live with, and the cheap window to drop closes at the first deploy

**Quotes:**

> A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows other than retention's, along with their enums and back-relations.
> The system starts fresh, so no data is migrated.
> **Problem:** party-po's split puts the migration in a Part B that is "optional and justif[ied] separately", possibly never shipped. On merge day that is cheaper. One year on it is not. If Part B never ships, the `Post` and `ScheduledGeneration` tables, the `Post` back-relations on draft and team models, and the published `DraftStatus` values stay in the Prisma client with no writer. 038 has to decide whether to repoint `ScheduledGeneration`'s campaign relation onto projects or leave it dangling, and 039 has to work around `Post`'s caption-per-channel shape. Every change that touches those models pays to carry them. The timing also gets worse, not better. "The system starts fresh" is true now, before any deploy. Once the user deploys, the drop needs exactly the data handling party-security asks for (fail-closed checks, a dump, and revoking provider grants against real rows). A deferred Part B therefore costs more than doing it now.
> **Fix:** If the change is split, ship Part B before the first deploy, and treat that ordering as a commitment rather than leaving the drop "optional, or never".
> **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-visionary — The ACP manifest takes two breaking changes in a row, and the size of the bump is unstated, so 038 will copy whatever 037 picks

**Quotes:**

> 6. **MCP and ACP.** `publish_post` is removed from both. The ACP manifest version goes up. `generate_post` stays; its campaign input is 038's.
> **Problem:** Removing a capability breaks every client that calls it. The artifact says the version "goes up" but not which part of it. If 037 uses a minor bump for a removal, that becomes the version rule for a published contract, and 038 will repeat it when it changes `generate_post`'s campaign input. A client that pins on the major version would then take two breaking changes without warning.
> **Fix:** State that removing `publish_post` is a major bump, and say whether 038 rides the same bump.
> **Status:** withdrawn — two other seats cover the substance: party-architect's note on which version component, and party-po's note on one bump versus three. The long-horizon part I added assumed that some client already depends on the manifest, so that a published number cannot be taken back. The proposal suggests the opposite: "The system starts fresh" and the deploy workflow is out of scope, so no client has read it yet. Until one does, the version is reversible, and the one-way-door claim does not hold.
