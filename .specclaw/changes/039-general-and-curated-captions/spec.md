# Spec: One general caption, curated channel captions on demand

**Change:** 039-general-and-curated-captions
**Created:** 2026-11-01
**Size:** architectural
**Status:** 🟡 Draft

## Overview

Every new post gets its on-image headline and one platform-neutral **general caption**. Nothing else is written up front. Under the general caption, the author or a team admin can **curate** a caption for Instagram, LinkedIn or Facebook. Each is one model call, saved on the post next to the general caption, at most one per channel. Every caption can be copied. Every caption except the general one can also be deleted. Edit, regenerate and delete each keep one step of undo. Facebook is new: its call to action carries the brand kit's website, inserted by code.

The proposal (`proposal.md`) and its "Decisions after the party review (user, 2026-10-30)" are the source of truth for scope. This spec settles what the proposal and the party report left to the plan. Change 037 (VERIFIED PASS) removed publishing, so a caption is now something to copy, not something to post. Change 038 (VERIFIED PASS) put every generation input behind `PostContext`, so a curated caption reads the same recorded briefing, kit and documents as the post.

**Definitions** (party-ba):

- **General caption:** the one platform-neutral caption every new post gets with its headline. It is plain text with no hashtags, at most 2,200 characters, so it can be pasted into any of the three channels unchanged.
- **Curated caption:** a caption written on request for one channel, by its own model call. It is written from the post's inputs (the brief, the kit voice, the post style and the project briefing) plus the post's general caption when the post has one. It is checked against that channel's rules in the caption registry.

## Decisions this plan makes

### Identity and data

- **D1. A caption row is identified by `(draftId, kind, channel)`.** This is the user's decision, made concrete.
  - New enum `CaptionKind { GENERAL, CURATED }`. New column `DraftCaption.kind`.
  - `DraftCaption.channel` becomes nullable. A `GENERAL` row has `channel = NULL`. A `CURATED` row has a channel. The CHECK `DraftCaption_kind_channel` enforces this.
  - Postgres treats NULLs as distinct in a plain unique key, so `(draftId, kind, channel)` cannot be one plain unique index. Uniqueness is two partial unique indexes:
    - `DraftCaption_draftId_general_key` on `("draftId") WHERE kind = 'GENERAL'`: at most one general caption per post;
    - `DraftCaption_draftId_channel_curated_key` on `("draftId", "channel") WHERE kind = 'CURATED'`: at most one curated caption per channel.
  - The old `DraftCaption_draftId_channel_key` is dropped. Prisma's `@@unique([draftId, channel])` goes with it. Prisma does not model partial indexes, so `schema.prisma` names them in a comment. The repo already does this: `Team_name_active_key ... WHERE "isDeleted" = false` (`prisma/migrations/20260726120000_team_name_unique_active/migration.sql:13`, explained at `prisma/schema.prisma:228-232`) passes `migrate diff --exit-code` in `npm run test:upgrade` scenarios 1 and 5.
  - **The key can grow** (party-visionary). A later language column joins both partial indexes, as `(draftId, language)` and `(draftId, channel, language)`. A new platform is a new `Channel` value. A new kind of caption that is not a platform is a new `CaptionKind` value, never a `Channel` value. `channels.ts` states this rule in a comment.
- **D2. The FAILED-row CHECK does not change.** `DraftCaption_failed_has_no_text` (`status <> 'FAILED' OR text = ''`, `prisma/migrations/20261011130000_draft_captions/migration.sql:32`) holds for both kinds. Two CHECKs are added:
  - `DraftCaption_kind_channel`: `(kind = 'GENERAL' AND channel IS NULL) OR (kind = 'CURATED' AND channel IS NOT NULL)`;
  - `DraftCaption_general_not_deleted`: `"deletedAt" IS NULL OR kind = 'CURATED'`. The general caption is never deleted (D14).
- **D3. Existing rows become `CURATED`.** The migration adds `kind` with `DEFAULT 'CURATED'`, which backfills every Instagram, LinkedIn and legacy WhatsApp row, and then drops the default. No `GENERAL` row is created for an existing post (D10).
- **D4. Undo and provenance columns.**
  - `DraftCaption.deletedAt TIMESTAMP(3) NULL`: soft delete (D14).
  - `DraftCaption.previous JSONB NULL`: the one-step undo snapshot, `{ v: 1, text, deleted, model, modelSubstitutedFrom, route, generalHash }`. It is validated by `parseCaptionSnapshot` in `src/lib/captions/undo.ts`, which is pure and returns null on anything unreadable.
  - `DraftCaption.generalHash TEXT NULL`: on a curated row, the first 16 hex characters of the SHA-256 of the general caption text the row was written from (party-visionary NOTE). Null means the row was not written from a general caption: a migrated row, or a curate on a post that has none. Nothing reads it in 039. A later "written from an older general caption" notice can use it.
- **D5. `Channel` gains `FACEBOOK` in its own migration. `Channel` keeps meaning "a platform".**
  - `20261102130000_channel_facebook` holds only `ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'FACEBOOK'`. `IF NOT EXISTS` lets a database that was rolled back (D24) deploy the migration again.
  - Once a row uses the value, the value is effectively one-way. Postgres cannot drop an enum value without rebuilding the type. The down script leaves the value in place, as 031 left `APPLY_TEXT` (`prisma/rollback/031-v2-final-polish.down.sql` §A).
- **D6. The brand kit gains `website`** (the user's decision): `BrandKit.website TEXT NULL`, in migration `20261102140000_kit_website`.
  - It must be an https URL. The rule is `parseKitWebsite` in `src/lib/brandkit/website.ts`, which is pure:
    - trim the value;
    - at most 2,048 characters;
    - `new URL()` parses it, with protocol `https:`;
    - no username or password;
    - the hostname contains a dot;
    - no whitespace.
  - The value is stored as the admin typed it, after the trim, so code inserts the exact link (D17).
  - Only a team admin sets it: `PATCH /api/admin/brandkits/[id]` is `withTeamAdmin`. `null` clears it.
  - The server never fetches it, so it adds no SSRF surface.
  - `ResolvedBrandKit` gains `website`, so a post's recorded kit (`PostContext.kit`, 038 D6) carries it.

### The registry

- **D7. One caption registry, `CAPTION_REGISTRY` in `src/lib/channels.ts`.** It holds an entry for `GENERAL`, then `INSTAGRAM`, `LINKEDIN` and `FACEBOOK`, in that order. Each entry has:
  - `target`: `'GENERAL'` or the `Channel`;
  - `kind`;
  - `channel` (null for general);
  - `label`;
  - `jsonKey` (`general`, `instagram`, `linkedin`, `facebook`);
  - `hardLimit`, in characters: a reply over it is refused, as today;
  - `brief`: the prompt wording;
  - `rules` (D8);
  - `normalise`.

  Everything else is derived, never written separately:
  - `CaptionTarget = 'HEADLINE' | 'GENERAL' | CuratedChannel`;
  - `CaptionKey`, the union of the `jsonKey` values;
  - `CAPTION_CHANNELS`, the curated entries, which now means "the channels a caption can be curated for" and no longer "the publish channels";
  - `FACT_WHERE = ['headline', ...registry targets]`, so stored flags with `INSTAGRAM` or `LINKEDIN` still parse (`src/lib/factsCheck/types.ts:12` is replaced);
  - the facts notice labels (`WHERE_LABEL`, `src/lib/drafts/factsCheckNotice.ts:11-15`);
  - the prompt's key list and its `max_tokens` (D18);
  - the request-body enums;
  - the MCP and ACP enum in the manifest.

  `PUBLISHABLE_CHANNELS`, `CHANNEL_VALUES` and `isPublishableChannel` are deleted: 037 removed publishing, and their last callers are `Brief.channels` writers (D21). `CHANNEL_LABELS` keeps `WHATSAPP` as a label only.

- **D8. Each entry's measurable rules live in the registry, and feed both the prompt and a pure check** (party-visionary NOTE, party-ba, party-architect).

  | Entry     | Hard limit (refused above) | Words     | Hashtags                      | Link                                                           |
  | --------- | -------------------------- | --------- | ----------------------------- | -------------------------------------------------------------- |
  | General   | 2,200 characters           | —         | 0                             | the model may echo one from the brief (today's rule)           |
  | Instagram | 2,200 characters           | —         | 0 to 30, all on the last line | as today                                                       |
  | LinkedIn  | 3,000 characters           | —         | 0 to 3                        | as today                                                       |
  | Facebook  | 2,000 characters           | 40 to 120 | 0 to 3                        | the kit website, inserted by code; the model writes none (D17) |
  - The Instagram and LinkedIn rows state today's rules as data. Before 039 they existed only as prose in `brief` (`src/lib/channels.ts:37,45`). The 2,200 and 3,000 limits are unchanged.
  - The general caption's 2,200 is Instagram's limit, the smallest of the three, so the general caption fits every channel.
  - Facebook's 2,000 leaves room for 120 words plus the link and hashtags. Facebook's own limit is far higher.
  - `src/lib/captions/rules.ts` is pure and client-safe. `rulesPromptText(entry, { hasWebsite })` renders an entry's rules as prompt lines. `checkCaptionRules(entry, text, { website })` returns `{ met, unmet }`, where `unmet` is a subset of `words-under`, `words-over`, `hashtags-over`, `hashtags-not-at-end` and `link-missing`.
  - Counting:
    - words are whitespace-separated tokens that hold a letter or a digit, not counting hashtags and links;
    - a hashtag is `#` followed by letters, digits or `_`, at the start or after whitespace;
    - a link is `https?://\S+` or `www\.\S+`.

- **D9. What a rule failure does.**
  - **Refused at write**, so nothing is stored, like any invalid field today (`src/lib/captions/extract.ts:105-116`):
    - an empty reply;
    - a reply over the hard limit;
    - for Facebook, a reply that contains a link (`link-in-reply`, D17).

    On a regenerate, the old text stays, with the reason noted (A7, `src/lib/captions/actionTargets.ts:87-90`). On a first curate, the row is `FAILED` with no text.

  - **Stored, with a notice**, for every other unmet rule (word range, hashtag count, hashtags not at the end, link missing).
    - The caption is kept, and its card shows one line, for example "Facebook asks for 40 to 120 words. This has 131."
    - The state is computed when the draft is read, from the text, the registry and the post's kit website. It is never stored, like 030's `headlineState`. So an edit clears it at once.
    - The notice never blocks Copy or Download.
    - The user can edit or regenerate.
    - No automatic retry is made, because a retry is a second paid call per click and the user is already looking at the caption.
  - The alternative, refusing an out-of-range Facebook caption, is Q3.
  - "A clear call to action" cannot be checked by code. It is a prompt instruction. What code guarantees is the link (D17). This is stated so nothing claims more (party-ba).

### Generation and old posts

- **D10. A new post gets a headline and a general caption, from one call.**
  - `GENERATION_TARGETS` becomes `['HEADLINE', 'GENERAL']`.
  - `createPendingDraft` creates one `GENERAL` row as `PENDING`.
  - Retry resets or creates that row.
  - Today one call writes the headline, Instagram and LinkedIn (`src/lib/agent/generateDraft.ts:365-370`). After 039 one call writes the headline and the general caption, so the call count is unchanged and the output is shorter (D27).
  - A general caption that fails leaves a `FAILED` row, and the post is still made. Only a missing headline fails a post (A6, `src/lib/captions/generate.ts:86-100`).
- **D11. A post made before 039 has no general caption. It is not backfilled.**
  - **Count.** Every post made before 039 is in this state. No database is deployed ("Nothing deploys yet", `CLAUDE.md`; the system starts fresh with no import). So the deployed count is 0. The user's local `ai_studio` (the Aloys data) is not yet at 038's head, and this plan does not count it, because no task reads that database. `ai_studio_test` is rebuilt by `npm run test:e2e:db -- --reset`.
  - **Behaviour.**
    - Its Instagram and LinkedIn rows show as curated captions (D3).
    - The page offers "Generate general caption" (edit tier) in place of the general caption. It runs the same path as regenerating the general caption (D12), which creates the row.
    - Curating on such a post runs without the general caption input, and stores `generalHash = null`. A migrated row has the same state, so one value has one meaning.
    - Refusing the curate was weighed and rejected: it would stop a regenerate of a migrated Instagram row that worked before 039.
  - **The one reader that hides the branch** (party-visionary): `loadDraftCaptions` returns `general: CaptionRow | null`. Every reader goes through it. The only branch in the UI is `CaptionPanels`.
  - **`get_draft`:** the caption list has no `GENERAL` entry. An absent entry means none, and the docs say so (D20).
  - A model backfill at migration time was rejected. It would be a model call per old post during deploy, against a count that is 0.

### Actions

- **D12. One model route for every caption: `POST /api/drafts/[id]/regenerate-copy`.** It is the existing edit-tier route, and its name is a kept contract.
  - The body is exactly one of the following, each with an optional `model` (008 FR-17):
    - `{ kind: 'GENERAL' }` regenerates the general caption, or creates it on an old post;
    - `{ channel }` curates that channel: it creates the curated row if none exists, and replaces it otherwise, including a deleted row;
    - `{ headline: true }` regenerates the headline, as today.
  - `{}` ("Regenerate all") is retired: 400 `Send { kind: 'GENERAL' }, { channel } or { headline: true }` (Q2).
  - The action is the existing claim `REGENERATE_COPY` (`src/lib/captions/store.ts:200-221`). No `DraftAction` value is added, so `DRAFT_ACTION_ROUTES` and the coverage test's `DraftAction` list are unchanged.
  - Inside the claim transaction, the target row is created if it is missing (`createMany` with `skipDuplicates`, which Postgres runs as `ON CONFLICT DO NOTHING` and which honours partial unique indexes), then marked `PENDING`. `captionOp` records `create` or `replace` (D25).
  - **One in flight.** The claim is draft-level (`pendingAction: null`), so at most one caption action runs per post. That is stricter than "one per post and channel". A second one gets 409.
  - **Replace only after a successful settle.** `settleCaptionRow` writes new text only when the field validated. A failure keeps the old text and notes the reason (A7). This is today's rule, and it now covers curate.
  - **A per-user rate limit** (D16) runs before the claim.
- **D13. Edit: `PATCH /api/drafts/[id]`.** It is the existing edit-tier route.
  - The body is `{ kind: 'GENERAL', text }`, `{ channel, text }` (curated), or `{ headline }`. `{ channel, text }` keeps its meaning, so existing callers stand.
  - It is refused in these cases:
    - the row is missing: 404 `caption-not-found`;
    - the row is `PENDING`: 409, as today;
    - the row is deleted: 409 `caption-deleted`.
  - It saves `previous` when the text changes.
- **D14. Delete: `DELETE /api/drafts/[id]/captions?channel=<CHANNEL>`** (new route file, edit tier).
  - It applies to curated captions only. `GENERAL` gets 400 `general-not-deletable`, because every post keeps its general caption.
  - A row that holds text is soft-deleted: `deletedAt` is set and `previous` saves the live state. A curated row with no text (a failed first curate) is removed outright, since there is nothing to undo.
  - It is refused in these cases:
    - the row is `PENDING`: 409;
    - the row is missing or already deleted: 404 `caption-not-found`.
  - A deleted caption is left out of the facts check, Copy, `get_draft` and the MCP/ACP output. The draft `GET` still returns it with `deleted: true` so its Undo shows.
- **D15. Undo: `POST /api/drafts/[id]/captions/undo`** (new route file, edit tier). The body is `{ kind: 'GENERAL' }` or `{ channel }`.
  - It swaps the live state and `previous`. A second Undo therefore returns the text the first one replaced, and no text is ever lost by an Undo.
  - It is refused in these cases:
    - nothing to undo: 409 `nothing-to-undo`;
    - the row is `PENDING`: 409;
    - the row changed since it was read: 409 `changed`, from a compare-and-set on `updatedAt`.
  - **Which writes save `previous`:** any write that changes the visible caption, meaning its text or whether it is deleted:
    - a successful regenerate or curate over text or over a deleted row;
    - an edit to different text;
    - a delete;
    - an undo.

    A write that changes nothing visible leaves `previous` alone: a failed regenerate, a first curate onto an empty row, or an edit to the same text.

  - The proposal's "the draft's history allows undo" is replaced by this. `DraftRevision` holds design snapshots, not captions (`prisma/schema.prisma`, `DraftRevision`). The user's decision on 2026-10-30 chose per-caption undo.
  - The client-side Undo of change 015 (`useUndoableAction` in `CaptionPanel.tsx:122-131`) is replaced for captions. The headline keeps its own.
- **D16. Who may act, and how often** (party-security).
  - Curate, regenerate, edit, delete and undo are **edit tier** (`canEditPost`: the author or a team admin, 038 D10). Copy and reading are view tier.
  - The two new route files get entries in `POST_ACTION_TIERS`. `postActionTiers.test.ts` already walks `src/app/api/drafts/**` and fails on a handler with no entry.
  - **Rate limit.** `regenerate-copy` admits at most `CAPTION_ACTIONS_PER_WINDOW = 30` caption actions per user per `CAPTION_WINDOW_MS = 600_000` (10 minutes).
    - The limiter is a factory, `createWindowLimiter(limit, windowMs)` in `src/lib/api/windowLimiter.ts`, extracted from the only existing limiter (`src/lib/analytics/rateLimit.ts:5-27`). `allow` for `/api/events` becomes one instance of it, with unchanged behaviour.
    - Over the limit, the answer is 429 `{ error, code: 'rate-limited' }` with `Retry-After`. Nothing is claimed and no model is called.
    - It is in-process, like the events limiter: one web instance, and a restart resets it.
    - Under `MOCK_AI` only, the seam `POST /api/test/caption-limit` (admin only, 404 otherwise) sets an override, or `null` to clear it. Under `MOCK_AI` with no override, the limit does not apply, so the roughly 50 caption calls in the full mock run cannot flake. The real constants are pinned by the unit test.

### Facebook

- **D17. The Facebook link comes only from `BrandKit.website` of the post's recorded kit, and code inserts it** (the user's decision on party-security's BLOCK).
  - The kit is `PostContext.kit`, read from `postContext(draft)`, as every caption writer does since 038.
  - The prompt tells the model to end with one call-to-action sentence and to write no URL, domain or link placeholder. With a website, it adds "the app adds the link after it". Without one, it does not.
  - The extractor refuses a Facebook reply that contains a link (`link-in-reply`). The model never supplies a link that reaches the Copy button.
  - `composeFacebookCaption(body, website)` (pure, `rules.ts`) puts `website` on its own line after the last line that is not a hashtag line, and before the hashtag line, if any. With no website it returns the body unchanged.
  - A kit with no website gives a call to action with no link. The Facebook card, and the "Curate for Facebook" button before a curate, show: "This brand kit has no website, so the call to action has no link. A team admin can add one in Brand kits."
  - A link-shaped token without a scheme or `www.` (for example `acme.com`) is not detected. That is limit L1. Whether the facts check should also flag links in other captions is Q1.

### Facts check

- **D18. Prompts.**
  - The generation prompt asks for `headline` and `general`. Each target's lines come from `rulesPromptText`.
  - A curate prompt asks for one channel's key. It carries the general caption, when there is one, inside `fenceUntrusted` (`src/lib/agent/untrusted.ts:20`), because the general caption is model output or a user's edit. The heading is "General caption for this post (keep its facts, offers and dates; adapt it to the channel)".
  - `BriefInput` gains `generalCaption?: string` and loses `channels` (D21).
  - `max_tokens` becomes `captionMaxTokens(targets)` = 512 + the sum, over the targets, of `HEADLINE_MAX` for the headline and `hardLimit` for each entry. The budget stays one token per character, for non-Latin scripts. It replaces the constant `CAPTION_MAX_TOKENS = 8192` (`src/lib/agent/prompts/caption.ts:24-26`). Generation gives 2,812, and a LinkedIn curate 3,512.
  - **Versions.** `CAPTION_PROMPT_VERSION_BASE` takes `2026-11-02.1` (T2: the general caption and the rendered rules), then `2026-11-02.2` (T3: the curate section), then `2026-11-02.3` (T4: Facebook). `PROMPT_VERSION_BASE` takes `2026-11-02.1` (T2), because the Path B prompt loses its "Channels:" line (D21). `generationUntouched.test.ts` pins both.
- **D19. The facts check runs over the headline, the general caption and every live curated caption. It recomputes on every write to the caption set.**
  - **One function.** `refreshAfterWrite` (`src/lib/captions/store.ts:89-96`) already wraps `refreshFactsCheck`. Every store writer that changes caption text or the deleted state calls it on success. The writers are:
    - `saveGenerationCaptions`;
    - `settleCaptionAction` (curate, regenerate, and the general backfill);
    - `saveCaptionEdit`;
    - `saveHeadlineEdit`;
    - `deleteCaption` (new);
    - `undoCaption` (new).

    The sync generation computes the check inside its own create, as today (`generateDraft.ts:372-397`). A static guard enforces it (AC-15).

  - **Sources are never a caption** (party-security). They stay as they are (`src/lib/factsCheck/sources.ts:15-27`): the brief's topic and description, the recorded project briefing, the kit voice prompt and the recorded project's documents.
    - So a value the model invented in the general caption and repeated in a curated caption is flagged in both.
    - `sources.ts` imports nothing from `@/lib/captions`, enforced by AC-16.
  - Texts read: the headline, the `GENERAL` row and the live `CURATED` rows in registry order, each `READY` with text. Deleted, `PENDING` and `FAILED` rows, and rows for retired channels (WhatsApp), are skipped.
  - **The flagged-general line.** When the stored check has a flag where `GENERAL`, the curate controls show one line above them: "The general caption has values your sources don't state. A curated caption written from it may repeat them."
  - Each card shows its own flagged values: `captionFactsFor(check, target)` in `factsCheckNotice.ts`.

### Contracts

- **D20. MCP and ACP `2.2.0`.** Both share one serializer, `externalCaptions` in `src/lib/captions/external.ts` (pure). The caption list is an open list:

  ```json
  "captions": [
    {
      "kind": "GENERAL",
      "channel": null,
      "text": "…",
      "status": "READY",
      "facts": { "status": "clear", "flagged": [] },
      "rules": { "met": true, "unmet": [] }
    },
    {
      "kind": "CURATED",
      "channel": "FACEBOOK",
      "text": "…",
      "status": "READY",
      "facts": { "status": "flagged", "flagged": [{ "kind": "cur", "value": "$49" }] },
      "rules": { "met": false, "unmet": ["words-over"] }
    }
  ]
  ```

  - **Order:** general first, then curated captions in registry order. Deleted captions and retired channels are left out.
  - **`facts`** is derived from the stored `Draft.factsCheck`:
    - `error` when the whole check is `error`;
    - `flagged` with this caption's flags;
    - `clear`;
    - `null` when the post was never checked.

    The draft-level `factsCheck` stays.

  - An old post has no `GENERAL` entry. A post from `generate_post` has exactly one entry, the general caption.
  - Later kinds, a language field or the route stamps are additive fields per entry.
  - **Where it is returned.** `get_draft` (MCP) and `generate_post`'s output (MCP and ACP) return this list. **ACP has no `get_draft`**: the capability list is `generate_post` only (`src/app/api/acp/run/route.ts:31-45`, `src/acp/agent.ts:14-102`), so "`get_draft` on ACP" in the proposal means `generate_post`'s output there. No ACP capability is added.
  - **Input.** `generate_post` drops `channels` from its schema and its `required` list. A caller that still sends it is not refused: the value is ignored (D21).
  - **Version.** The minor bump, `2.1.0` → `2.2.0`, follows 038 D13's reasoning: 2.x has never been deployed, so no external client parses the old list. `docs/mcp-acp-guide.md` gives the shape, the old-post case, and "treat `flagged` and `error` as needing review".

- **D21. `Brief.channels` is deprecated. Nothing writes or reads it, and there is no migration** (the user's decision). Every surface:

  | Surface                                                                                                                              | Today                                                | After 039                                                                                          |
  | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
  | `src/components/brief/useBriefWizard.ts:649` and `constants.ts:10-12`                                                                | sends `DEFAULT_CHANNELS`; no picker exists since 037 | sends nothing; `DEFAULT_CHANNELS` is deleted                                                       |
  | `src/app/api/briefs/route.ts:104-118,337`                                                                                            | requires a non-empty list, and stores it             | ignores the key and stores nothing (the column is nullable with no default since `20260702110000`) |
  | `src/mcp/tools/generate.ts:64-69,117`; `src/mcp/server.ts:95,108`; `src/acp/agent.ts:20,38-42`; `src/app/api/acp/run/route.ts:88-90` | required, validated, stored                          | removed from the schemas and validation; ignored if sent                                           |
  | `scripts/seed-teams.mjs`                                                                                                             | writes it                                            | does not                                                                                           |
  | `src/app/(app)/drafts/[id]/page.tsx:421`                                                                                             | shows "Instagram, LinkedIn · 1:1"                    | shows the size only                                                                                |
  | `src/app/(app)/page.tsx:58,206`; `src/components/dashboard/RecentDraftsCard.tsx:45-47,155,202`                                       | the Channels column                                  | the column is removed                                                                              |
  | `src/app/api/drafts/[id]/route.ts:261`; `src/lib/api-types.ts:366`                                                                   | returns `brief.channels`                             | removed                                                                                            |
  | `src/lib/agent/briefInput.ts:111`; `src/providers/interfaces/CopyProvider.ts:13`                                                     | `BriefInput.channels`                                | removed                                                                                            |
  | `src/lib/agent/pathB.ts:227`; `src/lib/agent/prompts/pathB.ts:84,105,128`                                                            | the "Channels:" prompt line                          | removed; `PROMPT_VERSION_BASE` bumped (D18)                                                        |
  | `prisma/schema.prisma:396`                                                                                                           | `channels Channel[]`                                 | kept, with `/// Deprecated (039): ignored; no writer or reader. Never reuse.`                      |
  - The guard `tests/unit/briefChannelsDeprecated.test.ts` fails on a `src/` read or write (AC-07).
  - Ignoring the key, rather than refusing it as 038 refused `campaignId`, is deliberate. A refused `campaignId` would have silently lost a briefing. An ignored `channels` loses nothing, because it selected no output. About 40 E2E suites send it in their brief bodies, and they keep passing, which also proves "ignored".

### Events and Insights

- **D22. Events.** Each event has one emitter, and none carries text.
  - **A curated caption generated** is `draft_action.settled` (emitter: `startDraftAction`, `src/lib/drafts/draftActions.ts:135-139`), with two new optional fields, which is additive at `schemaVersion` 1 (the catalogue rule at `src/lib/analytics/catalogue.ts:7-9`):
    - `captionKind` (`z.nativeEnum(CaptionKind)`);
    - `captionOp` (`'create' | 'replace'`).

    `channel` already exists (`catalogue.ts:127-128`). A curate is therefore `{ action: 'REGENERATE_COPY', captionKind: 'CURATED', channel, captionOp }` with its outcome, model and tokens. No new event name is needed.

  - **A caption copied** is the new client event `caption.copied`, with payload `{ kind, channel }` (`channel` null for general) and the event's `draftId` column set.
    - Its one emitter is `POST /api/events`, which takes team, user and source from the session (`src/app/api/events/route.ts:42-85`).
    - The route checks that the draft is in the caller's team (404 otherwise, and nothing written).
    - It checks that `(kind, channel)` is a registry entry (400 otherwise).
    - It keeps at most one event per user, post and caption in 10 seconds. The excess is answered 204 and counted in `AnalyticsDrop` as `rate-limit`, as the events window already does.
    - The browser sends it with `sendCaptionCopied` in `src/lib/analytics/client.ts`, after a successful clipboard write.
  - **A post downloaded** stays 037's `draft.downloaded`. Its one emitter is `src/app/api/drafts/[id]/download/route.ts:51-71`. It does not change.
  - **Coverage.** `analyticsCoverage.test.ts` adds `CaptionKind` to the imported vocabularies: every value must be carried by an event. `FACEBOOK` is carried by `draft_action.settled.channel` and `caption.copied.channel`, through the imported enum.
  - Edit, delete and undo emit nothing. No question needs them yet (party-po).
- **D23. Insights gets one small "Captions" section, and no chart.**
  - The user's program decision for Insights (2026-10-28, `CLAUDE.md`) is "trimmed, plus caption, download and copy metrics". So the section is in scope, and party-po's "defer" is declined on that ground.
  - What makes it cheap: one query, one shape function and one table, over the existing range picker:
    - per caption (General, Instagram, LinkedIn, Facebook): written ok, failed, and copied;
    - one line for downloads (ok and failed);
    - one line for the **curate rate**: posts with a curated caption created ÷ posts generated.
  - Copies are labelled "client-reported" (party-security).
  - The proposal's "per day" chart is dropped (party-po).
  - **What would show the feature is not wanted** (party-ba NOTE): a curate rate below 10% over 30 days of use. It is a reading on this page, not an automated rule.

### Migration and rollback

- **D24. Three additive migrations, one down script that fails closed.**
  - The migrations:
    - `20261102120000_caption_kind` (T1): D1 to D4;
    - `20261102130000_channel_facebook` (T4): D5, alone;
    - `20261102140000_kit_website` (T4): D6.

    None destroys data, and none needs an operator step.

  - `prisma/rollback/039-general-and-curated-captions.down.sql` reverses all three, in reverse order, in one transaction.
    - It opens with a `DO` block. The block counts four things: `GENERAL` rows, `FACEBOOK` rows (compared as text, so the block works before the value exists), soft-deleted rows, and kits with a website.
    - If any count is non-zero and the session setting `app.allow_caption_loss` is not `on`, it raises `039 rollback refused: <n> general captions, <n> Facebook captions, <n> deleted captions, <n> brand kits with a website. Set app.allow_caption_loss = on to delete them (see the header).` Nothing else runs.
    - With the flag, it deletes those rows, then:
      - drops `BrandKit.website`;
      - removes the CHECKs, the partial indexes and the new columns;
      - sets `channel` back to `NOT NULL`;
      - recreates `DraftCaption_draftId_channel_key`;
      - drops `CaptionKind`;
      - deletes the three `_prisma_migrations` rows.
    - `FACEBOOK` stays in the type (D5).
    - The flag is passed as `psql -v ON_ERROR_STOP=1 -c "SET app.allow_caption_loss = 'on'" -f -`, which psql runs as one session in order. The header documents a `pg_dump` first.
  - The upgrade-path scenario 6 runs the script both ways (AC-25).

### Cost and slicing

- **D25. `captionOp`.** It is `create` when the target row did not exist before the claim (a curate, or a general caption on an old post). Otherwise it is `replace`. A re-curate of a deleted row is `replace`. It is computed in the claim transaction and carried on the action trace.
- **D26. Cheaper variant considered** (party-po).
  - The minimal variant was weighed: curate (which replaces on a re-run) plus Copy, with no separate edit, delete or regenerate.
    - Edit already exists for every caption (012), so keeping it costs nothing.
    - "Regenerate" is the same call as "curate" (D12). There is one route, one claim and one button whose label reads "Regenerate" once the caption exists. Regenerate adds no route.
    - Delete and Undo are what remain. They are what the user's decision on party-security's BLOCK requires: a hand edit must survive a regenerate, and a delete must be recoverable. Without them, the minimal variant moves the same unrecoverable overwrite onto curate.
  - So the variant actually saves only the delete route (one route file, about 4 E2E cases).
  - The user's 2026-10-30 decision keeps delete, so it stays.
- **D27. Cost per post** (party-po). These are estimates from the prompt structure, not measurements. Output from 039 on is measured by `draft_action.settled.inputTokens/outputTokens` and `generation.finished`.

  | Case                                                                                                     | Model calls                             | Input tokens (approx.) | Output tokens (approx.)                                              |
  | -------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
  | Today: generation (headline, Instagram, LinkedIn)                                                        | 1                                       | 0.5k to 4k             | 0.55k to 1k                                                          |
  | 039 default: generation (headline, general)                                                              | 1                                       | 0.5k to 4k             | 0.2k to 0.45k                                                        |
  | One curate                                                                                               | +1                                      | 0.8k to 4.3k           | Facebook 0.1k to 0.2k; Instagram 0.2k to 0.4k; LinkedIn 0.3k to 0.6k |
  | Heavy post: generation, 3 curates, 3 curated regenerates, 1 general regenerate and 1 headline regenerate | 9                                       | 7k to 39k              | 2k to 4k                                                             |
  | Hard bound per user                                                                                      | 30 caption actions per 10 minutes (D16) |                        |                                                                      |
  - Input is dominated by the kit voice prompt and the project briefing, which every caption call carries.
  - The default post is cheaper than today: the same single call, with one caption less of output.

- **D28. Cut line.**
  - Nothing deploys between commits, so 039 ships whole. The task order is still the cut line party-po asked for:
    - **T1 and T2 are slice 1:** the vocabulary, its migration, the general caption and the final `get_draft` shape;
    - **T3 and T4 are slice 2:** curation and Facebook.
  - The order also follows party-architect's coupling note: the vocabulary and the shape land with the general caption. Slice 2 is additive: it adds list entries and one enum value, and never changes the shape.
  - If the user stops after T2, the product is coherent: every post has a general caption, old curated rows are readable, and MCP/ACP are at 2.2.0.

## Requirements

### Functional Requirements

- **FR-01 (caption identity schema).**
  - Migration `20261102120000_caption_kind`, as in D1 to D4. `schema.prisma` gains:
    - `enum CaptionKind { GENERAL CURATED }`;
    - `DraftCaption.kind CaptionKind`;
    - `channel Channel?`;
    - `deletedAt DateTime?`;
    - `previous Json?`;
    - `generalHash String?`.
  - It loses `@@unique([draftId, channel])`. A comment names the two partial unique indexes and the two CHECKs.
  - Down script section C (D24).
- **FR-02 (registry).** `CAPTION_REGISTRY`, `GENERAL_CAPTION` and `CAPTION_CHANNELS` (curated), as in D7. `captionSpec(target)` looks up by target. `CaptionTarget`, `CaptionKey` and `FACT_WHERE` are derived. `PUBLISHABLE_CHANNELS`, `CHANNEL_VALUES` and `isPublishableChannel` are deleted, in T2, with their last callers. `RETIRED_CHANNELS = ['WHATSAPP']`.
- **FR-03 (registry guard).** The pure function `registryEnumMismatches(channelValues, registry, retired, kindValues)` in `src/lib/channels.ts` returns:
  - every `Channel` value that is neither a curated entry nor retired;
  - every curated entry whose channel is not a `Channel` value;
  - every `CaptionKind` value with no entry;
  - any `Channel` value equal to a kind name.

  `tests/unit/captionRegistryGuard.test.ts` asserts that it is empty for the real enums. Adding a channel is then one checklist the test enforces: the enum migration, the registry entry and its rules.

- **FR-04 (rules).** `src/lib/captions/rules.ts`, as in D8, D9 and D17: `rulesPromptText`, `checkCaptionRules`, `composeFacebookCaption`, `countWords`, `countHashtags` and `findLinks`. Pure and client-safe.
- **FR-05 (store).** In `src/lib/captions/store.ts`:
  - `loadDraftCaptions(draftId)` returns `{ general: CaptionRow | null, curated: CaptionRow[] }`, with curated rows in registry order and retired channels left out. Each `CaptionRow` gains `kind`, `target`, `deleted` and `canUndo`. It no longer creates missing rows.
  - `claimCaptionAction(draftId, targets)` creates missing target rows inside the claim transaction (D12) and returns `{ claim, created: CaptionTarget[] }`.
  - `settleCaptionAction` writes `previous`, `deletedAt = null` and `generalHash` (D4, D15).
  - `saveCaptionEdit(draftId, ref, text)` saves `previous`.
  - New: `deleteCaption(draftId, channel)` and `undoCaption(draftId, ref)`.
  - Every writer calls `refreshAfterWrite` on success (D19).
  - Every query names `kind`. A bulk write is scoped to registry targets.
- **FR-06 (generation).** As D10:
  - the async path, the sync path (MCP/ACP), retry (`src/app/api/drafts/[id]/retry/route.ts:44-58`) and the `generate/copy` preview use `GENERATION_TARGETS = ['HEADLINE', 'GENERAL']`;
  - the failure path fails only a `PENDING` `GENERAL` row;
  - the preview's response is `{ headline, captions: [{ kind, channel, text, status, failureReason }] }`.
- **FR-07 (old posts).** As D11. The page shows "Generate general caption" when `general` is null and the post is `EXPORTED`.
- **FR-08 (the caption model route).** `regenerate-copy`, as D12 and D16:
  - `parseRegenerateBody` takes `{ kind: 'GENERAL' }`, `{ channel }` or `{ headline: true }`, plus `model`;
  - `{}` is a 400 (Q2);
  - the rate limit applies, then the claim (which creates the row), then the settle (which saves `previous`);
  - a curate passes the general caption (READY and not deleted) and its hash;
  - the trace carries `captionKind`, `channel` and `captionOp`;
  - `regenerateStampTier` reads rows by `target`.
- **FR-09 (delete and undo).** New routes `src/app/api/drafts/[id]/captions/route.ts` (`DELETE`) and `src/app/api/drafts/[id]/captions/undo/route.ts` (`POST`), as D14 and D15. Each answers the refreshed draft body, the same as `PATCH` does.
- **FR-10 (tiers).** `POST_ACTION_TIERS` gains `'src/app/api/drafts/[id]/captions/route.ts DELETE': 'edit'` and `'src/app/api/drafts/[id]/captions/undo/route.ts POST': 'edit'`. `PATCH` and `regenerate-copy` stay `edit`.
- **FR-11 (prompts).** As D18. `buildCaptionPrompt(brief, targets)` renders each target's `brief` plus `rulesPromptText`, and the fenced general caption for a curate. The providers use `captionMaxTokens(targets)`.
- **FR-12 (facts check).** As D19: `FACT_WHERE` and the notice labels come from the registry; `refreshFactsCheck` reads the new loader shape; `captionFactsFor(check, target)`; the flagged-general line.
- **FR-13 (kit website).**
  - Migration `20261102140000_kit_website`.
  - `parseKitWebsite`.
  - `PATCH /api/admin/brandkits/[id]` takes `website` (an https string, or null). A bad value is 400 `website must be an https URL`.
  - `GET` returns it.
  - `ResolvedBrandKit.website` (`src/lib/brandkit/resolve.ts:9-21`).
  - `KitDetail` shows and edits it (admins only).
  - Down script section A.
- **FR-14 (Facebook).**
  - Migration `20261102130000_channel_facebook`.
  - The registry entry (D8).
  - The extractor's `link-in-reply` refusal.
  - `composeFacebookCaption`, run by the settle path on the validated field, with the website of the post's context kit.
  - The no-website line.
  - Down script section B.
- **FR-15 (the draft GET).** Each `captions` item is `{ kind, channel, target, label, text, status, failureReason, updatedAt, model, modelSubstitutedFrom, route, deleted, canUndo, rules, facts }`, general first. The draft gains `kitWebsite: string | null`, from the context kit already read, so the 4 s poll gets no new query (NFR-06). `brief.channels` goes.
- **FR-16 (the caption desk UI).** Read `docs/ui-reference/DESIGN_SYSTEM.md` §8 and §12 first.
  - **The general caption panel ("General caption").** It has Copy, inline edit, Regenerate and its model picker, and Undo when `canUndo`. Its rules and facts lines sit under the field.
  - **Below it, "Curated captions".**
    - The flagged-general line (D19).
    - One button per channel with no live row, "Curate for Instagram", "Curate for LinkedIn" and "Curate for Facebook", with the Facebook no-website line.
    - A card per curated row. A live card has Copy, edit, Regenerate, its model picker, Delete, and Undo when `canUndo`, plus its rules and facts lines. A deleted card shows "Deleted" and Undo.
  - "Generate general caption" on an old post (FR-07).
  - "Regenerate all" and its model picker go (Q2).
  - A viewer who cannot edit sees the text and Copy only (038 D21).
  - Copy calls `sendCaptionCopied`.
  - The token and wording guards hold. §12 gains "General caption", "Curated caption" and "Curate for `<channel>`".
- **FR-17 (`Brief.channels`).** As D21, with the guard.
- **FR-18 (MCP and ACP).** As D20:
  - `externalCaptions`;
  - `generatePost` and `getDraft` use it;
  - the manifest's output schema matches it (`mcpGetDraft.test.ts`'s key-set drift check);
  - `channels` is removed from the inputs;
  - `2.2.0` in `src/acp/agent.ts:13` and `src/mcp/server.ts:16`;
  - the descriptions say "the general caption, plus any curated captions made in the app".
- **FR-19 (events).** As D22: the `draft_action.settled` fields; `caption.copied` in `CATALOGUE` and `CLIENT_EVENTS`; the events route's per-event checks; `sendCaptionCopied`; the coverage test.
- **FR-20 (Insights).** As D23: `captions(range)` in `src/lib/analytics/queries.ts`, `shapeCaptions`, and `CaptionsSection` in `src/components/admin/insights/sections.tsx`.
- **FR-21 (mock seams; all dormant in prod, `src/lib/testHooks.ts`).**
  - `buildMockCaptionReply(topic, targets, { hasGeneral })` answers `general` and each curated key.
  - Every mock curated caption contains `[from general]` when the prompt carried a general caption.
  - The default mock Facebook body is 50 words with 2 hashtags and no link, so it meets every rule.
  - Sentinels:
    - `__DROP_CAPTION_GENERAL__` drops `general` from a generation reply only, replacing the Instagram and LinkedIn drop sentinels;
    - `__FAIL_CURATED__` omits every curated key in any reply;
    - `__MOCK_CURATE_LINK__` puts `https://example.invalid/x` in the Facebook body;
    - `__MOCK_CURATE_SHORT__` makes a 12-word Facebook body;
    - `__MOCK_CURATE_HASHTAGS__` gives 5 hashtags.
  - The seam `POST /api/test/caption-limit` (D16).
  - Fact sentinels keep working on every caption.
- **FR-22 (docs).**
  - `CLAUDE.md`: rewrite the Caption registry (026) entry as the 039 registry; the Caption route (024) entry (curated rows are stamped the same way); the Analytics (006) entry (`caption.copied`, `captionKind`/`captionOp`); the 027 facts entry (FACT_WHERE, writers, sources); MCP/ACP 2.2.0; the 039 state entry; "Pick up here".
  - `docs/mcp-acp-guide.md`: the shape, old posts, "treat `flagged` and `error` as needing review", `channels` ignored, 2.2.0.
  - `docs/e2e-test-plan.md`: §W rewritten, plus a new §AN `curated-captions`.
  - `docs/deploy.md` and `docs/cold-start.md`: the three migrations need no operator step; the down script, its flag and `pg_dump`.
  - `docs/ui-reference/DESIGN_SYSTEM.md` §12.
  - `README.md` (the caption line).

### Non-Functional Requirements

- **NFR-01:** No real model call in any gate. The upgrade scenario uses raw SQL and `prisma db execute`.
- **NFR-02:** Folio, the UI token guard and the wording guard hold on every changed screen.
- **NFR-03:** No new env var. The rate-limit numbers are constants, and the override is a `MOCK_AI`-only seam.
- **NFR-04:** Each task leaves `tsc`, lint and the unit suite green and commits alone. The full E2E mock suite is green at the end.
- **NFR-05:** Fresh deploy: every migration in order on an empty database, then `prisma migrate diff --exit-code` against `schema.prisma` exits 0, as in scenario 1 and scenario 6.
- **NFR-06:** The draft `GET` (the 4 s poll) adds no query. The kit website rides on `ResolvedBrandKit`, which the context already loads. Rules and per-caption facts are pure over data already read.
- **NFR-07:** No event payload, log line, or stored facts or rules value holds caption text (027 NFR-05, 006 NFR-04). `previous` holds caption text, because that is its purpose. It lives in the caption row, which already holds text, and is never logged or emitted.
- **NFR-08:** CI delta.
  - E2E: about +26 cases (the new `curated-captions` suite with about 16, about 5 general-caption cases in `captions`, 2 kit-website cases in `brand-kit`, and 3 events and Insights cases in `analytics`), and about −3 retired cases (Regenerate all: one in `captions`, TC-MODEL-07, and one in `surfaces`). That is about +1 to 2 minutes on the roughly 14-minute job.
  - Unit: about +8 files.

## Acceptance Criteria

- **AC-01 (identity schema):** `npm run test:upgrade` scenario 6 (new). After head is deployed over a database at `20261101130000_drop_campaigns` that holds an Instagram `READY` row, a LinkedIn `FAILED` row and a WhatsApp row on one post:
  - every row is `CURATED` with its channel, text and status unchanged, and `deletedAt`, `previous` and `generalHash` are null;
  - no `GENERAL` row exists;
  - a second `CURATED` Instagram row for that post fails with 23505;
  - a second `GENERAL` row fails with 23505;
  - a `GENERAL` row with a channel fails with 23514;
  - a `GENERAL` row with `deletedAt` fails with 23514;
  - the head client reads the rows;
  - `migrate diff --exit-code` exits 0.
- **AC-02 (registry guard):** Unit `captionRegistryGuard.test.ts`:
  - `registryEnumMismatches` is empty for `Object.values(Channel)` and `Object.values(CaptionKind)`;
  - **a fixture channel list with `THREADS` added returns `['Channel:THREADS']`;**
  - a fixture registry with a curated `MASTODON` entry returns `['registry:MASTODON']`;
  - a fixture kind list with `SUMMARY` returns `['kind:SUMMARY']`;
  - `WHATSAPP` is accepted only through `RETIRED_CHANNELS`.

  Each fixture must fail the guard (L36).

- **AC-03 (derived vocabulary):** Unit `channels.test.ts`:
  - the registry order is General, Instagram, LinkedIn, Facebook;
  - `FACT_WHERE` deep-equals `['headline', ...CAPTION_REGISTRY.map(e => e.target)]`;
  - the `jsonKey` values are unique;
  - `captionMaxTokens(['HEADLINE', 'GENERAL'])` is 2,812;
  - a stored flag with `where: 'INSTAGRAM'` still parses (`parseFactsCheck`).

  Unit `factsCheckNotice.test.ts`: every `FACT_WHERE` value has a label, and `general caption` and `Facebook caption` are among them.

- **AC-04 (generation contract):**
  - E2E `captions.test.ts` TC-CAP-23: a generated post has a headline and exactly one caption row, `GENERAL`, `READY`, with text. `GET /api/drafts/[id]` lists one caption. The mock reply was asked for `headline` and `general` only (the topic marker in the general text).
  - Unit `captionWriters.test.ts`:
    - `createPendingDraft` creates one `{ kind: 'GENERAL', channel: null, status: 'PENDING' }` row;
    - generation calls `writeCaptions` with `['HEADLINE', 'GENERAL']`;
    - the failure path's `updateMany` is scoped to `kind: 'GENERAL'`.
- **AC-05 (the general caption fails alone):** E2E TC-CAP-24, with the topic `__DROP_CAPTION_GENERAL__`:
  - the post is `EXPORTED` with its headline, and the general row is `FAILED`;
  - `{ kind: 'GENERAL' }` gets 202, and the row becomes `READY`;
  - the headline is unchanged.
- **AC-06 (old posts):** E2E TC-CAP-25. A post is seeded through the test DB with `CURATED` Instagram and LinkedIn rows and no general row.
  1. `GET` lists `general: null` (no `GENERAL` item) and the two curated items.
  2. MCP `getDraft` (unit, see AC-20) and the page agree.
  3. The page shows both curated cards and "Generate general caption".
  4. Clicking it creates a `GENERAL` row that becomes `READY`.
  5. The facts check is recomputed (`checkedAt` changes).
  6. A curate of Instagram on a second such post stores `generalHash` null, and its text has no `[from general]`.
- **AC-07 (`Brief.channels` ignored):**
  - E2E TC-CAP-26: `POST /api/briefs` with `channels: ['WHATSAPP']` gets 201, and so does a body with no `channels`. For both, the brief's `channels` column reads null through the test DB.
  - Unit `briefChannelsDeprecated.test.ts`:
    - no file under `src/` matches `/\bbrief\??\.channels\b/` or a `channels:` key in a `brief.create` call;
    - **a fixture `draft.brief.channels.map(channelLabel)` fails, and so does a fixture `prisma.brief.create({ data: { channels } })`;**
    - `schema.prisma` carries the `Deprecated (039)` comment on the field.
  - Unit `mcpGenerate.test.ts`: a `channels` argument is ignored, and `brief.create` receives no `channels`.
- **AC-08 (curate):**
  - E2E `curated-captions.test.ts` TC-CUR-01: the author curates Instagram and gets 202.
    - A `CURATED` `INSTAGRAM` row becomes `READY`, and its text contains `[from general]`.
    - Its `generalHash` (test DB) equals the first 16 hex characters of SHA-256 of the general caption.
    - `GET /api/test/model-calls` has exactly one new `CAPTION` call.
    - The general row is unchanged.
  - Unit `captionStore.test.ts`: the claim creates the missing row in the transaction and reports it in `created`.
  - Unit `testHooks.test.ts`: the mock reply answers `general` and each curated key it is asked for; `[from general]` appears only with `hasGeneral`; each FR-21 sentinel produces its documented body; a topic with no sentinel gives the default 50-word Facebook body with 2 hashtags and no link.
- **AC-09 (replace after settle):**
  - E2E TC-CUR-02:
    1. A second Instagram curate replaces the text, `canUndo` is true, and `previous.text` (test DB) is the first text.
    2. The brief's topic is then given `__FAIL_CURATED__` through the test DB.
    3. A third curate leaves the text as it was, `READY`, with `failureReason` starting `Regenerate failed:`. `previous` is unchanged.
  - Unit `captionActionTargets.test.ts`: `settleCaptionRow` returns `previous` only for a validated field over text or over a deleted row.
- **AC-10 (edit and undo):** E2E TC-CUR-03:
  1. `PATCH { channel: 'INSTAGRAM', text: 'Hand edit' }` gets 200, and `canUndo` is true.
  2. `POST …/captions/undo { channel: 'INSTAGRAM' }` restores the earlier text.
  3. A second undo brings back "Hand edit".
  4. `PATCH { kind: 'GENERAL', text }` gets 200 on the general caption.
  5. `PATCH` on a channel with no row gets 404 `caption-not-found`.

  Unit `captionUndo.test.ts`: the snapshot parse, the swap, and null on a malformed value.

- **AC-11 (delete):** E2E TC-CUR-04, on a post whose topic has `__MOCK_FACT_PRICE__`.
  1. `DELETE …/captions?channel=INSTAGRAM` gets 200.
  2. `GET` shows the item with `deleted: true` and `canUndo: true`.
  3. The facts check no longer has a flag where `INSTAGRAM`.
  4. MCP `getDraft` leaves the item out.
  5. A `PATCH` on it gets 409 `caption-deleted`.
  6. Undo restores it, and the `INSTAGRAM` flag returns.
  7. `DELETE …?channel=` with `GENERAL` gets 400 `general-not-deletable`.
  8. Deleting a `FAILED` row with no text removes it, and `canUndo` is absent.
- **AC-12 (one in flight):** E2E TC-CUR-05: while an Instagram curate holds the post, a LinkedIn curate gets 409 and a delete of a `PENDING` row gets 409. Unit `captionStore.test.ts`: a claim with `pendingAction` set returns null.
- **AC-13 (rate limit):**
  - Unit `captionRateLimit.test.ts`:
    - the constants are 30 and 600,000;
    - 30 calls pass, the 31st inside the window is refused, and it passes after the window;
    - two users do not share a window;
    - `allow` for events still admits 60 a minute (with `analyticsRateLimit.test.ts` unchanged).
  - E2E TC-CUR-06:
    1. The seam sets the limit to 2.
    2. The third curate gets 429 `rate-limited` with `Retry-After`.
    3. The model-calls count is unchanged, and `pendingAction` stays null.
    4. The seam clears the limit.
- **AC-14 (tiers):**
  - Unit `postActionTiers.test.ts` passes with the two new entries, and its existing fixture (a handler with no entry) still fails.
  - E2E `post-permissions.test.ts` TC-PERM-08: a same-team editor who is not the author gets 403 `not-author` on each of these:
    - curate (`regenerate-copy { channel }`);
    - `{ kind: 'GENERAL' }`;
    - `PATCH { kind: 'GENERAL', text }`;
    - `DELETE …/captions`;
    - `POST …/captions/undo`.

    The caption rows' `updatedAt` are unchanged, and no model call is recorded.
- **AC-15 (one recompute path):** Unit `captionWriters.test.ts`:
  - each of `saveGenerationCaptions`, `settleCaptionAction` (when the claim held), `saveCaptionEdit`, `deleteCaption` and `undoCaption` calls `refreshFactsCheck` once on success and not on a refused write;
  - the static check finds that every exported function in `store.ts` whose body writes `draftCaption` calls `refreshAfterWrite(`;
  - **a fixture writer without the call fails the check.**
- **AC-16 (sources are never a caption):**
  - Unit `factsSourcesBoundary.test.ts`:
    - `loadFactsSources` returns only the topic, description, briefing, voice and documents of its inputs;
    - `src/lib/factsCheck/sources.ts` has no import from `@/lib/captions`;
    - **a fixture with `import { loadDraftCaptions } from '@/lib/captions/store'` fails.**
  - E2E TC-CUR-07 (`__MOCK_FACT_PRICE__`):
    - flags exist where `GENERAL` and where `INSTAGRAM` after an Instagram curate;
    - the page shows the flagged-general line above the curate buttons;
    - the Instagram card shows `$49` in its own facts line.
- **AC-17 (the Facebook link):**
  - Unit `captionRules.test.ts`:
    - `composeFacebookCaption('Body.\nBook today.\n#a #b', 'https://acme.example')` gives `'Body.\nBook today.\nhttps://acme.example\n\n#a #b'`;
    - with no hashtag line, the link is last;
    - with no website, the body is unchanged.
  - Unit `captionExtract.test.ts`: a Facebook field with `https://x.y` or `www.x.y` fails `link-in-reply`, and an Instagram field with one passes.
  - E2E:
    - TC-CUR-08: the kit has `website`, and a Facebook curate contains the website exactly once, on its own line.
    - TC-CUR-09: the kit has no website. The Facebook text has no link, and the card and the curate button show the no-website line.
    - TC-CUR-10 (`__MOCK_CURATE_LINK__`): the first Facebook curate leaves a `FAILED` row with no text and reason `link-in-reply`. After the topic is fixed through the test DB and a curate succeeds, the sentinel is set again, and a regenerate keeps the text.
- **AC-18 (rules state):**
  - Unit `captionRules.test.ts`:
    - `countWords` skips hashtags, links and emoji-only tokens;
    - each `unmet` value is produced by its fixture: 39 words, 121 words, 4 hashtags, an Instagram hashtag before the last line, and a Facebook text without the kit website;
    - `rulesPromptText` for Facebook says "40 to 120 words" and "at most 3 hashtags".
  - E2E TC-CUR-11 (`__MOCK_CURATE_SHORT__`):
    - the Facebook caption is stored, and `rules.unmet` is `['words-under']`;
    - the card shows "Facebook asks for 40 to 120 words. This has 12.";
    - after a `PATCH` to 50 words, `rules.met` is true and the line is gone.
- **AC-19 (kit website):**
  - Unit `kitWebsite.test.ts`:
    - an https value is accepted and stored trimmed;
    - these are refused: `http://`, `javascript:alert(1)`, `https://user:pw@x.y`, `https://localhost`, a value of 2,049 characters, and a value with a space;
    - the route gives 400 with the message, and `null` clears.
  - E2E `brand-kit.test.ts` TC-BK-30: an admin sets and clears the website, and `KitDetail` shows it. TC-BK-31: an editor's `PATCH` gets 403, and an `http` value gets 400.
- **AC-20 (MCP and ACP):**
  - Unit `mcpGetDraft.test.ts`:
    - each caption item has exactly `kind, channel, text, status, facts, rules`;
    - the general item comes first;
    - a deleted row and a WhatsApp row are left out;
    - an old post has no `GENERAL` item;
    - `facts` is `flagged` with this caption's flags only, `error` when the check errored, and `null` when unchecked;
    - the manifest's caption item schema has the same key set.
  - Unit `acpManifest.test.ts`:
    - both versions are `2.2.0`;
    - no `channels` in either input schema or `required`;
    - the caption `channel` enum equals `CAPTION_CHANNELS`' channels plus `null`.
  - E2E `acp.test.ts`: `generate_post` with `channels: ['INSTAGRAM']` gets 200, with one caption item `{ kind: 'GENERAL', channel: null }`.
- **AC-21 (events):**
  - Unit `analyticsCoverage.test.ts`:
    - every `CaptionKind` value is carried;
    - `caption.copied` is in `CLIENT_EVENTS` with exactly one emitter file (`src/app/api/events/route.ts`);
    - `draft_action.settled` keeps `schemaVersion` 1 and accepts `captionKind` and `captionOp`;
    - no payload schema of either event accepts a text field.
  - Unit `analyticsEventsRoute.test.ts`:
    - `caption.copied` for a foreign draft gets 404 and writes nothing;
    - `{ kind: 'CURATED', channel: 'WHATSAPP' }` gets 400;
    - a second copy of the same caption within 10 s gets 204 and is counted as dropped;
    - team, user and source come from the session.
  - E2E `analytics.test.ts`:
    - TC-OBS-32: clicking Copy on the general caption writes one `caption.copied` `{ kind: 'GENERAL', channel: null }` with the draft id;
    - TC-OBS-33: a Facebook curate writes one `draft_action.settled` with `captionKind: 'CURATED'`, `channel: 'FACEBOOK'`, `captionOp: 'create'` and `ok`, and a second one writes `replace`.
- **AC-22 (Insights):**
  - Unit `analyticsQueries.test.ts`: `shapeCaptions` gives one row per registry entry in order, the curate rate as a ratio (null with no generations), and downloads ok and failed.
  - E2E TC-OBS-34: over a seeded set, the Captions section's figures equal a hand count, and the copies column reads "client-reported".
- **AC-23 (the caption desk):**
  - E2E `curated-captions.test.ts` TC-CUR-12 (UI):
    - the author sees "General caption" with Copy and Regenerate, and three "Curate for …" buttons;
    - after a LinkedIn curate, a LinkedIn card with Copy, Regenerate and Delete;
    - after Delete, "Deleted" with Undo, and Undo brings the card back;
    - "Regenerate all" is absent;
    - Copy puts the text on the clipboard.
  - E2E `post-permissions.test.ts`: a non-author sees the captions and Copy, and no Curate, Regenerate, Delete or Undo.
  - Unit `draftDetailGet.test.ts`: each `captions` item carries the FR-15 keys, general first; `kitWebsite` comes from the context kit; `brief.channels` is absent; the handler issues no query beyond those it issued before 039 (the mocked client's call list).
  - Unit `uiWordingGuard.test.ts` and `uiTokenGuard.test.ts` pass.
- **AC-24 (prompts):**
  - Unit `prompts.test.ts`:
    - the generation prompt asks for exactly `"headline", "general"` and holds the general rules lines;
    - a Facebook curate prompt asks for exactly `"facebook"`, holds the general caption inside `fenceUntrusted`, holds the Facebook rules, and says to write no URL;
    - with no general caption, there is no fenced section;
    - the providers pass `captionMaxTokens(targets)`.
  - Unit `heroPrompts.test.ts` (or `postStylesPrompts.test.ts`): the Path B user message has no `Channels:` line.
  - Unit `generationUntouched.test.ts` pins `PROMPT_VERSION` to `2026-11-02.1+ps<rev>` and `CAPTION_PROMPT_VERSION` to `2026-11-02.3+ps<rev>`.
- **AC-25 (the down script fails closed):** `npm run test:upgrade` scenario 6, continued:
  1. A `GENERAL` row, a `FACEBOOK` row and a kit website are added.
  2. `prisma db execute --file prisma/rollback/039-…down.sql` exits non-zero. The output names `039 rollback refused: 1 general captions, 1 Facebook captions, 0 deleted captions, 1 brand kits with a website`. Every row and column is unchanged.
  3. Run with a temporary copy that starts `SET app.allow_caption_loss = 'on';`, it exits 0. The general and Facebook rows are gone, and the Instagram, LinkedIn and WhatsApp rows are intact. `kind`, `previous`, `deletedAt`, `generalHash` and `BrandKit.website` are gone. `channel` is `NOT NULL`. `DraftCaption_draftId_channel_key` exists. The three migration rows are gone.
  4. Head deploys again, and `migrate diff --exit-code` exits 0.
- **AC-26 (fresh deploy):** Scenario 1's head deploy passes with the three migrations, and NFR-05's diff exits 0.
- **AC-27 (Regenerate all retired, Q2 default):**
  - Unit `captionRequests.test.ts`: `{}` gets the shape message, and so do `{ kind: 'CURATED' }` and `{ channel: 'WHATSAPP' }`.
  - Unit `captionRoutes.test.ts`: an empty body is 400.
  - E2E `surfaces.test.ts`: the post page has no "Regenerate all" and no "All captions model".
  - TC-MODEL-07 is removed from `model-selection.test.ts` with a line in the test plan.
- **AC-28 (gates):** `tsc`, lint, the unit suite and the full E2E mock suite pass in CI on `v2`.
  - Rewritten:
    - E2E `captions` (§W), `caption-route`, and the caption assertions of `model-selection`, `post-styles`, `async-actions`, `team-isolation`, `path-a`, `path-b`, `settle-race`, `acp`, `surfaces`, `download`, `agui-refinement`, `headline-badge` and `analytics`;
    - unit `channels`, `caption*`, `factsCheck*`, `mcpGetDraft`, `mcpGenerate`, `acpManifest`, `analyticsCoverage`, `analyticsEventsRoute`, `modelRequests`, `regenerateStamp`, `draftDetailGet`, `prompts` and `generationUntouched`.
  - New:
    - E2E `curated-captions`;
    - unit `captionRegistryGuard`, `captionRules`, `captionUndo`, `captionRateLimit`, `briefChannelsDeprecated`, `factsSourcesBoundary` and `kitWebsite`.
  - No suite is deleted without a replacement.
- **AC-29 (docs):**
  - A grep of `CLAUDE.md`, `README.md` and `docs/{deploy,cold-start,mcp-acp-guide,e2e-test-plan}.md` finds no present-tense statement that a post gets Instagram and LinkedIn captions at generation, that `generate_post` takes `channels`, or that the version is `2.1.0`. History sections may say so.
  - `docs/mcp-acp-guide.md` holds the D20 JSON shape.

## Edge Cases

- **Curate while the post is generating, or on a `FAILED` post:** 409 "not ready", as today (`regenerate-copy/route.ts:58-62`).
- **Curate while the general caption is `PENDING` or `FAILED`:** the curate runs without it (D11), and `generalHash` is null.
- **The general caption is edited after a curate:** the curated caption keeps the hash of the text it was written from. 039 shows no notice; D4 keeps the data for one.
- **The kit website changes after a Facebook curate:** the card's rules line shows `link-missing` ("The call to action does not carry the brand kit's website"). The text is not rewritten. A regenerate inserts the new link.
- **The post's recorded kit is deleted:** `postContext` falls back to the project default and then the team default (038). The website is that kit's.
- **Delete, then curate the same channel:** the deleted row is replaced (`captionOp: 'replace'`). `previous` holds the deleted state, so Undo returns to "Deleted".
- **Two tabs: an undo against an edit:** the row-status guard and the `updatedAt` compare-and-set give one of them 409 `changed`.
- **Legacy WhatsApp rows:** `CURATED`/`WHATSAPP`. They are left out of every reader through the registry. They are never deleted, and are counted as retired by the guard.
- **A viewer copies:** the event is recorded with the viewer's user id (view tier). Copies by non-authors count.
- **The model writes `acme.com` with no scheme in a Facebook body:** it is not detected (L1). The facts check does not read links (Q1).
- **A team with a non-Claude caption provider:** the model pickers hide, as today (008 FR-20). Curate still runs on the provider's own model.
- **The rate limit after a restart:** in-process, so the window resets. That lets a few extra calls through, like the events limiter.
- **The local `ai_studio` database:** the three migrations are additive and need no operator step. The user's pending 037 and 038 steps come first. No task runs `npm run db:migrate` there.
- **An old post that is `FAILED`:** retry creates its `GENERAL` row and leaves its old curated rows as they are.

### Known limits

- **L1:** link detection covers `http(s)://` and `www.` only.
- **L2:** "a clear call to action" is a prompt instruction, not a check (D9).
- **L3:** per-caption `facts` inherit the check's cap of 20 flags (`MAX_FLAGS`), so a caption beyond the cap can read `clear` while the draft-level check is `flagged`. The draft-level `factsCheck` stays authoritative.
- **L4:** consistency between a curated caption and the general caption is not machine-checked. What can be observed: the prompt carries the general caption (AC-24); the facts check flags an unsupported value wherever it appears (AC-16); and `generalHash` records the source (AC-08).

## Grounding

- The proposal's user decisions (2026-10-30): "a caption-kind column. Each caption row has a kind, `GENERAL` or `CURATED` … Only `FACEBOOK` is added to the `Channel` enum … `get_draft` (MCP and ACP) returns an open list of captions, each with its kind, channel, text and facts check." This is the basis for D1, D5 and D20.
- The proposal's user decisions: "Code puts that exact link into the Facebook call to action; the model never writes a URL. A kit with no website gives a call to action with no link, and the card says so." This is the basis for D6 and D17.
- The proposal's user decisions: "one-step undo per caption … regenerate, edit and delete save it first … Delete is soft … A failed regenerate keeps the old text." This is the basis for D13 to D15.
- `src/lib/captions/store.ts:69-79`: `loadDraftCaptions` creates an empty `READY` row for every registry channel a post lacks. That contradicts "on demand", so FR-05 removes it.
- `src/lib/captions/store.ts:200-221`: `claimCaptionAction` takes the draft-level `REGENERATE_COPY` claim guarded on `pendingAction: null`. This is the one-in-flight basis of D12.
- `src/lib/captions/actionTargets.ts:63-91`: "A failure never destroys good text (A7)." This is the replace-only-after-settle basis of D12.
- `src/lib/captions/store.ts:85-96`: `refreshAfterWrite`, the single recompute, is called by the store writers today. This is the basis of D19.
- `src/lib/factsCheck/sources.ts:15-27`: the sources are the topic, description, briefing, voice and documents. This is the basis of D19's "never a caption".
- `src/lib/factsCheck/types.ts:10-13`: `FACT_WHERE = ['headline', 'INSTAGRAM', 'LINKEDIN']`. It is hard-coded, so D7 derives it.
- `src/lib/agent/prompts/caption.ts:24-26`: "Room for two captions plus a headline" (`8192`). It is hard-coded, so D18 derives it.
- `src/lib/channels.ts:66-72`: "Channels that have a publisher … Inputs (briefs, queue, posts, team channels, MCP/ACP) accept only these." This publish meaning is the one 039 retires.
- `src/components/brief/constants.ts:10-12`: "Channels are no longer chosen at brief time … Every brief targets both feeds by default." The wizard has had no channel picker since before 039, so the proposal's "the picker goes" is a default that goes (D21).
- `src/lib/analytics/catalogue.ts:121-128`: `draft_action.settled` already carries `channel` as `z.nativeEnum(Channel)`. This is the basis of D22: no new event name for a curate.
- `src/app/api/events/route.ts:8-15`: the session-scoped client-event path with a per-user window. This is the basis of D22's copy event.
- `src/lib/analytics/rateLimit.ts:1-27`: the only rate limiter in the repo. D16 reuses it.
- `src/app/api/acp/run/route.ts:31-45`: ACP serves `generate_post` only. This is the basis of D20.
- `src/acp/agent.ts:6-9`: "The version is semver: a minor bump per additive change to a capability's schema." This, with 038 D13, is the basis of 2.2.0.
- `prisma/migrations/20261030120000_apply_text_action/migration.sql` and `prisma/rollback/031-v2-final-polish.down.sql` §A: `ADD VALUE` alone in its migration, and a down that leaves the value. This is the basis of D5 and D24.
- `CLAUDE.md`, the program decisions: "Insights: trimmed, plus caption, download and copy metrics." This is the basis of D23.
- `CLAUDE.md`, Caption route (024): "The route that ran is stamped on each caption row." Curated rows are stamped by the same settle (FR-08).

## Traceability: party findings

| #   | Finding (seat, severity)                                                              | Settled in                                                                                      |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | The vocabulary is open, and four contracts depend on it (architect, WARN)             | The user's decision; D1 (key and uniqueness), D2 (CHECK), D22 (copy event fields), AC-01, AC-21 |
| 2   | `Brief.channels`: drop or ignore, and its surfaces (architect, WARN)                  | D21 (every surface listed), FR-17, AC-07                                                        |
| 3   | Routes, claim actions, history and delete's undo are unnamed (architect, WARN)        | D12 to D15, FR-08, FR-09, AC-08 to AC-11                                                        |
| 4   | The facts recompute misses delete and undo (architect, WARN)                          | D19 (one function, every writer), AC-15                                                         |
| 5   | The curate input on an old post is undefined (architect, WARN)                        | D11, AC-06                                                                                      |
| 6   | The Facebook link has no source and no enforcing layer (architect, WARN)              | D8, D9, D17, FR-04, FR-14, AC-17, AC-18                                                         |
| 7   | The download and copy events have no emitter; Download is 037's (architect, WARN)     | D22 (`draft.downloaded` stays; `caption.copied` through `/api/events`), AC-21                   |
| 8   | The `get_draft` shape is unstated (architect, WARN)                                   | D20 (the JSON, the old-post case, MCP and ACP), AC-20                                           |
| 9   | The vocabulary and the shape couple to the general caption (architect, NOTE)          | D28 (T1 and T2 carry them; T3 and T4 are additive)                                              |
| 10  | "Curated" is undefined (ba, WARN)                                                     | Overview definitions, D8                                                                        |
| 11  | No acceptance criteria for the main claim (ba, WARN)                                  | AC-01 to AC-29, each naming its test; the Facebook limits in AC-17 and AC-18                    |
| 12  | The general caption's rules, channel or kind, and old posts (ba, WARN)                | Overview definition; D1 (a kind); D8 (its rules); D11                                           |
| 13  | No evidence of the pain; what shows it is not wanted (ba, NOTE)                       | D23 (the curate-rate reading and its 10% threshold)                                             |
| 14  | Cheaper variant never weighed (po, WARN)                                              | D26                                                                                             |
| 15  | Analytics and Insights have no stated value (po, WARN)                                | D22 (only `caption.copied` is new); D23 (kept per the user's program decision, with no chart)   |
| 16  | Running cost unstated (po, WARN)                                                      | D27, D16 (the bound)                                                                            |
| 17  | Cut line; `Brief.channels` as ignored (po, NOTE)                                      | D28; D21 (ignored, per the user's decision)                                                     |
| 18  | The Facebook link has no stored source (security, BLOCK)                              | The user's decision; D6, D17, AC-17, AC-19                                                      |
| 19  | Regenerate and delete destroy a caption (security, BLOCK)                             | The user's decision; D12 (replace after settle), D13 to D15, AC-09 to AC-11                     |
| 20  | No gate and no cap on curate (security, WARN)                                         | D16 (edit tier, one in flight, the rate limit), AC-12 to AC-14                                  |
| 21  | The general caption spreads invented facts; self-grading (security, WARN)             | D19 (sources never a caption; the flagged-general line; flags per caption), AC-16               |
| 22  | The MCP/ACP read hides the facts flag (security, WARN)                                | D20 (`facts` per item), FR-22 (the review guidance), AC-20                                      |
| 23  | The copy event is forgeable and unbounded (security, WARN)                            | D22 (session, team check, registry check, 10 s dedupe, "client-reported"), AC-21, AC-22         |
| 24  | The enum down deletes captions; dropping `Brief.channels` loses data (security, WARN) | D24 (fails closed with counts; the flag; `pg_dump`), D21 (ignored, no drop), AC-25              |
| 25  | A drop needs a dump; mark an ignored field deprecated (security, NOTE)                | D21 (the schema comment and the guard), D24 (`pg_dump` in the header)                           |
| 26  | Channel or kind is the one-way decision (visionary, BLOCK)                            | The user's decision; D1, D5 (stated one-way)                                                    |
| 27  | Make the identity a key that can grow (visionary, WARN)                               | D1 ("The key can grow")                                                                         |
| 28  | Guard the registry against the enum (visionary, WARN)                                 | FR-03, AC-02                                                                                    |
| 29  | `get_draft` as an open keyed list (visionary, WARN)                                   | D20                                                                                             |
| 30  | Count old posts; backfill, freeze, or one reader (visionary, WARN)                    | D11 (the count, no backfill, `loadDraftCaptions` as the one reader)                             |
| 31  | Mark `Brief.channels` deprecated and stop the writers (visionary, WARN)               | D21, AC-07                                                                                      |
| 32  | Store the general caption's hash on curated rows (visionary, NOTE)                    | D4 (`generalHash`), AC-08                                                                       |
| 33  | The rules belong in the registry, feeding prompt and check (visionary, NOTE)          | D8, FR-04, AC-18, AC-24                                                                         |
| 34  | Slice only after the vocabulary and the shape are fixed (visionary, WARN)             | D28                                                                                             |

## Questions for the user

- **Q1. Should the facts check also flag links?** party-security's BLOCK fix ends: "Have the facts check flag any URL in any caption that is not in the brief, kit or project sources." The user's decision settled the Facebook link by insertion. A `url` kind would also flag a link the model echoes in the general, Instagram or LinkedIn caption that no source states.
  - The cost: one new kind in `src/lib/factsCheck/extract.ts` and its normaliser, the kit website as a source, and corpus cases. It also adds flags to posts that pass today.
  - **Recommended default: not in 039.** The one required link (Facebook's) cannot come from the model. A link in the other captions is today's exposure, not a new one. It can be a follow-up change.
- **Q2. May "Regenerate all" go?** Today `{}` regenerates every caption (012 FR-11), and the page has the "Regenerate all" button with its "All captions model" picker. After 039, "all" would mean the general caption plus whatever curated captions exist, written in one call alongside a general caption that is changing too. Curated captions are meant to be derived from the general caption, so that order fights the definition.
  - **Recommended default: retire it.** `{}` becomes 400. The button, the picker and TC-MODEL-07 go. Each caption keeps its own Regenerate.
  - If kept, `{}` means the general caption plus the live curated captions, in one call. The curated ones are then not given the new general caption.
- **Q3. Should an out-of-range Facebook caption be refused instead of stored with a notice?** The proposal sets 40 to 120 words and 0 to 3 hashtags. D9 stores a caption that misses them, with a one-line notice, because refusing throws away a paid reply the user could fix in seconds.
  - **Recommended default: store with the notice.** A link written by the model is always refused (D17), because that is the security rule, not a style rule.
