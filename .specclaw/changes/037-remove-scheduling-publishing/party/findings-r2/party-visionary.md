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

### [WARN] party-visionary — The ACP manifest takes two breaking changes in a row, and the size of the bump is unstated, so 038 will copy whatever 037 picks

**Quotes:**

> 6. **MCP and ACP.** `publish_post` is removed from both. The ACP manifest version goes up. `generate_post` stays; its campaign input is 038's.
> **Problem:** Removing a capability breaks every client that calls it. The artifact says the version "goes up" but not which part of it. If 037 uses a minor bump for a removal, that becomes the version rule for a published contract, and 038 will repeat it when it changes `generate_post`'s campaign input. A client that pins on the major version would then take two breaking changes without warning.
> **Fix:** State that removing `publish_post` is a major bump, and say whether 038 rides the same bump.
> **Status:** withdrawn — two other seats cover the substance: party-architect's note on which version component, and party-po's note on one bump versus three. The long-horizon part I added assumed that some client already depends on the manifest, so that a published number cannot be taken back. The proposal suggests the opposite: "The system starts fresh" and the deploy workflow is out of scope, so no client has read it yet. Until one does, the version is reversible, and the one-way-door claim does not hold.

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
