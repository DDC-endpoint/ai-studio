# Design: Remove scheduled generation and publishing

**Change:** 037-remove-scheduling-publishing
**Created:** 2026-10-30
**Spec:** `spec.md` (decisions D1–D12, FR-01–FR-15, AC-01–AC-20)

## Technical approach

This change is mostly deletion. One piece is new: the Download route.

The work runs in an order that keeps every commit compiling:

1. **Add Download.** Export is still there until Download replaces it in the same task.
2. **Remove scheduled generation.** This is the queue, the generation loop and the briefing plan. It goes first because `generationRunner` imports from the publish library, and nothing in publishing imports scheduling.
3. **Remove publishing.** This covers the posts routes, the social clients, the publish loop, `publish_post` and the publish UI.
4. **Drop the schema.** By this point no code reads the dropped models, so the Prisma client can lose them without breaking `tsc`.
5. **Update docs and run the full gate.**

The Prisma models stay in `schema.prisma` until step 4. Steps 2 and 3 therefore compile against the old client, and their `tsc` gate proves the code no longer depends on the models.

## Architecture

### Download (D4)

```
DraftPage ──fetch──▶ GET /api/drafts/[id]/download
                         │ withTeamAuth + canAccessContent (404 otherwise)
                         ▼
                ensureCurrentExport(draftId)      src/lib/drafts/download.ts
                         │
          ┌──────────────┴───────────────┐
   current? (exportUrl == current       not current
   revision's exportUrl)                 │ renderDraftHtml(...)   (as Export did)
          │                               │ uploadObject(BUCKET_EXPORTS, exportKey('export', id))
          │                               │ CAS: draft.updateMany where
          │                               │   { id, currentRevisionNumber, exportUrl, status: EXPORTED, pendingAction: null }
          │                               │   (+ fill the revision's null exportUrl in the same tx)
          │                               │ lost CAS → deleteObject + 409 changed
          ▼                               ▼
     getObjectBytes(BUCKET_EXPORTS, key) ─▶ 200 image/png, Content-Disposition: attachment
                         │
                    track('draft.downloaded', { rendered, factsStatus, headlineState, failure? })
```

- `ensureCurrentExport` returns a tagged result: `{ ok: true, key, rendered }` or `{ ok: false, status, code, message }`. The route maps it to a response and emits the event. That keeps the function pure enough to unit-test with a mocked prisma and storage, as other route libraries are tested.
- The client fetches with `apiFetch`'s raw mode, or a plain `fetch`, turns the body into a blob, and clicks a temporary `<a download>` with the filename from the header. On a non-2xx it reads the JSON `{ error, code }` and shows a toast.
- The render call is the one `src/app/api/generate/export/route.ts` makes today. That route's entries in the font-injection and composite guard tests (`tests/unit/fontInjectionSites.test.ts`, `tests/unit/compositeRerender.test.ts`) move to the download route. `renderedTextWriters.test.ts` keeps "a re-export leaves `renderedText` alone".

### Migration (D1, D2, FR-01)

`prisma/migrations/20261031120000_remove_scheduling_publishing/migration.sql` runs these steps in order:

```sql
-- 1. Fail-closed precondition (037 D2). Nothing below runs if this raises.
DO $$
DECLARE p int; t int; g int; d int;
BEGIN
  SELECT count(*) INTO p FROM "Post";
  SELECT count(*) INTO t FROM "ChannelToken";
  SELECT count(*) INTO g FROM "ScheduledGeneration";
  SELECT count(*) INTO d FROM "Draft" WHERE status = 'PUBLISHED';
  IF p + t + g + d > 0 THEN
    RAISE EXCEPTION '037 remove_scheduling_publishing refused: % Post, % ChannelToken, % ScheduledGeneration, % PUBLISHED drafts. Run scripts/clear-publishing-data.mjs first (see docs/deploy.md).', p, t, g, d;
  END IF;
END $$;

-- 2. Drop tables (FKs go with them), then their enums.
DROP TABLE "Post"; DROP TABLE "ChannelToken"; DROP TABLE "ScheduledGeneration";
DROP TYPE "PostStatus"; DROP TYPE "PostGenerationAction"; DROP TYPE "GenerationStatus";

-- 3. Rebuild DraftStatus without PUBLISHED.
ALTER TYPE "DraftStatus" RENAME TO "DraftStatus_old";
CREATE TYPE "DraftStatus" AS ENUM ('IN_PROGRESS', 'EXPORTED', 'FAILED');
ALTER TABLE "Draft" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Draft" ALTER COLUMN "status" TYPE "DraftStatus" USING ("status"::text::"DraftStatus");
ALTER TABLE "Draft" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';
DROP TYPE "DraftStatus_old";

-- 4. Heartbeats of the removed loops.
DELETE FROM "WorkerHeartbeat" WHERE "loop" <> 'retention';
```

- The exact SQL for steps 2–3 is generated with `prisma migrate diff --from-migrations … --to-schema-datamodel …` against the edited schema, then checked by hand and prefixed with step 1. `migrate diff` must exit 0 afterwards (NFR-05).
- When the precondition raises, `prisma migrate deploy` records the migration as failed. The operator recovery is documented in `docs/deploy.md`:
  1. `npx prisma migrate resolve --rolled-back 20261031120000_remove_scheduling_publishing`
  2. `DATABASE_URL=… node scripts/clear-publishing-data.mjs` (a dry run that lists counts and accounts)
  3. The same command with `--yes`
  4. `npm run db:migrate`
- The down script `prisma/rollback/037-remove-scheduling-publishing.down.sql` recreates the three tables with their indexes and FKs, the three enums and the `PUBLISHED` value (via `ALTER TYPE … ADD VALUE`). Its header says it restores the schema only and that no data comes back.

### Operator script (FR-02)

`scripts/clear-publishing-data.mjs` copies `purge-analytics.mjs`:

- It reads `DATABASE_URL` before importing the client.
- It uses a dynamic `import('@prisma/client')` with the URL passed explicitly.
- It does all its work with raw SQL. The head client has no `Post` model, and the script runs before the migration, against the old tables.

The logic sits in a small exported function, `planClear(counts, accounts, { yes })`. It returns the lines to print, the statements to run and the exit code, which lets AC-03 test it without a database. The script file is `.mjs`. The unit test imports the function from `scripts/lib/clearPublishing.mjs`, as `uiInvariants.mjs` is imported from `scripts/lib`. The `--yes` path runs in one transaction:

1. `DELETE FROM "Post"`
2. `DELETE FROM "ScheduledGeneration"`
3. `DELETE FROM "ChannelToken"`
4. `UPDATE "Draft" SET status = 'EXPORTED' WHERE status = 'PUBLISHED'`

Each count is printed.

### Worker (FR-03)

```ts
// src/scheduler/worker.ts — the "scheduler" container (name kept, 037 D9).
// It runs one loop: analytics retention (006 FR-11).
await loop('retention', async () => {
  await sweepAnalytics()
})
```

- `src/lib/scheduler/heartbeat.ts` (`runTick`) stays.
- `heartbeatStatus.ts` is deleted. `OFFLINE_THRESHOLD_MS` moves into `src/lib/analytics/queries.ts`, next to `retentionLoopState`, the only remaining reader.
- AC-12's worker test can import a `LOOPS` constant exported from a side-effect-free module (`src/scheduler/loops.ts`). That keeps the test from having to start `main()`.

### Analytics (D5–D7, FR-12)

- **The catalogue:**
  - Remove `publish.settled` and `scheduled_generation.settled`.
  - Add `draft.downloaded`.
  - Add `channel: z.nativeEnum(Channel).optional()` to `draft_action.settled`.
  - Bump `draft.headline_edited` to version 2 without `scheduledPending`.
  - Remove `scheduler` from `generation.finished`'s sources.
  - Export `RETIRED_EVENT_NAMES = ['publish.settled', 'scheduled_generation.settled'] as const` and `RETIRED_SOURCES = ['scheduler'] as const`, with a comment that a retired name is never reused.
- **The `channel` field:** the regenerate-copy route passes the channel into the settle payload when its body names one. `src/lib/drafts/draftActions.ts` forwards it.
- **`trackHeadlineEdited`** (`src/lib/renderedText/track.ts`) stops reading `_count.posts`.
- **Insights:** `queries.ts` drops the `held` column and the `scheduled_generation.settled` name from the post-styles query. `sections.tsx` drops the "Held" column and rewords the section question.

### MCP and ACP (D8, FR-11)

- `src/mcp/server.ts`: remove the `publish_post` definition and its `case`, and set the version to `2.0.0`.
- `src/acp/agent.ts`: remove the capability, set `version: '2.0.0'` and reword the description.
- `src/app/api/acp/run/route.ts`: remove the `case`. Its default branch already answers an unknown capability.
- Delete `src/mcp/tools/publish.ts`.
- The manifest unit test pins the key set and the version.

### Library and dashboard (D10, D11, FR-06, FR-07)

- **Library where-clause:**

  ```ts
  where.status = 'EXPORTED'
  if (postStyle) and.push({ brief: { postStyle } })
  if (brandKitId)
    and.push({
      OR: [{ brief: { brandKitId } }, { brief: { brandKitId: null, campaign: { brandKitId } } }],
    })
  ```

  The D6 visibility clause stays ANDed, as it is now. The kit list for the select comes from the existing brand kits list route.

- **Dashboard month bound:** a pure helper, `monthStartUtc(now: Date): Date` in `src/lib/dates.ts` (or beside the page if no dates module exists), tested at the month edges.

### Removal map

The full file list is in `tasks.md`, task by task. The rule for shared vocabulary is to keep any name that 038 or 039 still needs and to remove only what is dead. `PUBLISHABLE_CHANNELS`, `Brief.channels` and `CAPTION_CHANNELS` stay. `channelLabel` stays, because captions use it.

## Key decisions

All of these are in `spec.md` D1–D12. These have the most structural weight:

| Decision                                                   | Why                                                                                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rebuild `DraftStatus`, drop the three enums (D1)           | Nothing is deployed, so this is the cheapest moment. Dead enum values would have to be handled by every later `switch`.                                                                                                                    |
| Fail-closed precondition plus a separate clear script (D2) | `migrate deploy` cannot take a flag, and a GUC set on the database is invisible and easy to forget. A script the operator runs, with a dry run that lists the channel accounts, is the explicit and logged acceptance the panel asked for. |
| Keep `AnalyticsSource.scheduler` in Postgres (D1, D6)      | Rebuilding it would mean rewriting or deleting append-only history rows. Retiring it in code stops new writes, and retention removes the old rows within 180 days.                                                                         |
| Download streams the bytes (D4)                            | A pre-signed MinIO URL is cross-origin, so `<a download>` cannot name the file, and MinIO is never public. Streaming keeps the bucket private and gives a real filename.                                                                   |
| `channel` on `draft_action.settled` (D5)                   | It is the only existing event that acts per channel. It keeps the `Channel` coverage rule alive for 039's `FACEBOOK`.                                                                                                                      |
| Keep the container name (D9)                               | Nothing deploys yet, and a rename buys nothing but doc churn. The comment records the reason.                                                                                                                                              |

## Risks

| Risk                                                                                                                                    | Mitigation                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The broad deletion leaves a dangling import or test                                                                                     | Steps 2–4 are each gated by `tsc`, lint and unit, and AC-12's import guard runs too. The full E2E suite runs at the end.                    |
| A suite outside the four named ones silently relies on publishing (for example `regression`, `surfaces`, `ui`, `a11y`, `team-settings`) | Each removal task greps `tests/` for the names it removes and updates the hits in the same task. T5 runs the whole mock suite.              |
| The upgrade-path test's scenario 1 seeds a `Post` and a `PUBLISHED` draft                                                               | T4 moves scenario 1's checks to the migration before 037, then adds the AC-02 sequence. The scenario then doubles as the fail-closed proof. |
| Prisma records a failed migration and blocks later deploys                                                                              | The documented `migrate resolve --rolled-back` step. The precondition raises before any DDL, so the rollback is clean.                      |
| The local `ai_studio` database holds rows the user cares about                                                                          | The precondition refuses, and the dry run shows exactly what would go. The user decides; nothing is deleted without `--yes`.                |
| 038 and 039 conflict on shared files (`schema.prisma`, the catalogue, `api-types`)                                                      | 037 lands and is verified before 038 is planned (program order).                                                                            |

## Grounding sources

- `CLAUDE.md`, "Working rules":
  - "One task at a time: an implementer subagent does it, `specclaw:code-reviewer` reviews it, and the orchestrator runs tsc, lint and unit and commits." This is why each task must compile alone (NFR-04).
  - "A `page.waitForResponse` must be created before the action that triggers the request." This applies to the Download and library E2E cases.
- `CLAUDE.md`, "Analytics (006)":
  - "A change that adds an action, a channel, a generation path or a publish path owns its events." A removal owns its retirement, which is D6.
  - "Retention is 180 days, swept by a third worker loop (`retention`, 5 000 rows per tick, not in the scheduler banner)." Retention is the one loop kept.
- `CLAUDE.md`, "Stale-headline badge (030)": "The publish dialog shows one non-blocking line (`publishLineFor`); nothing blocks publishing." This becomes FR-05's download line.
- `CLAUDE.md`, "Post styles (027)": "**The HOLD rule:** a `SCHEDULE_PUBLISH` or `PUBLISH_NOW` entry whose check is `flagged` or `error` creates no `Post`." This is removed with the queue. The facts check itself stays.
- `src/lib/analytics/catalogue.ts:7-9` gives the version rule used in D5 and D6.
- `scripts/purge-analytics.mjs:1-20` gives the explicit-`DATABASE_URL` guard and the dynamic import pattern used by FR-02.
- `scripts/test-upgrade-path.mjs:322-394` is scenario 1, which seeds `Post` and `PUBLISHED` rows. T4 rewrites it.
