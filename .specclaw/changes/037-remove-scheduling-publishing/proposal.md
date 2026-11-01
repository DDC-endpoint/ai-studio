# Proposal: Remove scheduled generation and publishing

**Created:** 2026-10-28
**Status:** ✅ Approved (2026-10-28)

## Problem

The user (2026-10-28) uses the app only to generate post images, download them and copy captions. Scheduled generation, manual publishing and auto-publishing are not needed. They add the most moving parts in the system: a worker container, social channel tokens, the campaign queue, the HOLD rule, `Post` rows and the publish dialogs. They also gate the draft lifecycle: Publish needs `EXPORTED`, and the library filters on Published, Scheduled and Failed.

This is change 1 of 3 from one user request. 038 replaces campaigns with projects, and 039 reworks captions into one general caption plus curated Instagram, LinkedIn and Facebook captions on demand.

## Proposed Solution

Remove every scheduling and publishing path. Keep generation, refine, download and caption copy intact.

1. **Data.** A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows other than retention's, along with their enums and back-relations. It ships a manual down script in `prisma/rollback/`, as every migration does. The system starts fresh, so no data is migrated. `Channel` stays, because captions use it. Draft status values that only mean "published" are retired, or kept and made unreachable, whichever the plan finds safe for Postgres enums.
2. **Worker.** The scheduler container keeps only the analytics `retention` loop and its heartbeat. The `scheduler` (publish) and `generation` (queue) loops are removed. The Insights Health line keeps working.
3. **Download replaces Export.**
   - One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
   - The separate Export step goes.
   - The library drops its publish-status filters and filters by brand kit and post style. 038 adds the project filter.
   - The dashboard's "Posts published" and "Active campaigns" KPIs are removed, "Posts this month" (posts created in the current calendar month, team-wide) is added, and "Published to…" activity is removed. The "Projects" KPI is 038's.
4. **UI and routes removed:**
   - `/api/posts*`, `/api/team/channels*`, `/api/scheduler/status` and `/api/campaigns/[id]/queue*`
   - the test seams `scheduler-tick` and `worker-heartbeat`, if nothing else needs them
   - `PublishDialog`, `PublishHistoryDrawer`, `PostCard`, the draft page's Publish button, the `/team` social channels section, `ScheduledQueueSection` and `QueueEntryModal`
   - the `MOCK_SOCIAL` and `MOCK_SOCIAL_FAIL` seams
5. **Libraries removed:** `src/lib/social/*`, `src/lib/publish/*`, `src/lib/scheduler/{jobRunner,generationRunner,heldReason}.ts`, `src/lib/campaign/queue.ts`, `loadCaptionForPublish` and `publishLineFor`.
   - The facts check stays: it still computes and shows its notice. Only the HOLD rule goes.
6. **MCP and ACP.** `publish_post` is removed from both. The ACP manifest version goes up. `generate_post` stays; its campaign input is 038's.
7. **Analytics.**
   - `publish.settled` and `scheduled_generation.settled` stop being emitted.
   - The `scheduler` source and the `Channel` carrier for `analyticsCoverage.test.ts` are handled deliberately: retired in the catalogue, or carried by another event. The test is updated, not deleted.
   - Insights drops the post styles "held" column.
   - `draft.headline_edited.scheduledPending` is removed.
8. **Docs and tests.**
   - Remove `docs/social-publishing-setup.md`.
   - Update `CLAUDE.md` (023, 027 HOLD, 030 publish line), `docs/deploy.md`, `docs/cold-start.md`, `docs/mcp-acp-guide.md` and `docs/e2e-test-plan.md`.
   - Remove or rewrite the E2E suites `publish`, `campaign-scheduling`, `scheduler-heartbeat` and `export`, and the matching unit tests.
   - The full mock suite stays green.

## Scope

### In Scope

- Everything listed under Proposed Solution.
- The team Claude token's wording ("scheduler + member fallback" becomes "MCP/ACP + member fallback").
- `unattended-classic` callers lose the queue; MCP and ACP stay unattended. Guard tests that list surfaces are updated.

### Out of Scope

- Campaigns themselves, their briefing and documents, and projects. That is 038, which also adds the library's project filter.
- Caption generation and the caption UI (general and curated captions, Facebook). That is 039.
- The Insights caption, download and copy metrics. That is 039.
- Any deploy workflow.

## Impact

- **Size:** architectural (it removes two subsystems and changes the draft lifecycle, schema, worker, MCP/ACP contract and analytics vocabulary)
- **Files affected:** ~90 (estimated, including tests and docs)
- **Complexity:** large
- **Risk:** medium. This is broad deletion across shared enums, analytics coverage and guard tests. The full E2E suite and CI are the safety net.

## Decisions after the party review (user, 2026-10-28)

- **One change; the drop runs now.** 037 is not split. The migration drops the tables and rebuilds the retired enum types now, while nothing is deployed. It sits behind a fail-closed precondition: it aborts with a named error if `Post`, `ChannelToken` or `ScheduledGeneration` hold rows, or if any draft holds a retired status, unless the operator explicitly accepts the loss. It lists any connected channel accounts first. The down script restores the schema only.
- **Download replaces Export, as already decided.** "Current" means the stored PNG was rendered from the draft's latest revision. If a render is needed and fails, nothing downloads, nothing is written and the error is named.
- **Dashboard.** "Posts this month" is added in 037; "Projects" is added by 038.
- **One-way.** The user accepts that publishing and scheduling cannot be restored by a revert once 038 and 039 build on 037. The last commit with them is tagged `pre-037-publishing`.
- **Settled by the plan per the panel:**
  - **Test seams:** a surviving seam keeps a production 404 plus `MOCK_AI` and stays admin-only.
  - **Analytics:** the `Channel` coverage requirement stays, carried by an existing event, and the `scheduler` source is retired deliberately.
  - **Tests:** `scheduler-heartbeat` is rewritten for retention, and `export` becomes a Download suite.
  - **ACP:** the manifest goes to a major version, and 038 rides it.
  - **Download:** it names its event in 037 and shows the facts-check and headline state next to it.

## Open Questions

- Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values? The plan decides, and the down script must match.
- Should Download store the PNG in `BUCKET_EXPORTS` as Export did, or stream a render without storing it? The default is to keep storing, so re-downloads are cheap and refine history is unchanged.
- (party-po, BLOCK) A cheaper cut line exists: split UI/runtime removal (Part A) from the schema drop, enum rebuild and analytics cleanup (Part B) — see party-report.md
- (party-security, BLOCK) The drop migration must fail closed: abort if `Post`, `ChannelToken`, `ScheduledGeneration` or retired-status drafts hold rows, unless the loss is explicitly accepted; the down script restores schema only; any enum remap is an explicit, logged UPDATE — see party-report.md
- (party-security) Dropping `ChannelToken` leaves provider grants live; list connected accounts before the drop and document manual revoke — see party-report.md
- (party-security) Download must fail closed when the render fails: no stale file saved as if current — see party-report.md
- (party-security) Any surviving test seam keeps two gates (prod 404 plus a live mock flag such as `MOCK_AI`) and stays admin-only, with a unit test — see party-report.md
- (party-security) Show facts-check and headline state next to Download (visible, not blocking) — see party-report.md
- (party-security) The enum rebuild is acceptable only behind the fail-closed precondition — see party-report.md
- (party-architect) Name Download's route and render-and-store function, define "current" against a stamp, decide `EXPORTED`, and rewrite the `export` suite as a Download suite — see party-report.md
- (party-architect) State whether `PostGenerationAction` is dropped whole with `ScheduledGeneration` — see party-report.md
- (party-architect) Name what the Insights Health line reads and every place the expected loop set is defined — see party-report.md
- (party-architect) Specify the deterministic seam for the retention tick and heartbeat; rewrite `scheduler-heartbeat` for retention — see party-report.md
- (party-architect) Pick one disposition each for the `scheduler` source, the `Channel` carrier, `draft.headline_edited` schemaVersion, and the retired event names — see party-report.md
- (party-architect) The "Projects" KPI depends on 038; define "Posts this month" — see party-report.md
- (party-architect) State the new ACP manifest version and whether it is a major bump — see party-report.md
- (party-ba) Cite the request for each removed capability and whether other users or MCP/ACP clients were checked — see party-report.md
- (party-ba) Add falsifiable criteria: dropped tables absent, removed routes 404, `publish_post` absent, generate-refine-Download-copy E2E passes — see party-report.md
- (party-ba) Define "current" and confirm the user asked for Export to go — see party-report.md
- (party-ba) List the exact enum values in scope and define "held" — see party-report.md
- (party-po) Price the do-nothing option against ~90 files and a migration — see party-report.md
- (party-po) Download replacing Export is extra scope; state its value, latency and storage cost — see party-report.md
- (party-po) Replacement KPIs and new library filters have no stated need; defer "Projects" to 038 — see party-report.md
- (party-po) Name the cut line against 038 and 039 and whether the manifest bumps once or more — see party-report.md
- (party-visionary) The removal becomes irreversible once 038 and 039 build on it; record the user's acceptance and tag `pre-037-publishing` — see party-report.md
- (party-visionary) Keep the `Channel` coverage requirement, carried by an existing caption event, so 039's Facebook value must get a carrier — see party-report.md
- (party-visionary) Prefer the enum type rebuild now while nothing is deployed; never reuse a retired name — see party-report.md
- (party-visionary) Decide Download's event name in 037 so one fact does not get two names — see party-report.md
- (party-visionary) Keep the worker container on purpose (and rename it) or run retention another way — see party-report.md
- (party-visionary) If split, ship the schema drop before the first deploy, as a commitment — see party-report.md
