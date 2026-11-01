# Verification Report: 039-general-and-curated-captions

**Verified:** 2026-11-01
**Model:** claude-opus-5-5 (orchestrator) with two claude-sonnet verifiers (AC-01–AC-14, AC-15–AC-29)
**Verdict:** PASS

All 29 acceptance criteria pass. Neither verifier found an unmet criterion. They named eight places where a clause was only weakly evidenced: a test asserted less than the criterion says, or sat in a different file than the one named. The orchestrator closed all eight in `fddda008`, which changes tests and one doc only (no product code):

- the three changed E2E files were re-run: `captions`, `curated-captions` and `acp`, 39 passed;
- the unit suite passes: 227 files, 4818 tests.

## Acceptance Criteria

- ✅ **AC-01 (identity schema):** upgrade scenario 6 (`scripts/test-upgrade-path.mjs` ~681–835).
  - Instagram READY, LinkedIn FAILED and WhatsApp rows become `CURATED` with channel, text and status unchanged, and `deletedAt`, `previous` and `generalHash` are null.
  - There is no general row.
  - A second curated Instagram row and a second general row get 23505. A general row with a channel, or with `deletedAt`, gets 23514.
  - The head client reads the rows, and `migrate diff --exit-code` passes.
- ✅ **AC-02 (registry guard):** `captionRegistryGuard.test.ts`. The real enums give `[]`. Fixtures fail as expected:
  - `THREADS` gives `Channel:THREADS`;
  - `MASTODON` gives `registry:MASTODON`;
  - `SUMMARY` gives `kind:SUMMARY`.

  WhatsApp is accepted only through `RETIRED_CHANNELS`.

- ✅ **AC-03 (derived vocabulary):** `channels.test.ts` covers the registry order, `jsonKey` uniqueness, `FACT_WHERE` and `captionMaxTokens(['HEADLINE','GENERAL'])` = 2812. `factsCheckNotice.test.ts` labels every `FACT_WHERE` value; "Facebook caption" is asserted explicitly since verify.
- ✅ **AC-04 (generation contract):**
  - TC-CAP-23: one general row is READY and `GET` lists one caption.
  - `captionWriters.test.ts`:
    - `createPendingDraft` makes exactly one general PENDING row;
    - `writeCaptions` targets HEADLINE and GENERAL;
    - the failure path's `updateMany` is now pinned to `{ status: 'PENDING', kind: 'GENERAL' }` (tightened at verify).
- ✅ **AC-05 (the general caption fails alone):** TC-CAP-24.
  - The post is EXPORTED with its headline, and the general row is FAILED with empty text.
  - Regenerating `{ kind: 'GENERAL' }` gets 202 and fills it. The headline and revision are unchanged.
- ✅ **AC-06 (old posts):**
  - TC-CAP-25 covers clauses 1 and 3–5: only the curated items are listed, "Generate general caption" makes a READY general row, and `checkedAt` changes.
  - **TC-CAP-25b** (added at verify) covers clause 6: curating an old post stores `generalHash` null, and the text has no `[from general]`.
  - Clause 2 is covered by `mcpGetDraft.test.ts` (AC-20).
- ✅ **AC-07 (`Brief.channels` ignored):**
  - TC-CAP-26: a brief with `['WHATSAPP']` and one with no `channels` both get 201, and the column reads null.
  - `briefChannelsDeprecated.test.ts`: the `src/` scan, two failing fixtures and the schema comment.
  - `mcpGenerate.test.ts`: `channels` is ignored.
- ✅ **AC-08 (curate):**
  - TC-CUR-01: 202, a READY curated Instagram row with `[from general]`, and `generalHash` equal to `sha16(general)`. There is exactly one CAPTION call, and the general row is unchanged.
  - `captionStore.test.ts`: the claim creates the row and reports it in `created`.
  - `testHooks.test.ts`: the mock reply keys, the `[from general]` marker, the sentinels, and the default Facebook body.
- ✅ **AC-09 (replace after settle):** TC-CUR-02, rewritten at verify.
  - The topic changes between the two curates, so the second text differs from the first. `canUndo` is true, and `previous.text` equals the first curate's text, as the AC says. The earlier test used a hand edit, so it asserted `'Hand edit'`.
  - A `__FAIL_CURATED__` third curate keeps the text and READY, with `Regenerate failed:`, and leaves `previous` unchanged.
  - `captionActionTargets.test.ts` covers when `previous` is written.
- ✅ **AC-10 (edit and undo):** TC-CUR-03 covers all five steps, plus general undo and 409 `nothing-to-undo`. Unit tests `captionUndo.test.ts` (parse) and `captionStore.test.ts` (swap) cover the rest.
- ✅ **AC-11 (delete):** TC-CUR-04 with `__MOCK_FACT_PRICE__`.
  - After a delete, the caption is `deleted` with `canUndo`, its Instagram flag is gone, and PATCH gets 409 `caption-deleted`.
  - Undo restores the caption and its flag.
  - Deleting the general caption gets 400 `general-not-deletable`. A FAILED row is removed with no `canUndo`.
  - MCP leaving the deleted caption out is covered by `mcpGetDraft.test.ts`.
- ✅ **AC-12 (one in flight):** TC-CUR-05: while an Instagram curate holds the post, a LinkedIn curate, a delete of the PENDING row and an undo each get 409. `captionStore.test.ts`: a claim already held returns null.
- ✅ **AC-13 (rate limit):**
  - `captionRateLimit.test.ts`: 30 per 600 000 ms, the 31st refused, then allowed after the window, and per-user windows.
  - TC-CUR-06: 429 `rate-limited` with `Retry-After`, no model call, `pendingAction` null.
  - TC-CUR-06b: the seam is admin-only.
- ✅ **AC-14 (tiers):**
  - `postActionTiers.ts` lists captions DELETE, undo and regenerate-copy as `edit`, and the missing-entry fixture still fails.
  - TC-PERM-08: an editor gets 403 `not-author` on curate, general regenerate, PATCH, DELETE and undo. Rows are unchanged and no model call is made. A cross-team request gets 404.
- ✅ **AC-15 (one recompute path):**
  - The per-writer `refreshAfterWrite` counts are in `captionStore.test.ts`:
    - `saveGenerationCaptions`;
    - `settleCaptionAction` (and a lost claim recomputes nothing);
    - `saveCaptionEdit`;
    - `deleteCaption`;
    - `undoCaption`.
  - The static scan with its failing fixture is in `captionWriters.test.ts`.
  - Note: the AC names `captionWriters.test.ts` for the counts. They live in the store suite; every clause is asserted.
- ✅ **AC-16 (sources are never a caption):** `factsSourcesBoundary.test.ts` checks the inputs only, no `@/lib/captions` import, and has a fixture that fails. TC-CUR-07: `$49` is flagged on the general and Instagram captions, and the `general-flagged` line sits above the Curate buttons.
- ✅ **AC-17 (the Facebook link):**
  - `captionRules.test.ts`: the composer.
  - `captionExtract.test.ts`: `https://`, `www.` and `http://` links fail `link-in-reply` on Facebook only.
  - TC-CUR-08: the link appears once, on its own line, before the hashtags.
  - TC-CUR-09: with no kit website there is no link, and the notice shows on the button and the card.
  - TC-CUR-10: a first curate with a link in the reply is FAILED. A later regenerate with a link keeps the text and adds `Regenerate failed: link-in-reply`.
- ✅ **AC-18 (rules state):**
  - `captionRules.test.ts`: the word count, the bounds, the hashtags, `link-missing`, and the prompt text.
  - TC-CUR-11: an off-range caption is stored with `['words-under']` and "This has 12.". It clears after an edit to 50 words.
- ✅ **AC-19 (kit website):** `kitWebsite.test.ts` covers https accepted, the six refusals, null clears, and the route's 400. TC-BK-30 sets, clears and displays the website. TC-BK-31 covers editor 403 and `http` 400 with its message.
- ✅ **AC-20 (MCP and ACP):**
  - `mcpGetDraft.test.ts`: the exact keys, general first, deleted and WhatsApp rows left out, an old post with no general caption, and per-caption facts.
  - `acpManifest.test.ts`: 2.2.0, no `channels`, and the channel enum.
  - `acp.test.ts`'s `generate_post` with `channels: ['INSTAGRAM']` now asserts one `{ kind: 'GENERAL', channel: null }` caption with the D20 key set (added at verify; it was only in `captions.test.ts` before).
- ✅ **AC-21 (events):**
  - `analyticsCoverage.test.ts`: every `CaptionKind`, `captionKind` and `captionOp`, no text fields, and one emitter for `caption.copied`.
  - `analyticsEventsRoute.test.ts`: the session fields, foreign draft 404, `CURATED`+`WHATSAPP` 400, and the 10 s dedupe.
  - TC-OBS-32 and TC-OBS-33.
- ✅ **AC-22 (Insights):** `analyticsQueries.test.ts` (`shapeCaptions`). TC-OBS-34 checks hand-counted rows, downloads, `curateRate` 0.5, and the "Copied (client-reported)" header.
- ✅ **AC-23 (the caption desk):**
  - TC-CUR-12: general Copy and Regenerate, three Curate buttons, no "Regenerate all", the card actions, Deleted with Undo, and the clipboard read back.
  - `post-permissions.test.ts`: a non-author sees text and Copy only.
  - `draftDetailGet.test.ts`: the FR-15 keys, `brief.channels` gone, and `kitWebsite`.
- ✅ **AC-24 (prompts):**
  - `prompts.test.ts`:
    - the general caption is fenced as untrusted;
    - with no general caption there is no fenced section;
    - Facebook gets its rules and "Do not write any URL";
    - the generation keys;
    - the Path B user message has no `Channels:` line, even for a brief that carries `channels` (added at verify).
  - `anthropicCall.test.ts`: the Anthropic and OpenAI caption providers send `max_tokens` equal to `captionMaxTokens(targets)` (added at verify).
  - `generationUntouched.test.ts` pins `2026-11-02.1+ps<rev>` and `2026-11-02.3+ps<rev>`.
- ✅ **AC-25 (the down script fails closed):** scenario 6.
  - Without the setting, the script refuses: the counts are "1 general captions, 1 Facebook captions, 0 deleted captions, 1 brand kits with a website", and a before/after snapshot shows nothing changed.
  - With `app.allow_caption_loss = 'on'` it runs and exits 0. The rows equal the three originals, the columns are gone, `channel` is NOT NULL, and the old unique key exists again.
  - Head then redeploys, and `migrate diff` exits 0.
- ✅ **AC-26 (fresh deploy):** scenario 1 deploys head with the three migrations, and `migrate diff --exit-code` passes. CI upgrade path: ALL PASS.
- ✅ **AC-27 ("Regenerate all" retired):**
  - `captionRequests.test.ts`: `{}`, `{kind:'CURATED'}` and `{channel:'WHATSAPP'}` all get the shape message.
  - `captionRoutes.test.ts`: bodies that are absent, empty, whitespace or `{}` get 400 with no read or claim.
  - `surfaces.test.ts`: no "Regenerate all" control.
  - TC-MODEL-07 is removed, and the plan notes it.
- ✅ **AC-28 (gates):**
  - Local: tsc clean, lint 0 errors (7 warnings that were there before), build OK, unit 227 files / 4818 tests.
  - CI run 41270059842 on `91c1b350`: unit, render harness, upgrade path ALL PASS, and E2E **611 passed, 3 skipped, 0 failed**.
  - CI run 41282434850 on the verify commit `fddda008`: unit, render harness, upgrade path ALL PASS, and E2E **612 passed, 3 skipped, 0 failed** (612 with TC-CAP-25b).
- ✅ **AC-29 (docs):**
  - CLAUDE.md, README, `docs/deploy.md` §11, `docs/cold-start.md`, `docs/e2e-test-plan.md` and DESIGN_SYSTEM.md §8.14 and §12 all match what shipped.
  - `docs/mcp-acp-guide.md` §4 says 2.2.0 and that `channels` is ignored. It now holds the D20 `captions` JSON example (added at verify).

## Test Results

- `npm run test:unit`: 227 files and 4815 tests at `91c1b350`; 4818 at `fddda008` with the verify tests.
- `npm run lint`: 0 errors (7 warnings that were there before). `npm run build`: success. `npx tsc --noEmit`: clean.
- E2E, verify re-run (mock, `ai_studio_test`): `captions`, `curated-captions` and `acp`, 39 passed.
- Full E2E mock (T6 gate): 611 passed, 3 skipped (TC-REG-H11a/b/c, intentional), 0 failed.
- CI run 41267795655 (`1e0ab2d8`) and run 41270059842 (`91c1b350`) both succeeded: E2E 611/3/0/0, and the upgrade path, scenarios 1–6, ALL PASS.
- CI run 41282434850 (`fddda008`, HEAD with the verify tests) succeeded: E2E 612 passed / 3 skipped / 0 failed (28.3 min); upgrade path ALL PASS.
- E2E evidence state: the specclaw `build.e2e_command` is not configured. The E2E evidence is the local mock runs and CI above.

## Issues Found

1. **Resolved at verify:** eight weakly evidenced clauses (AC-03, AC-04, AC-06 clause 6, AC-09 clause 1, AC-20, AC-24 ×2, AC-29). They were closed in `fddda008` with tests and docs only.
2. **AC-15 names the wrong file.** The per-writer recompute counts are in `captionStore.test.ts`, not `captionWriters.test.ts`. The behaviour is fully asserted, so this is left as is.
3. **NOTE-level review items accepted at build:**
   - the token budget formula follows spec D18;
   - the Facebook compose can push a caption past 120 words with the link line;
   - bare-domain link detection;
   - IP hosts in the kit website;
   - the curate rate can exceed 100% when a post is curated more than once.

   They are recorded in `reviews/T1.md` to `T5.md`, and none affects an AC.

## Per-task reviews

- T1 — NOTE(3) (down-script `information_schema` lookup not schema-qualified; fixed before commit)
- T2 — NOTE(3) (aria-labels title-cased against the spec wording; fixed before commit, E2E locators updated)
- T3 — NOTE(3)
- T4 — NOTE(3)
- T5 — NOTE(2)
- T6 — no review (docs; the full gate was run by the orchestrator)

## Summary

**Passed:** 29/29 criteria
**Failed:** 0/29 criteria
**Verdict:** PASS

## Verification

Command: gh run view 41282434850 --json conclusion
Exit: 0
Output (tail): success — E2E 612 passed, 3 skipped, 0 failed; unit success; upgrade path ALL PASS
