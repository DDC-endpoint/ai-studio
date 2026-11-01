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
