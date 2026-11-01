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
