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
