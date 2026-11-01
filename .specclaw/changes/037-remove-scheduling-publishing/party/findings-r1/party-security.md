### [BLOCK] party-security — The drop migration destroys rows unconditionally, and the "down script" cannot bring them back

**Quotes:**

> A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows other than retention's, along with their enums and back-relations. It ships a manual down script in `prisma/rollback/`, as every migration does. The system starts fresh, so no data is migrated.
> Postgres cannot drop an enum value in place. Should the retired `DraftStatus` and `PostGenerationAction` values go through a type rebuild in the migration, or stay as unused values? The plan decides, and the down script must match.
> **Problem:** Dropping four tables and rebuilding enum types destroys data and cannot be undone. The only recovery the proposal names is a down script. That script can recreate empty tables and enum values. It cannot restore the dropped `Post`, `ChannelToken` or `ScheduledGeneration` rows, or record which drafts held a retired `DraftStatus` before the type rebuild remapped or rejected them. "The system starts fresh" is an assumption about the database the migration happens to run on. Nothing in the design checks it. On any database that does hold rows (a dev stack, `ai_studio_test`, an early self-hosted deploy), the migration deletes them with no warning, and a rollback looks like it succeeded while restoring nothing. The text "ships a manual down script ... as every migration does" makes the drop look reversible when it is not.
> **Fix:** Make the migration fail closed. Before any DROP, it checks `Post`, `ChannelToken`, `ScheduledGeneration`, and drafts holding a status value about to be retired. If any of them has rows, it aborts with a named error, unless the operator has explicitly acknowledged the loss (for example, a documented one-line override). State in the down script's header and in `docs/deploy.md` that the down script restores schema only. Require a `pg_dump` of the affected tables as the data recovery path. If the enum is rebuilt, any remapping of retired values must be an explicit, logged UPDATE, not an implicit cast.
> **Status:** upheld

### [WARN] party-security — Dropping `ChannelToken` leaves live third-party grants in place and deletes the only record of them

**Quotes:**

> A migration drops `Post`, `ChannelToken`, `ScheduledGeneration` and `WorkerHeartbeat` rows
> the `/team` social channels section
> **Problem:** A stored channel token is a live grant held at Instagram/LinkedIn. Dropping the table and the `/team` channels section removes the app's copy of the token and the only UI that could disconnect it. It does nothing to the grant at the provider. After the migration, any connected channel keeps a valid publish grant for this app at the provider. Nobody can see it from inside the system, and nobody can revoke it from there. The operator's only recovery is to remember which accounts were connected and revoke each one by hand in each provider's settings. The proposal does not mention that step.
> **Fix:** Add a pre-migration step: disconnect every channel, revoking at the provider where its API allows, or at least list the connected accounts on stderr from the migration precondition above. Document the manual revoke for each provider in `docs/deploy.md` before deleting `docs/social-publishing-setup.md`.
> **Status:** upheld

### [WARN] party-security — Download's render-on-demand has no stated failure path, and the natural fallback serves a stale image as if it were current

**Quotes:**

> One Download button on the draft page renders the final PNG if it is not current, stores it as Export does today, and saves it to the user's machine.
> The separate Export step goes.
> **Problem:** Download is now the only point where an image leaves the system, and it renders on the way out. Renders can fail, for example a screenshot that cannot be placed, a renderer timeout, or a storage error. The design says nothing about what Download does when the render fails. The easiest implementation hands back the last stored PNG. That file is exactly what "not current" means: an image whose headline or design differs from the draft the user sees. It saves to the user's machine looking exactly like a successful download, and once the user posts it by hand, it cannot be recalled. Before this change, a separate Export step made "the stored PNG is out of date" a visible state. That state is gone.
> **Fix:** Specify that if the PNG is not current and the render fails, Download fails closed: no file is saved, a named error is shown, and nothing is written. If serving the previous PNG is ever allowed, the user must explicitly choose it, and the downloaded file and the UI must mark it as out of date.
> **Status:** upheld

### [WARN] party-security — Test seams may survive while the env var that gated them is removed

**Quotes:**

> the test seams `scheduler-tick` and `worker-heartbeat`, if nothing else needs them
> the `MOCK_SOCIAL` and `MOCK_SOCIAL_FAIL` seams
> **Problem:** Removing the seam routes depends on a condition the plan settles later, but removing `MOCK_SOCIAL` does not. A surviving seam is test-only write access over HTTP: it can tick the scheduler or forge a heartbeat. If its gate included `MOCK_SOCIAL`, removing that variable leaves the plan two options. It can delete the check, which weakens the gate in place, or keep a check on a variable that is never set again, which makes the gate dead code nobody owns. Either way the remaining protection is narrower than before, and nothing in the proposal says so. A forged heartbeat would also make the Insights Health line, which "keeps working", report a dead retention loop as healthy.
> **Fix:** State that any seam that survives keeps at least two independent gates (production 404 plus a mock flag that is still in use, such as `MOCK_AI`) and stays admin-only. Add a unit test that the seam returns 404 when the mock flag is unset.
> **Status:** upheld

### [NOTE] party-security — Removing the publish line and HOLD leaves no flagged-facts or stale-headline check where the image leaves the system

**Quotes:**

> `src/lib/campaign/queue.ts`, `loadCaptionForPublish` and `publishLineFor`.
> The facts check stays: it still computes and shows its notice. Only the HOLD rule goes.
> **Problem:** The publish dialog's line and the HOLD rule were the two checks that ran at the point of egress. With them gone, a draft whose facts check is `flagged` or `error`, or whose headline is `stale`, downloads with no prompt at the moment it leaves. The notices stay on the draft page, so a human can still see them and the exposure is small. However, the `error` state (the check did not run) now has nothing that acts on it.
> **Fix:** Show the facts-check and headline state next to the Download button, or in a one-line confirmation when either is not clean. The check should be visible, not blocking, so the warning that `publishLineFor` gave carries over to the new point of egress.
> **Status:** upheld
