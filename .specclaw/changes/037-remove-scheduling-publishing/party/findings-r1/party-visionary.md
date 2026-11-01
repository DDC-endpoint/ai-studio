### [WARN] party-visionary — Once 038 and 039 land on top of this removal, publishing can no longer be brought back by reverting it, and the artifact does not say so

**Quotes:**

> The user (2026-10-28) uses the app only to generate post images, download them and copy captions. Scheduled generation, manual publishing and auto-publishing are not needed.
> This is change 1 of 3 from one user request. 038 replaces campaigns with projects, and 039 reworks captions into one general caption plus curated Instagram, LinkedIn and Facebook captions on demand.
> **Problem:** The case for removing publishing rests on how the app is used today. Nothing in the artifact treats that as a permanent decision. On 037's own merge day, reverting it would bring publishing back. But the code it deletes reads things the next two changes take away. The queue runs on campaigns (`src/lib/campaign/queue.ts`, `/api/campaigns/[id]/queue*`), and 038 replaces campaigns. `loadCaptionForPublish` reads per-channel captions, and 039 rebuilds those. After 039, "bring back scheduling" would no longer be `git revert 037`. It would be a new subsystem rebuilt against projects and general-plus-curated captions, with a new schema, worker loops, MCP/ACP surface and analytics vocabulary. The decision becomes one-way two changes from now, and the artifact never asks whether the user means to give it up for good.
> **Fix:** State in the proposal that this removal becomes irreversible once 038 and 039 build on it, and record that the user accepts this. Tag the last commit that still has publishing (for example `pre-037-publishing`) so a later rebuild has a known reference point instead of archaeology across ~90 files.
> **Status:** upheld

### [WARN] party-visionary — Retiring the `Channel` requirement in the coverage test silences the guard just before 039 adds a channel

**Quotes:**

> The `scheduler` source and the `Channel` carrier for `analyticsCoverage.test.ts` are handled deliberately: retired in the catalogue, or carried by another event. The test is updated, not deleted.
> `Channel` stays, because captions use it.
> **Problem:** The next change to touch `Channel` is already named: 039 adds Facebook. The coverage test exists to make that change fail until some event can carry the new value. Under the first option, "retired in the catalogue", the test stops requiring a `Channel` carrier. 039 then adds `FACEBOOK` and passes the guard with no event able to report a Facebook caption. Nobody notices until someone opens Insights and finds no Facebook data. The two options are not interchangeable: one keeps the guard working and the other turns it off for exactly the next value it was built to catch. The same "or" will be copied by 038, which retires campaign vocabulary in the same catalogue.
> **Fix:** Retire the `scheduler` source if that is the right call, but rule out retiring the `Channel` requirement. Keep it, carried by a caption event that exists today, so that 039's `FACEBOOK` fails the test until 039 gives it a carrier.
> **Status:** upheld

### [WARN] party-visionary — The rule for retired enum values is chosen for migration safety only, not for what later code has to carry

**Quotes:**

> Draft status values that only mean "published" are retired, or kept and made unreachable, whichever the plan finds safe for Postgres enums.
> Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values? The plan decides, and the down script must match.
> **Problem:** The only test the plan is given is "safe for Postgres enums", which is a merge-day test. If the values are kept, they stay in the generated Prisma types for good. Every later exhaustive `switch` on `DraftStatus` needs an arm for a status that can no longer happen, and every filter, label map and zod schema built from the enum offers it. The first change to suffer is 038's library project filter, or any later change that reworks the draft lifecycle around Download: it inherits a `PUBLISHED`-style value with no writer and no comment explaining why it is there. If publishing ever returns, a dormant `PUBLISHED` invites someone to reuse it with a meaning that has moved on. This is also the first time the project retires values from a live enum. Whatever 037 does becomes the template for 038's campaign-era values.
> **Fix:** Make the criterion explicit and long-term. Prefer the type rebuild while the system is still fresh, since nothing is deployed and nothing is lost. If values are kept anyway, mark them retired in the code and say that the name is never reused, the way post styles and looks already treat their keys.
> **Status:** upheld

### [WARN] party-visionary — Download is Export under a new label, and its events are deferred to 039, so one fact will have two names

**Quotes:**

> One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
> The separate Export step goes.
> The Insights caption, download and copy metrics. That is 039.
> **Problem:** The user-facing action becomes "Download", but its storage path, and (inferring from "stores it as Export does today") its status value and whatever event Export emits today, keep the Export name. 037 ships the new action and leaves its analytics to 039. Between the two changes, downloads are recorded under Export's name. 039's download metric then has two choices. It can add a new event and union it with the Export rows for the whole 180-day retention window. Or it can adopt the Export name for good, leaving code, events and the database saying "export" for something the UI calls "download". Either way, one fact has two names, and every later reader of Insights or the draft lifecycle has to know they are the same thing. The precedent of a change adding an action and leaving its events to a later change will also be copied. This reading assumes Export has an event today; the artifact does not say.
> **Fix:** Decide in 037 what Download's event is called and who emits it, even if 039 builds the metric on top. Alternatively, state that the Export names are kept on purpose as the internal name for Download, so 039 does not create a second one.
> **Status:** upheld

### [WARN] party-visionary — The ACP manifest takes two breaking changes in a row, and the size of the bump is unstated, so 038 will copy whatever 037 picks

**Quotes:**

> 6. **MCP and ACP.** `publish_post` is removed from both. The ACP manifest version goes up. `generate_post` stays; its campaign input is 038's.
> **Problem:** Removing a capability breaks every client that calls it. The artifact says the version "goes up" but not which part. If 037 publishes a minor bump for a removal, it sets the version semantics of a published contract. 038 then changes `generate_post`'s campaign input, a second break, and will repeat 037's choice. A client that pins on the major version would take two breaking changes without warning, and the manifest's version stops meaning anything. A published version number cannot be withdrawn once a client has read it. The program also has a cheaper option it does not take: 037 and 038 are known in advance to break the same contract, so they could share one bump.
> **Fix:** State that removing `publish_post` is a major bump, or explain why it is not. Note in the proposal that 038's `generate_post` input change either rides the same major version (if both ship before any client depends on the manifest) or takes the next one.
> **Status:** upheld

### [NOTE] party-visionary — Keeping a whole container for a single retention sweep locks that topology into the future deploy workflow without saying why

**Quotes:**

> The scheduler container keeps only the analytics `retention` loop and its heartbeat.
> **Problem:** After 037, the worker container, the `WorkerHeartbeat` table, the health logic and the Insights Health line all exist to watch a single 180-day retention sweep. The container is still named "scheduler", though it no longer schedules anything. The next change to touch this is the deploy workflow, which the artifact names as future work. It will write a second long-running service into the server's setup, with its own restart, monitoring and env. Once that exists, removing the container costs a deploy change, not a code change. The artifact gives no reason this loop needs its own process, so it stops one step short of the simplification the removal makes possible. If the container is instead meant as the place for future background jobs, that would be useful leverage, but the artifact does not claim it either.
> **Fix:** Choose and state one of two options. Either keep the container on purpose as the home for future background jobs, and rename it to match, or note that retention could run another way (a cron entry, an on-read sweep, or the app process) so the deploy workflow does not take on the container by default.
> **Status:** upheld
