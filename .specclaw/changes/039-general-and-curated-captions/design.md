# Design: One general caption, curated channel captions on demand

**Change:** 039-general-and-curated-captions
**Created:** 2026-11-01
**Spec:** `spec.md` (decisions D1–D28, FR-01–FR-22, NFR-01–NFR-08, AC-01–AC-29)

## Technical approach

Four things change together:

- **the caption's identity:** a kind, plus a channel only for curated captions;
- **the generation contract:** a headline and one general caption;
- **the caption actions:** curate, regenerate, edit, delete and undo, each recoverable;
- **the external caption shape:** MCP and ACP `2.2.0`.

The order keeps every commit compiling and the unit suite green. The risky schema step lands first, with no behaviour change, as 038 did with its additive migration:

1. **Caption identity.** The `caption_kind` migration and its down section, plus upgrade scenario 6. The registry gains the general entry, the rules data, the pure rules module and the registry guard. `FACT_WHERE`, the labels and the token budget are derived from it. The store queries by `(kind, channel)`. Generation still writes Instagram and LinkedIn, now as `CURATED` rows, so E2E is untouched apart from the compound-key lookups that `tsc` flags.
2. **The general caption (slice 1).**
   - Generation writes the headline and the general caption. The loader stops creating rows, and old posts get "Generate general caption".
   - The caption route takes `{ kind: 'GENERAL' }`, and "Regenerate all" goes.
   - The draft `GET` returns the new caption shape. `Brief.channels` is deprecated, and the Path B prompt line goes.
   - MCP and ACP move to `2.2.0` with the open list.
   - Every E2E suite that asserted Instagram and LinkedIn rows is retargeted.
3. **Curated captions (slice 2).**
   - The caption route creates a curated row (curate), passes the general caption, and stores `generalHash`.
   - The rate limit is added.
   - `previous` is saved on regenerate and edit. The delete and undo routes, and their tiers, are added.
   - The caption desk gets Curate, Delete and Undo, and its rules and facts lines.
4. **Facebook and the kit website.**
   - The `channel_facebook` and `kit_website` migrations, their down sections and scenario 6's extension.
   - The registry's Facebook entry, the link refusal and the composer.
   - The kit API and the kit page.
5. **Events and Insights.** `caption.copied` through `/api/events`, `CaptionKind` coverage, and the Captions section.
6. **Docs and the full gate.**

## Architecture

### Identity and schema (D1–D4)

```prisma
enum CaptionKind {
  GENERAL
  CURATED
}

model DraftCaption {
  id            String        @id @default(cuid())
  draftId       String
  draft         Draft         @relation(fields: [draftId], references: [id], onDelete: Cascade)
  // 039 D1: GENERAL has no channel; CURATED has one (CHECK DraftCaption_kind_channel).
  kind          CaptionKind
  channel       Channel?
  text          String        @default("") @db.Text
  status        CaptionStatus @default(PENDING)
  failureReason String?
  model                String?
  modelSubstitutedFrom String?
  route                String?
  // 039 D14: soft delete (CURATED only; CHECK DraftCaption_general_not_deleted).
  deletedAt     DateTime?
  // 039 D4/D15: the one-step undo snapshot (src/lib/captions/undo.ts).
  previous      Json?
  // 039 D4: hash of the general caption a CURATED row was written from; null = none.
  generalHash   String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @default(now()) @updatedAt

  // Uniqueness is two PARTIAL unique indexes, which Prisma does not model
  // (migration 20261102120000_caption_kind; precedent: Team_name_active_key):
  //   DraftCaption_draftId_general_key         ("draftId")            WHERE kind = 'GENERAL'
  //   DraftCaption_draftId_channel_curated_key ("draftId","channel")  WHERE kind = 'CURATED'
  // Lookups use findFirst({ draftId, kind, channel }), never findUnique.
  @@index([draftId])
}
```

**`20261102120000_caption_kind/migration.sql`** (T1):

```sql
-- 039 D1-D4: the caption kind. Additive; existing rows become CURATED.
CREATE TYPE "CaptionKind" AS ENUM ('GENERAL', 'CURATED');

ALTER TABLE "DraftCaption"
  ADD COLUMN "kind" "CaptionKind" NOT NULL DEFAULT 'CURATED',
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "previous" JSONB,
  ADD COLUMN "generalHash" TEXT,
  ALTER COLUMN "channel" DROP NOT NULL;
-- The default only backfilled the existing rows; every writer names the kind.
ALTER TABLE "DraftCaption" ALTER COLUMN "kind" DROP DEFAULT;

DROP INDEX "DraftCaption_draftId_channel_key";
CREATE UNIQUE INDEX "DraftCaption_draftId_general_key"
  ON "DraftCaption"("draftId") WHERE "kind" = 'GENERAL';
CREATE UNIQUE INDEX "DraftCaption_draftId_channel_curated_key"
  ON "DraftCaption"("draftId", "channel") WHERE "kind" = 'CURATED';

ALTER TABLE "DraftCaption" ADD CONSTRAINT "DraftCaption_kind_channel"
  CHECK (("kind" = 'GENERAL' AND "channel" IS NULL) OR ("kind" = 'CURATED' AND "channel" IS NOT NULL));
ALTER TABLE "DraftCaption" ADD CONSTRAINT "DraftCaption_general_not_deleted"
  CHECK ("deletedAt" IS NULL OR "kind" = 'CURATED');
```

- Generate the base DDL with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`, then add the partial indexes and the CHECKs by hand.
- Check that `migrate diff --exit-code` from the scratch database exits 0. Prisma 5.22 ignores partial indexes and CHECKs, as it does for `Team_name_active_key` and `DraftCaption_failed_has_no_text`.
- If the diff is not 0 (Prisma reporting the partial indexes as drift), stop and report. The fallback is Postgres 16's `NULLS NOT DISTINCT` on a plain `@@unique([draftId, kind, channel])`. Either satisfies AC-01; the test fixes the behaviour, not the mechanism.

**`20261102130000_channel_facebook/migration.sql`** (T4):

```sql
-- 039 D5: alone in its migration (Postgres cannot use a new value in the same
-- transaction). IF NOT EXISTS: a rolled-back database keeps the value (D24).
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'FACEBOOK';
```

**`20261102140000_kit_website/migration.sql`** (T4): `ALTER TABLE "BrandKit" ADD COLUMN "website" TEXT;`

### The registry (D7, D8)

```ts
// src/lib/channels.ts (client-safe; type imports only)
import type { CaptionKind, Channel } from '@prisma/client'

export interface CaptionRules {
  words?: { min: number; max: number }
  hashtags: { min: number; max: number }
  hashtagsAtEnd?: true
  link: 'model-may-echo' | 'kit-website' // kit-website: code inserts it, the model writes none
}

export interface CaptionSpec {
  target: 'GENERAL' | Channel
  kind: CaptionKind
  channel: Channel | null
  label: string // 'General' | 'Instagram' | 'LinkedIn' | 'Facebook'
  jsonKey: string // 'general' | 'instagram' | 'linkedin' | 'facebook'
  hardLimit: number
  brief: string
  rules: CaptionRules
  normalise: (text: string) => string
}

export const CAPTION_REGISTRY = [
  GENERAL,
  INSTAGRAM,
  LINKEDIN,
  FACEBOOK,
] as const satisfies readonly CaptionSpec[]
export const GENERAL_CAPTION = CAPTION_REGISTRY[0]
export const CAPTION_CHANNELS = CAPTION_REGISTRY.filter((s) => s.kind === 'CURATED') // curatable channels
export const RETIRED_CHANNELS = ['WHATSAPP'] as const
export type CuratedChannel = (typeof CAPTION_CHANNELS)[number]['channel']
export type CaptionTarget = 'HEADLINE' | (typeof CAPTION_REGISTRY)[number]['target']
export type CaptionKey = (typeof CAPTION_REGISTRY)[number]['jsonKey']
export function captionSpec(target: Exclude<CaptionTarget, 'HEADLINE'>): CaptionSpec
export function targetOf(row: {
  kind: CaptionKind
  channel: Channel | null
}): Exclude<CaptionTarget, 'HEADLINE'> | null // null = retired
export function registryEnumMismatches(
  channelValues: readonly string[],
  registry: readonly CaptionSpec[],
  retired: readonly string[],
  kindValues: readonly string[],
): string[]
```

- `FACT_WHERE` (`src/lib/factsCheck/types.ts`) is built from `CAPTION_REGISTRY` as `['headline', ...targets] as const`. To keep `z.enum` typed, the registry targets are a literal tuple. A unit test proves equality, so the tuple cannot drift.
- `src/lib/factsCheck/types.ts` must stay pure and must not create a cycle. It imports the registry from `channels.ts`, which imports only types. That direction is safe.
- **T1 keeps Facebook out.** T1 adds `GENERAL` and keeps `INSTAGRAM` and `LINKEDIN`. T4 adds `FACEBOOK` to the registry and the enum together, so the guard holds at every commit.
- **T1 keeps `GENERATION_TARGETS` at `['HEADLINE', 'INSTAGRAM', 'LINKEDIN']`,** written out explicitly with a `039 T2 switches this` comment, so T1 changes no behaviour.

### Rules (D8, D9, D17)

```ts
// src/lib/captions/rules.ts (pure, client-safe)
export type RuleMiss =
  'words-under' | 'words-over' | 'hashtags-over' | 'hashtags-not-at-end' | 'link-missing'
export const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu
export const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi
export function findLinks(text: string): string[]
export function countHashtags(text: string): number
export function countWords(text: string): number // tokens with a letter or digit, minus hashtags and links
export function checkCaptionRules(
  spec: CaptionSpec,
  text: string,
  ctx: { website: string | null },
): { met: boolean; unmet: RuleMiss[] }
export function rulesPromptText(spec: CaptionSpec, ctx: { hasWebsite: boolean }): string
export function composeFacebookCaption(body: string, website: string | null): string
export function ruleMissText(
  spec: CaptionSpec,
  miss: RuleMiss,
  text: string,
  website: string | null,
): string
//   e.g. 'Facebook asks for 40 to 120 words. This has 131.'
```

- **`hashtags-not-at-end`:** a hashtag appears on any line but the last non-empty line.
- **`link-missing`:** the rule is `kit-website`, a website is set, and `text` does not contain it.
- **`composeFacebookCaption`:**
  1. Trim the body and split it into lines.
  2. If the last non-empty line consists only of hashtags, hold it aside.
  3. Join the rest, then add `\n${website}`, then `\n\n${hashtagLine}` if there is one.
  4. With no website, return the body unchanged.

### The caption store (D10–D15, D19)

```ts
export interface CaptionRow {
  kind: CaptionKind
  channel: Channel | null
  target: 'GENERAL' | Channel
  text: string
  status: CaptionStatus
  failureReason: string | null
  updatedAt: Date
  model: string | null
  modelSubstitutedFrom: string | null
  route: string | null
  deleted: boolean
  canUndo: boolean // parseCaptionSnapshot(previous) !== null
}
export interface DraftCaptions {
  general: CaptionRow | null
  curated: CaptionRow[]
} // registry order, retired left out

export function loadDraftCaptions(draftId, db?): Promise<DraftCaptions | null> // creates nothing (T2)
export function claimCaptionAction(
  draftId,
  targets,
  db?,
): Promise<{ claim: DraftClaim; created: CaptionTarget[] } | null>
export function settleCaptionAction(
  draftId,
  claim,
  targets,
  fields,
  stamp?,
  db?,
  postStyle?,
  extra?: { generalHash?: string | null; website?: string | null },
): Promise<SettleResult>
export function saveCaptionEdit(
  draftId,
  ref: CaptionRef,
  text,
  db?,
): Promise<'saved' | 'unchanged' | 'pending' | 'deleted' | 'missing'>
export function deleteCaption(
  draftId,
  channel: CuratedChannel,
  db?,
): Promise<'deleted' | 'removed' | 'pending' | 'missing'>
export function undoCaption(
  draftId,
  ref: CaptionRef,
  db?,
): Promise<'undone' | 'nothing' | 'pending' | 'changed' | 'missing'>
export type CaptionRef = { kind: 'GENERAL' } | { kind: 'CURATED'; channel: CuratedChannel }
```

- **Claim (T2 for `GENERAL`, T3 for curated).** Inside `db.$transaction`:
  1. Take the draft claim (`updateMany where pendingAction: null`), and return null on count 0.
  2. Read the target rows.
  3. `createMany({ data: missing.map(...PENDING), skipDuplicates: true })`.
  4. `updateMany` the targets to `PENDING`.
  5. Return `created`.

  The lock order is unchanged: the draft row, then the caption rows (`store.ts:259-265`).

- **Settle.** `settlePendingRows` selects `text`, `deletedAt`, the stamps and `generalHash`. `settleCaptionRow(row, field, stamp, extra)` adds the following on a validated field:
  - `previous: snapshotOf(row)` when `row.text !== '' || row.deletedAt !== null`;
  - `deletedAt: null`;
  - `generalHash: extra.generalHash ?? null` for a curated row;
  - for Facebook, the stored text is `composeFacebookCaption(field.text, extra.website)`.

  A failed field writes neither `previous` nor `generalHash` (A7).

- **Edit.** A `$transaction` reads the row and refuses `PENDING`, deleted or missing. It returns `unchanged` when the text is equal. Otherwise it runs `updateMany({ where: { id, status: { not: 'PENDING' }, updatedAt }, data: { text, status: 'READY', failureReason: null, previous: snapshotOf(row) } })`.
- **Delete.**
  - A row with text: `deletedAt: now()`, `previous: snapshotOf(row)`.
  - A row with no text: `delete`.
  - Both are guarded on status and `updatedAt`.
- **Undo.** Read the row and parse `previous`, returning `nothing` if it is null. Then write `{ text: prev.text, deletedAt: prev.deleted ? now() : null, status: 'READY', failureReason: null, model, modelSubstitutedFrom, route, generalHash, previous: snapshotOf(row) }`, guarded on `updatedAt` (otherwise `changed`).
- **Every success path** calls `refreshAfterWrite(draftId, db)`. The static guard in `captionWriters.test.ts` (AC-15) scans `store.ts`: for each `export async function`, if its body contains `draftCaption.` followed by `update`, `create` or `delete`, it must contain `refreshAfterWrite(`. `claimCaptionAction` is exempt by name, because it writes only `PENDING`, which the facts check skips. The exemption is listed in the test with its reason.

```ts
// src/lib/captions/undo.ts (pure)
export const captionSnapshotSchema = z
  .object({
    v: z.literal(1),
    text: z.string(),
    deleted: z.boolean(),
    model: z.string().nullable(),
    modelSubstitutedFrom: z.string().nullable(),
    route: z.string().nullable(),
    generalHash: z.string().nullable(),
  })
  .strict()
export function parseCaptionSnapshot(raw: unknown): CaptionSnapshot | null
export function snapshotOf(row): CaptionSnapshot
export function generalHashOf(text: string): string // sha256(text.trim()) hex, first 16 (node:crypto; server only)
```

`generalHashOf` uses `node:crypto`, so it lives in `src/lib/captions/generalHash.ts`, which is server-only. `undo.ts` stays client-safe.

### The caption model route (D12, D16)

```
POST /api/drafts/[id]/regenerate-copy   body: { kind:'GENERAL' } | { channel } | { headline:true }  (+ model)
  parseRegenerateBody → 400 on {} (Q2), unknown kind, non-curatable channel
  draft → canView (404) → canEditPost (403 NOT_AUTHOR) → status EXPORTED (409)
  captionLimiter.allow(user.userId)?  else 429 { code:'rate-limited' } + Retry-After      (T3)
  resolve: model (stamp tier from the row by target), provider, ctx = postContext(draft)
  general input (curate only): loaded.general READY, not deleted → text + generalHashOf(text)   (T3)
  { claim, created } = claimCaptionAction(draft.id, targets)   → null → 409
  trace.fields = { model, captionKind, channel?, captionOp: created.includes(t) ? 'create' : 'replace' }
  startDraftAction(..., run:
     briefInput = { ...buildBriefInput(draft.brief, ctx), generalCaption? }
     { fields, stamp } = writeCaptions(provider, briefInput, targets, model)
     settleCaptionAction(..., fields, stamp, undefined, postStyle?, { generalHash, website: ctx.kit?.website ?? null })
  ) → 202
```

- `captionLimiter = createWindowLimiter(CAPTION_ACTIONS_PER_WINDOW, CAPTION_WINDOW_MS)` lives in `src/lib/captions/limits.ts`. Under `MOCK_AI` it reads the override that `POST /api/test/caption-limit` sets: `globalThis.__captionLimitOverride`, a number or undefined. That keeps one value across Turbopack module instances, as `mockGenFailedOnce` does at `testHooks.ts:103-110`. With no override under `MOCK_AI`, the limit is skipped.
- `src/lib/api/windowLimiter.ts` is `createWindowLimiter(limit, windowMs) => { allow(key, now?), reset(), retryAfterMs(key, now?) }`. `src/lib/analytics/rateLimit.ts` keeps its exports (`allow`, `resetRateLimit`, `EVENTS_PER_WINDOW`, `WINDOW_MS`) on top of one instance.

### Delete and undo routes (D14, D15)

```
DELETE /api/drafts/[id]/captions?channel=INSTAGRAM          withTeamAuth + canView(404) + canEditPost(403)
  channel missing/not curatable → 400; 'GENERAL' as channel or ?kind=GENERAL → 400 general-not-deletable
  deleteCaption → 'pending' 409 | 'missing' 404 caption-not-found | ok → 200 <draft GET body>
POST   /api/drafts/[id]/captions/undo   { kind:'GENERAL' } | { channel }   same tiers
  undoCaption → 'nothing' 409 nothing-to-undo | 'pending' 409 | 'changed' 409 changed | 'missing' 404 | ok → 200 <draft GET body>
```

- Both routes reuse `loadDraft` from `src/app/api/drafts/[id]/route.ts`. It is not exported from a route module, because a Next route module may export only its handlers. `loadDraft` moves to `src/lib/drafts/detail.ts`, and the route imports it back. `visibilityBoundary.test.ts`'s allow-list and import rules apply.
- The request bodies are parsed in `src/lib/captions/requests.ts`, beside `parseCaptionPatch`.

### Prompts (D18)

`buildCaptionPrompt(brief, targets)`:

- **The bullets.** For each requested registry entry: `- "<jsonKey>" (<label>): <brief> <rulesPromptText(spec, { hasWebsite: !!brief.kitWebsite })>`. The headline bullet is unchanged.
- **A curate** (no `GENERAL` among the targets, and `brief.generalCaption` set) adds, after the rules block:

  ```
  General caption for this post (keep its facts, offers and dates; adapt it to the channel):
  <fenceUntrusted(brief.generalCaption)>
  ```

- **The task line:** "Write the general caption for the post" for generation, and "Write a caption for `<label>`" for a curate.
- **Facebook's lines** with a website: "End with one call to action sentence that sends readers to the website. The app adds the link after it. Do not write any URL, domain or link placeholder." Without one: "End with one call to action sentence. Do not write any URL or domain."
- **`BriefInput`** gains `generalCaption?` and `kitWebsite?` (a boolean would do, but the prompt says only whether a link follows). It loses `channels`.
- **`captionMaxTokens(targets)`** = `512 + Σ(HEADLINE → HEADLINE_MAX; entry → spec.hardLimit)`. `CAPTION_MAX_TOKENS` is deleted, and the Anthropic and OpenAI providers call the function.

### Facts check (D19)

- `refreshFactsCheck` builds `texts` from `loaded.general` and then `loaded.curated`, each when `READY`, with text, and not deleted. `where` is `row.target`. `checkTexts` in `generateDraft.ts` (sync path) does the same over the reply's fields.
- `captionFactsFor(check, target)` returns `{ status: 'clear' | 'flagged' | 'error'; flagged: { kind; value }[] } | null` in `factsCheckNotice.ts`. The UI card and `externalCaptions` both use it.
- `WHERE_LABEL` becomes `Record<FactWhere, string>`, built from the registry (`headline`, then `general caption`, `Instagram caption` and so on). The type makes it total.

### Draft GET and the caption desk (FR-15, FR-16)

- `loadDraft` returns `captions: [general?, ...curated]`. Each item is the FR-15 shape, with:
  - `rules`, from `checkCaptionRules(spec, text, { website: ctx.kit?.website ?? null })`;
  - `facts`, from `captionFactsFor`;
  - `kitWebsite: ctx.kit?.website ?? null`.

  `ctx` is already in the `Promise.all` (`route.ts:162-197`), so no query is added.

- **The `CaptionPanels` layout:**

  ```
  i. Captions                                   [Regenerating…]
  ── Headline (HeadlinePanel, unchanged)
  ── General caption (CaptionPanel kind=GENERAL)  | or "Generate general caption" (old post, canEdit)
  ── Curated captions
       [flagged-general line, when captionFactsFor(check,'GENERAL').status === 'flagged']
       [Curate for Instagram] [Curate for LinkedIn] [Curate for Facebook]   (live rows hide their button; canEdit only)
       [no-website line under Facebook, when !kitWebsite]
       CaptionPanel per curated row (live: Copy · Regenerate · Delete · Undo?; deleted: "Deleted" · Undo)
  ```

- **`CaptionPanel`:**
  - It takes `caption` (the FR-15 item) and `onDelete`/`onUndo`.
  - Its heading is `${label} caption` ("General caption", "Instagram caption", and so on). The existing aria-labels follow.
  - Under the field, the rules line (`ruleMissText`) and the facts line, each a muted `Notice`.
  - Undo calls the server route. The `useUndoableAction` caption snapshot is removed, and with it `CaptionUndoHandle`'s capture and arm, which only "Regenerate all" used.
- **Copy:** `navigator.clipboard.writeText(value)`, then `sendCaptionCopied(draftId, caption.kind, caption.channel)` (T5).
- Read `docs/ui-reference/DESIGN_SYSTEM.md` §8 (the caption desk) and §12 (words) before building.

### MCP and ACP (D20)

```ts
// src/lib/captions/external.ts (pure)
export interface ExternalCaption {
  kind: CaptionKind
  channel: Channel | null
  text: string
  status: CaptionStatus
  facts: {
    status: 'clear' | 'flagged' | 'error'
    flagged: { kind: string; value: string }[]
  } | null
  rules: { met: boolean; unmet: RuleMiss[] }
}
export function externalCaptions(
  loaded: DraftCaptions | null,
  check: FactsCheck | null,
  website: string | null,
): ExternalCaption[]
//   general (if any) then curated, deleted rows dropped
```

- `generatePost` and `getDraft` (`src/mcp/tools/generate.ts:141-201`) call it. `getDraft` selects `generationInputs` and `brief` and builds `postContext(draft)` for the website. It is the API key's team, as today.
- `AGENT_MANIFEST.output.captions.items`: `required: ['kind', 'channel', 'text', 'status', 'facts', 'rules']`.
  - `kind: { enum: Object.values(CaptionKind) }`;
  - `channel: { type: ['string', 'null'], enum: [...CAPTION_CHANNELS.map(s => s.channel), null] }`;
  - `facts` and `rules` objects.

  The description reads: "The general caption first, then any curated captions made in the app. A post made before 039 may have no general caption. Treat facts.status flagged or error as needing review."

- The input schemas drop `channels`. `validateGenerateInput` drops its `channels` rule. `generatePost` drops its `channels` code and its `brief.create` field.

### Events (D22) and Insights (D23)

```ts
// catalogue.ts
'draft_action.settled': { schemaVersion: 1, ... schema: z.object({ ...,
   captionKind: z.nativeEnum(CaptionKind).optional(),            // 039, additive
   captionOp: z.enum(['create', 'replace']).optional(),          // 039, additive
}) }
'caption.copied': {
  schemaVersion: 1, source: ['web'], outcomes: [],
  schema: z.object({ kind: z.nativeEnum(CaptionKind), channel: z.nativeEnum(Channel).nullable() })
    .refine((p) => isRegistryRef(p.kind, p.channel)),             // a registry entry, retired channels refused
}
export const CLIENT_EVENTS = ['wizard.step', 'caption.copied'] as const
```

- **`POST /api/events`** becomes a small per-name dispatcher:
  - `wizard.step` keeps its `briefDraftId` ownership check.
  - `caption.copied` reads the body's top-level `draftId` (a string of at most 64 characters).
    1. It loads `prisma.draft.findUnique({ where: { id }, select: { teamId } })` and checks `canView` (404 otherwise), importing `@/lib/authz/visibility` for the boundary test.
    2. It applies the dedupe window `createWindowLimiter(1, 10_000)`, keyed `${userId}|${draftId}|${kind}|${channel}`. On refusal it runs `count('dropped', name, 'rate-limit')` and answers 204.
    3. It calls `track('caption.copied', { source: 'web', teamId, userId, draftId, payload: { kind, channel } })`.

    The existing 60-per-minute window applies first, to both events.
- **The client sender** in `client.ts`, `sendCaptionCopied(draftId, kind, channel)`, is fire-and-forget like `sendWizardStep`, with no catalogue import.
- **`captions({ from, to })`** in `queries.ts`:
  - **Written and failed:** `draft_action.settled` with `action = 'REGENERATE_COPY'`, grouped by `captionKind` and `channel`, plus `generation.finished ok` counted as general written.
  - **Copied:** `caption.copied`, grouped by `kind` and `channel`.
  - **Downloads:** `draft.downloaded`, by outcome.
  - **The curate rate:** distinct `draftId` with `captionKind = 'CURATED'`, `captionOp = 'create'` and `ok`, divided by `generation.finished ok`.
- **`shapeCaptions(rows)`** orders by `CAPTION_REGISTRY`.
- **`CaptionsSection`** is an `InsightSection` with the question "Which captions are written and copied?". It has a `DataTable` with the columns Caption, Written, Failed and "Copied (client-reported)", then the downloads and curate-rate lines.

### The down script (D24)

```sql
-- prisma/rollback/039-general-and-curated-captions.down.sql
-- Reverses 20261102140000_kit_website, 20261102130000_channel_facebook and
-- 20261102120000_caption_kind, in that order, in one transaction. FAILS CLOSED:
-- it refuses while any general caption, Facebook caption, deleted caption or kit
-- website exists, unless the session sets app.allow_caption_loss = on, and then
-- it DELETES them. Take a pg_dump first. 'FACEBOOK' stays in the Channel type
-- (Postgres cannot drop an enum value; harmless to the previous image, as 031 §A).
--
--   pg_dump -Fc -U bistec -d <db> > pre-039-rollback.dump
--   docker exec -i ai-studio-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     -c "SET app.allow_caption_loss = 'on'" -f - < prisma/rollback/039-general-and-curated-captions.down.sql
BEGIN;
DO $$
DECLARE g int; f int; d int; w int := 0;
BEGIN
  SELECT count(*) INTO g FROM "DraftCaption" WHERE "kind"::text = 'GENERAL';
  SELECT count(*) INTO f FROM "DraftCaption" WHERE "channel"::text = 'FACEBOOK';
  SELECT count(*) INTO d FROM "DraftCaption" WHERE "deletedAt" IS NOT NULL;
  IF to_regclass('"BrandKit"') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name = 'BrandKit' AND column_name = 'website') THEN
    EXECUTE 'SELECT count(*) FROM "BrandKit" WHERE "website" IS NOT NULL' INTO w;
  END IF;
  IF g + f + d + w > 0 AND coalesce(current_setting('app.allow_caption_loss', true), '') <> 'on' THEN
    RAISE EXCEPTION '039 rollback refused: % general captions, % Facebook captions, % deleted captions, % brand kits with a website. Set app.allow_caption_loss = on to delete them (see the header).', g, f, d, w;
  END IF;
END $$;
-- §A kit_website
ALTER TABLE "BrandKit" DROP COLUMN IF EXISTS "website";
-- §B channel_facebook (the value stays)
DELETE FROM "DraftCaption" WHERE "channel"::text = 'FACEBOOK';
-- §C caption_kind
DELETE FROM "DraftCaption" WHERE "kind" = 'GENERAL' OR "deletedAt" IS NOT NULL;
ALTER TABLE "DraftCaption" DROP CONSTRAINT "DraftCaption_general_not_deleted",
  DROP CONSTRAINT "DraftCaption_kind_channel";
DROP INDEX "DraftCaption_draftId_general_key";
DROP INDEX "DraftCaption_draftId_channel_curated_key";
ALTER TABLE "DraftCaption" DROP COLUMN "kind", DROP COLUMN "deletedAt", DROP COLUMN "previous",
  DROP COLUMN "generalHash", ALTER COLUMN "channel" SET NOT NULL;
CREATE UNIQUE INDEX "DraftCaption_draftId_channel_key" ON "DraftCaption"("draftId", "channel");
DROP TYPE "CaptionKind";
DELETE FROM "_prisma_migrations" WHERE "migration_name" IN
  ('20261102140000_kit_website', '20261102130000_channel_facebook', '20261102120000_caption_kind');
COMMIT;
```

- T1 writes §C, with the precondition counting general and deleted rows, and Facebook as text. T4 adds §A, §B and the website count.
- The script must run on a database that has only T1's migration, so the website count is guarded by the `information_schema` check. `DROP COLUMN IF EXISTS` covers the same case.

### Upgrade-path scenario 6 (AC-01, AC-25, AC-26)

`scripts/test-upgrade-path.mjs` gains:

- `PRE_039 = '20261101130000_drop_campaigns'`;
- `GUARD_039_PREFIX = '039 rollback refused:'`;
- `DOWN_039 = 'prisma/rollback/039-general-and-curated-captions.down.sql'`;
- `runDbExecute(file)`, which runs `runPrisma(['db', 'execute', '--file', file, '--url', SCRATCH_URL])`.

The scenario:

1. Deploy up to `PRE_039`. Seed the following with raw SQL: a team, a user, a brief, a draft, and three caption rows (`INSTAGRAM` `READY` 'IG text', `LINKEDIN` `FAILED` '', `WHATSAPP` `READY` 'WA text').
2. Deploy head. Run the AC-01 checks:
   - each constraint violation is asserted by its SQLSTATE through `$executeRawUnsafe` inside try/catch;
   - the head client reads the rows (`draftCaption.findMany`);
   - `migrate diff --exit-code` exits 0.
3. Insert a `GENERAL` row and a `FACEBOOK` row, and set a kit website (T4; in T1 only the general row).
4. Run `runDbExecute(DOWN_039)`. Expect a non-zero exit with the prefix and the counts, and every row and column unchanged.
5. Write a temporary copy that starts `SET app.allow_caption_loss = 'on';`. Run it, expect exit 0, and run the AC-25 checks.
6. Deploy head again, and run `migrate diff --exit-code`.

Scenario 1 and scenario 5 deploy head as before. Scenario 1's seed rows gain nothing, and its existing caption assertions read through raw SQL (check that they still hold with `kind`).

### Module map

| Today                                                                    | After 039                                                                                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/channels.ts`: the publish-era registry (Instagram, LinkedIn)    | `CAPTION_REGISTRY` (general and the curated channels), the derived types, `registryEnumMismatches`, `RETIRED_CHANNELS`; the publish names are deleted |
| `src/lib/captions/store.ts`: keyed by channel, fills missing rows        | keyed by `(kind, channel)`; creates rows only in the claim; adds `deleteCaption` and `undoCaption`; saves `previous`                                  |
| —                                                                        | New: `src/lib/captions/rules.ts`, `undo.ts`, `generalHash.ts`, `external.ts` and `limits.ts`                                                          |
| `src/lib/analytics/rateLimit.ts`: one window                             | On top of the new `src/lib/api/windowLimiter.ts`                                                                                                      |
| `src/app/api/drafts/[id]/route.ts`: `loadDraft` inline                   | `loadDraft` moves to `src/lib/drafts/detail.ts`; the route imports it                                                                                 |
| —                                                                        | New: `src/app/api/drafts/[id]/captions/route.ts` (`DELETE`) and `captions/undo/route.ts` (`POST`)                                                     |
| —                                                                        | New: `src/app/api/test/caption-limit/route.ts` (`MOCK_AI`, admin)                                                                                     |
| —                                                                        | New: `src/lib/brandkit/website.ts` (`parseKitWebsite`)                                                                                                |
| `src/components/drafts/CaptionPanels.tsx`: Regenerate all and two panels | The headline, the general panel or "Generate general caption", and the curated section                                                                |

## Key decisions

All of these are in `spec.md`. These carry the most structural weight:

| Decision                                                                                       | Why                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two partial unique indexes, not a plain unique on three columns (D1)                           | A NULL channel makes a plain unique key admit two general captions. The repo already ships a partial unique index that passes `migrate diff`. `NULLS NOT DISTINCT` is the named fallback.                             |
| Curate is the existing caption route and claim (D12)                                           | One model route means one tier entry, one rate limit, one settle with A7, and one analytics emitter. A new `DraftAction` would need its own migration, coverage entry and stale-sweep handling, for no new behaviour. |
| Undo is a snapshot column that swaps (D15)                                                     | `DraftRevision` holds designs, not captions. A per-caption snapshot is one JSON column that keeps three operations recoverable. A swap means an undo never destroys text.                                             |
| Rules are registry data, checked when the draft is read (D8, D9)                               | One entry feeds the prompt and the check. Read-time state needs no column, and an edit clears it at once. Only the security rule, the model's link, is enforced at write.                                             |
| The general caption is fenced in the curate prompt; sources never include a caption (D18, D19) | The general caption is model output or a user's edit. Fencing it keeps it data, and keeping it out of the sources stops the model's output from grading the model's next output.                                      |
| T1 changes no behaviour (approach)                                                             | The migration and the store's re-keying are the risk areas the proposal names. Landing them alone makes a failing E2E run after T2 attributable to the contract switch.                                               |
| 2.2.0 (D20)                                                                                    | 2.x has never shipped, and 038 D13 set the rule: a minor bump. The list is open, so later kinds and fields are additive.                                                                                              |

## Risks

| Risk                                                                                  | Mitigation                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prisma reports the partial indexes as drift                                           | T1 runs `test:upgrade` (scenario 6 ends in `migrate diff --exit-code`) before committing. The fallback is in design §Identity.                                                                         |
| The T2 contract switch leaves stale E2E assertions on `INSTAGRAM` and `LINKEDIN` rows | The T2 file list names every suite with a hit (the count is from `grep -c "INSTAGRAM\|LINKEDIN\|captions\["`). The task rules require a grep of `tests/` before finishing, and T6 runs the full suite. |
| `draftId_channel` lookups in E2E stop compiling at T1                                 | T1 rewrites the six lookups (`captions.test.ts:183,209,500,521`, `model-selection.test.ts:350,389,1049,1149`) to `findFirstOrThrow({ where: { draftId, kind: 'CURATED', channel } })`.                 |
| The caption rate limit flakes the mock run                                            | Under `MOCK_AI` with no override, the limit does not apply. Only TC-CUR-06 sets one, and it clears it in `finally`.                                                                                    |
| A writer skips the facts recompute                                                    | The static guard and its failing fixture (AC-15).                                                                                                                                                      |
| An implementer meets a guard AC with a weaker test (038 L36)                          | Every guard AC names its failing fixture in **bold**. The per-task review checks that the fixture exists and fails.                                                                                    |
| Unit mocks ripple (038 L35)                                                           | Each task's file list names the known unit suites that mock `loadDraftCaptions`, `claimCaptionAction` or the caption row shape. The rule: grep `tests/unit` for every changed export.                  |
| An orphaned `next start-server.js` serves 500s after `rm -rf .next` (038 L37)         | The task rules: kill the start-server process tree after every E2E run and confirm none remains.                                                                                                       |
| The Facebook body format drifts in a real model                                       | `composeFacebookCaption` places the link without trusting the body's layout. The extractor refuses a model link. The words and hashtags rules only notify.                                             |
| The local `ai_studio` database                                                        | The migrations are additive. No task runs `npm run db:migrate` on it.                                                                                                                                  |

## Grounding sources

- `CLAUDE.md`, the working rules:
  - "One task at a time: an implementer subagent does it, `specclaw:code-reviewer` reviews it, and the orchestrator runs tsc, lint and unit and commits." This is NFR-04.
  - "No real model calls in gates." This is NFR-01.
  - "A `page.waitForResponse` must be created before the action that triggers the request."
- `.specclaw/learnings.md` L35 (unit-mock ripples), L36 (weaker guard tests) and L37 (orphaned start-server). They are built into `tasks.md`.
- `prisma/migrations/20260726120000_team_name_unique_active/migration.sql:13`: the partial unique index precedent.
- `scripts/test-upgrade-path.mjs:568-655`: scenario 5's structure, which scenario 6 copies (seed with raw SQL, refused deploy, recovery, head checks, diff).
- `src/lib/captions/store.ts:200-221`, `:259-321`: the claim and the settle that curate reuses.
- `src/app/api/drafts/[id]/regenerate-copy/route.ts:47-178`: the route flow D12 extends.
- `src/components/drafts/CaptionPanels.tsx:43-122` and `CaptionPanel.tsx:51-160`: the "Regenerate all" and client Undo machinery that is removed.
- `src/mcp/tools/generate.ts:160-201`: `factsCheckResult` and `captionList`, which `externalCaptions` replaces.
- `src/app/api/events/route.ts:42-85`: the client-event route that `caption.copied` joins.
- `src/lib/analytics/rateLimit.ts:1-27`: the limiter that the factory generalises.
- `src/lib/testHooks.ts:31-101`: the mock caption reply that FR-21 extends.
