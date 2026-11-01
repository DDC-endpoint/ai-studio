# Party Report: 039-general-and-curated-captions

**Reviewed:** 2026-10-30
**Tier:** deep (classifier) — Changes the persisted caption shape by adding general and Facebook caption kinds through Postgres enum ALTERs, repurposes CAPTION_CHANNELS away from the publish list, and drops or ignores the wizard channel picker and Brief.channels, with the data-model choice left open to the plan.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

34 findings: 3 BLOCK, 25 WARN, 6 NOTE upheld — 0 withdrawn

## Findings

### [WARN] party-architect — The caption vocabulary is left open, and four contracts in the proposal depend on the choice

**Quotes:** > The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner.
**Quotes:** > These events become the `Channel` carrier `analyticsCoverage.test.ts` needs.
**Quotes:** > It is saved on the post next to the general caption, at most one per channel.
**Problem:** The two options produce different systems. If the general caption becomes a `Channel` value, then a value that is not a channel goes into the enum that the analytics coverage test, `CaptionKey`, `FACT_WHERE` and the uniqueness rule ("at most one per channel") all read. If it becomes a separate caption-kind column, every caption row is classified by two fields at once (kind and channel). The uniqueness key, the FAILED-row CHECK the proposal lists as a risk, and the copy event's "channel, general included" field would then need a second vocabulary next to `Channel`. In that case the events cannot be "the `Channel` carrier", because "general" is not a `Channel` value. The proposal calls itself architectural because "it changes the caption data model", yet it leaves that same model to the plan. Two implementers would build incompatible schemas, events and MCP shapes. Round 2 agrees: party-visionary (BLOCK, one-way enum), party-ba (general as channel or kind) and party-security (rollback of the enum) all reach this same open choice from their own lenses.
**Fix:** Choose in the proposal. Option one: `GENERAL` is a `Channel` value, and the proposal says how a value that is not a channel fits the registry and the coverage test. Option two: a caption-kind column, and the proposal gives the uniqueness key, the CHECK change and the vocabulary the copy event's channel field uses.
**Status:** upheld

### [WARN] party-architect — "Dropped or ignored" for `Brief.channels` leaves the merge's blast radius undefined

**Quotes:** > The wizard's channel picker goes, and `Brief.channels` is dropped or ignored (the plan decides).
**Quotes:** > `generate_post` makes the general caption only.
**Problem:** Dropping the column means every writer and reader of `Brief.channels` changes in the same commit, plus a migration and a down script. Ignoring it leaves a field that is still written and never read. The proposal names only the wizard as a surface that sets channels. It also changes `generate_post`, another surface that creates posts, without saying whether that tool's input still accepts or writes channels. Nothing in the artifact lists who else writes or reads the field, so neither option's set of co-changes is stated. party-po (ignore) and party-visionary (drop) recommend opposite answers, which shows the decision is still open.
**Fix:** Decide drop or ignore. List every surface that writes or reads `Brief.channels` (the wizard, `POST /api/briefs`, MCP and ACP `generate_post`, and any other the plan finds), and say what each does with it after the merge.
**Status:** upheld

### [WARN] party-architect — The curate, regenerate and delete routes and their claim actions are unnamed, and undo depends on history the proposal never extends

**Quotes:** > The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
**Quotes:** > Shared enums and the caption store invariants (the FAILED-row CHECK, the claim and settle actions) are the risk areas
**Quotes:** > Can the general caption be regenerated on its own? The proposed default is yes, using today's per-channel regenerate route, with general as one more target.
**Problem:** The proposal reuses the regenerate route, but it never says how the first curate (which creates a row where none exists) or a delete reaches the caption store. It doesn't say whether either goes through that same route or a new one, or which claim and settle action each runs under. If curate or delete becomes a new action value, the analytics coverage contract must carry one more value, and the proposal doesn't list it. Undo is promised through "the draft's history", but the proposal never says that history records caption content, and it lists no change to it. If the history doesn't already record captions, the undo promise has no mechanism. Delete has no undo at all. party-security's BLOCK on data loss reaches the same missing mechanism from the data-loss side. This finding covers the unstated route and action contract.
**Fix:** Name the route for curate, regenerate and delete, the claim action each one uses (existing or new), what the draft's history records for a caption change, and whether delete can be undone.
**Status:** upheld

### [WARN] party-architect — The facts check recompute list leaves out delete and undo, so the stored result can go stale

**Quotes:** > It runs on the headline, the general caption and every curated caption. It recomputes on curate, regenerate and edit. It shows a notice only; nothing is held.
**Problem:** The check's result is computed over the whole set of captions. Deleting a curated caption that held the flagged value, or undoing a regenerate, changes that set. Neither is in the recompute list, so the notice would stay up for a caption that no longer exists, or miss one that came back. Every caption writer must also call the recompute in the same commit. The proposal lists three triggers, but its own action list has five writers (curate, regenerate, edit, delete and undo), plus "Generate general caption" on old drafts.
**Fix:** State that the check recomputes on every write to the caption set, including delete, undo and the general-caption backfill. Or name the single function that every caption writer calls.
**Status:** upheld

### [WARN] party-architect — On an old draft with no general caption, the curate input is undefined

**Quotes:** > Old drafts that already have Instagram or LinkedIn caption rows show them as curated captions. Such a draft offers "Generate general caption".
**Quotes:** > Each produces one caption for that channel, written from the post (the brief, kit voice, post style, project briefing and the general caption).
**Problem:** The curated-caption prompt takes the general caption as an input. An old draft has none until the user runs "Generate general caption". The proposal doesn't say what happens when a user curates on such a draft, or regenerates a migrated Instagram or LinkedIn row. It could be refused, run without that input, or generate the general caption first. The same gap reaches `get_draft`, which "returns the general caption plus any curated ones", and the Copy button. Two implementers would handle the missing value differently.
**Fix:** State what curate does when no general caption exists: refuse with a named error, generate the general caption first, or leave the input out. Also state what `get_draft` returns for that field.
**Status:** upheld

### [WARN] party-architect — The Facebook rules name no source for the link and no layer that enforces them, so the E2E cases can only test the mock

**Quotes:** > **Facebook:** 40 to 120 words, a clear call to action with the website link, and 0 to 3 hashtags.
**Quotes:** > Rewrite the E2E suites `captions` and `caption-route`, and add Facebook and copy cases.
**Problem:** "The website link" does not trace to any field the proposal names: not the brief, the kit or the project. The implementer has to guess where it is read from and what happens when it is missing. The proposal also doesn't say whether the word count and hashtag limits are only prompt instructions or are checked in code after generation. If they are only in the prompt, a deterministic E2E case under the model mock can only assert what the mock returns, not that the rule holds. If they are checked in code, the proposal must specify the validator and what happens on a violation. party-security (trust in the link) and party-ba (falsifiable criteria) own the other parts of this line. This finding stays limited to the unnamed field contract and the missing test seam.
**Fix:** Name the field the link comes from and the behaviour when it is empty. State whether the Facebook limits are checked in code. If they are, name the pure function and the outcome of a violation, so that the tests run against that function and not the model.
**Status:** upheld

### [WARN] party-architect — The download and copy events have no named emitter, and Download belongs to 037

**Quotes:** > New events for a curated caption generated (with its channel and outcome), a caption copied (with its channel, general included) and a post downloaded. Each event has one emitter and carries no text.
**Quotes:** > Every caption (general and curated) has a Copy button. Download is 037's single button.
**Problem:** The proposal says Download is 037's button, then defines the "post downloaded" event here. One emitter per event needs one owner. If 037's Download route already emits a download event, this would be a second one. If it doesn't, this change edits 037's route, and that co-change goes unnamed. A copy happens in the browser, but the proposal doesn't say how a copy in the browser becomes a stored event: through which endpoint, and whether team and user come from the session or from the payload. Different answers give different server contracts. party-security's WARN on forged copy events depends on the same unnamed path.
**Fix:** State which change emits the download event and at which route. Name the path that records the copy event: an existing client-event endpoint extended to accept it, or a new route.
**Status:** upheld

### [WARN] party-architect — The `get_draft` response shape changes without a stated schema

**Quotes:** > `get_draft` returns the general caption plus any curated ones. `generate_post` makes the general caption only. The ACP manifest version goes up.
**Problem:** External MCP and ACP clients share this contract, and the proposal lists "the MCP/ACP response shape" as one reason the change is architectural. It never gives the shape. These questions are open:

- Is the general caption a top-level field or an entry in a list?
- Are curated captions keyed by channel, or a list of rows?
- Do migrated Instagram and LinkedIn rows look the same as new curated ones?
- Is a missing general caption null or absent?
- Do the route stamps and the facts-check result travel with each caption?

Raising the manifest version without the new schema leaves each surface to invent its own. party-visionary (fixed fields or a keyed list) and party-security (facts status in the response) each name a field this schema has to settle.
**Fix:** Write the new `get_draft` caption JSON shape into the proposal, including the null case for old drafts, and state whether MCP and ACP return the same shape.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's two slices: the caption vocabulary and the `get_draft` shape are coupled to the general caption, not to curation

**Quotes:** > new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner. Each `ALTER TYPE … ADD VALUE` goes in its own migration, with a down script.
**Quotes:** > one platform-neutral general caption is generated with every post.
**Quotes:** > Old drafts that already have Instagram or LinkedIn caption rows show them as curated captions. Such a draft offers "Generate general caption".
**Quotes:** > `get_draft` returns the general caption plus any curated ones.
**Problem:** party-po's NOTE says slice 2 (curated captions) "carries most of the enum and migration risk". Structurally that is not what the proposal's text implies, and this is a coupling fact, not an opinion on release order:

- **Storage.** Slice 1 stores a general caption on every post. Whichever representation is chosen, a new `Channel` value or a caption-kind column, its migration and its effect on the uniqueness key and the FAILED-row CHECK come with the general caption. Only the Facebook value is tied to curation.
- **`get_draft` shape.** Slice 1 includes the MCP and ACP shape, and the proposal says old drafts' Instagram and LinkedIn rows "show them as curated captions". So that shape must already represent curated captions, and the general caption being missing, at the moment the general caption exists. Settling it later would change a published response a second time.

The vocabulary decision, its migration and the `get_draft` caption shape are therefore coupled to the general caption.
**Fix:** If the panel's two slices are adopted, record that the caption vocabulary decision, its migration and the full `get_draft` caption shape must land with the general caption. What is coupled to curation is the Facebook `ADD VALUE`, the curate, regenerate and delete paths, and the Facebook rules.
**Status:** upheld

### [WARN] party-ba — The stated goal "curated" has no defined meaning, so no criterion can verify it

**Quotes:**

> a small option under it to generate a curated caption for Instagram, LinkedIn or Facebook separately
> Instagram and LinkedIn: today's rules.
> **Problem:** "Curated" is load-bearing (it is the title and the core feature) and is never defined. It could mean "channel-tailored rewrite of the general caption", "hand-picked or edited by the user", or "adheres to a channel rule set". Two readings produce different builds: a derived rewrite, or an independent generation. The proposal also gives no observable difference between a curated Instagram caption and the general caption. "Today's rules" are cited by reference and not stated, so the criterion cannot be checked from this artifact.
> **Fix:** Define "curated" in one sentence and state, per channel, the measurable rules (length, hashtags, call to action) that make a caption count as curated.
> **Status:** upheld

### [WARN] party-ba — Acceptance criteria are absent for the main claim

**Quotes:**

> The full mock suite stays green.
> Facebook: 40 to 120 words, a clear call to action with the website link, and 0 to 3 hashtags.
> **Problem:** The only stated pass condition is "suite stays green", which cannot fail on the new behaviour, and the proposal itself says the old caption suites are being rewritten. The Facebook rule is a requirement and not a check. Nothing says what happens if the model returns 130 words, no link, or 5 hashtags (reject, retry, trim or flag). "A clear call to action" is subjective. The "website link" has no stated source, and the brief, kit and project are not named as holding one. There is no criterion that a curated caption is consistent with the general caption, even though that is the stated reason for passing it in.
> **Fix:** Add falsifiable criteria: a Facebook caption outside 40 to 120 words or with more than 3 hashtags fails, name where the link comes from and what happens when none exists, and say how consistency with the general caption is observed.
> **Status:** upheld

### [WARN] party-ba — "General caption" is a platform-neutral caption yet is treated as a channel and copied as one

**Quotes:**

> one platform-neutral general caption is generated with every post
> The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column
> a caption copied (with its channel, general included)
> **Problem:** The proposal calls the general caption "platform-neutral" but gives it a "channel" in analytics and rules. It is unclear what rules (length, hashtags) govern it. Old drafts' Instagram and LinkedIn captions "show them as curated captions" while the draft offers "Generate general caption", which conflicts with "generated with every post". The general caption's regenerate is left as an open question while the same text says "at most one per channel", so it is unclear whether the general caption counts under that rule.
> **Fix:** State the general caption's own rules and say whether it is a channel, a kind, or neither. Settle the old-draft behaviour (general caption missing) explicitly.
> **Status:** upheld

### [NOTE] party-ba — The problem rests on one user request, with no evidence of the pain

**Quotes:**

> With publishing gone (037), the user (2026-10-28) wants:
> **Problem:** The need for per-channel curated captions, and for Facebook in particular, is asserted from a single stated want. The proposal does not establish that the audience behaves that way (opens a post, picks a channel, regenerates). The Insights and metrics section would be the way to test it after ship, but no success threshold is stated.
> **Fix:** State what usage would show the feature is not wanted, for example a target curate rate.
> **Status:** upheld

### [WARN] party-po — Cheaper variant never considered: curate on demand for three channels with a full CRUD surface

**Quotes:**

> The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
> Under the general caption, three actions: Curate for Instagram, LinkedIn or Facebook.
> **Problem:** The proposal does not consider a smaller variant. For example: keep curate and copy, and drop the separate regenerate and delete. Curating again would replace the caption, and the edit-in-place stays. Each extra action is a route, a test case, an event and UI copy that the proposal pays for forever. Curated captions are already optional, and the proposal gives no usage number for them.
> **Fix:** Name the minimal variant (curate, which replaces on re-run, plus copy) and say why edit, delete and separate regenerate are worth their cost. Otherwise cut them.
> **Status:** upheld

### [WARN] party-po — Scope with no stated value: analytics and Insights section

**Quotes:**

> New events for a curated caption generated (with its channel and outcome), a caption copied (with its channel, general included) and a post downloaded. Each event has one emitter and carries no text.
> Insights adds a small section: curated captions per channel, and downloads and copies per day.
> **Problem:** The proposal does not say what decision these metrics inform. The analytics events exist partly to satisfy `analyticsCoverage.test.ts` (a test-driven reason), which is a cost reason and not a value reason. A new Insights section adds UI, queries and tests for an internal tool with a small user base. The "downloads and copies per day" chart in particular returns no stated value.
> **Fix:** Ship only the events the coverage test needs. Defer the Insights section until someone asks a question it answers.
> **Status:** upheld

### [WARN] party-po — Running cost of generation is unstated

**Quotes:**

> one platform-neutral general caption is generated with every post.
> Each produces one caption for that channel, written from the post (the brief, kit voice, post style, project briefing and the general caption).
> **Problem:** There is no number for model calls per post. Today there are two caption calls (or one combined call, which the proposal does not say). After the change there is one general caption call per post, plus up to three curated calls, each with a larger prompt that includes the general caption and the project briefing. The proposal never says whether this is cheaper or dearer than today, or whether the general caption adds a call beyond the headline call.
> **Fix:** State calls and approximate tokens per post: default, and worst case with all three curated plus regenerates.
> **Status:** upheld

### [NOTE] party-po — Name the cut line and drop optional data-model deferral

**Quotes:**

> `Brief.channels` is dropped or ignored (the plan decides).
> new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner. Each `ALTER TYPE … ADD VALUE` goes in its own migration, with a down script.
> **Problem:** The proposal bundles about 50 files, and it leaves the biggest cost decisions open. A natural cut line exists. Slice 1: the general caption, Copy and Download events, MCP/ACP shape. Slice 2: curated captions with Facebook, edit and regenerate. Slice 1 delivers the user's stated default behaviour (one caption, copyable) alone. Slice 2 also carries most of the enum and migration risk. The proposal does not name this order.
> **Fix:** Name the two slices and ship slice 1 first. Decide `Brief.channels` as ignored (no migration) to avoid a pointless drop.
> **Status:** upheld

### [BLOCK] party-security — The Facebook call to action's link has no stated source and no check, so a link the model makes up goes straight to the Copy button

**Quotes:**

> - **Facebook:** 40 to 120 words, a clear call to action with the website link, and 0 to 3 hashtags.
>
> 4. **Copy.** Every caption (general and curated) has a Copy button. Download is 037's single button.
> 5. **Facts check.** It runs on the headline, the general caption and every curated caption. It recomputes on curate, regenerate and edit. It shows a notice only; nothing is held.
>    **Problem:** The proposal makes "the website link" mandatory in every Facebook caption but never says where it comes from. If the model writes it, the link is untrusted output: a made-up domain, a lookalike, or a URL planted through the brief or project briefing. It ends up in a public call to action that the user copies. Because the rule makes the link mandatory, an invented URL is what you should expect whenever the post has no real link. The facts check is the only check named, and the proposal does not say it covers URLs. In round 2, party-architect ("names no source for the link") and party-ba ("The 'website link' has no stated source") reached the same gap on their own. No seat showed a source or a check that I missed.
>    **Fix:** Take the link from one stored, validated field that an admin sets (kit or project website, https only). Either code inserts it, or code rejects any caption whose URLs do not exactly match that field, with a named error. When no stored link exists, leave the link out and say so in the UI. Never ask the model to supply a link. Have the facts check flag any URL in any caption that is not in the brief, kit or project sources.
>    **Status:** upheld

### [BLOCK] party-security — Regenerate and delete destroy a caption, possibly edited by hand, and the only recovery is an undo the proposal claims but never establishes

**Quotes:**

> - The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
>   **Problem:** Regenerate "replaces" the caption, and its only recovery is "the draft's history allows undo". The proposal never says that caption text, or a hand edit of it, is written to that history. Delete has no recovery path at all. The proposal also does not say the old caption survives a failed regenerate. If the new row is written before the model call settles, a failure replaces a good caption with an error row. party-architect independently found that undo "depends on history the proposal never extends" and that "Delete has no undo at all", which supports this. party-po's cheaper variant (re-curate replaces) does not remove the problem. It moves the same unrecoverable overwrite onto the curate action.
>   **Fix:** State that every caption write (curate, regenerate, inline edit, delete) records the previous text in the draft's history and that undo restores it. A regenerate replaces the stored caption only after the new one settles successfully. On failure the old caption stays and the error shows next to it. Make delete undoable from the history, or make it a soft delete.
>   **Status:** upheld

### [WARN] party-security — Who may curate, regenerate, edit or delete a caption is not stated, and each click spends tokens with no cap

**Quotes:**

> - Under the general caption, three actions: Curate for Instagram, LinkedIn or Facebook.
> - The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
>   **Problem:** "The user" is never tied to a role. These are new write actions that change a post and spend the team's caption credential through `selectRoute('CAPTION')`. Without a server-side gate, any member who can see a post can overwrite or delete captions on someone else's post. Nothing caps curate or regenerate calls per draft, user or team, so a script or a stuck client means unbounded spend. No round-1 finding states this gate or cap in the proposal.
>   **Fix:** State the gate: only the post's author and team admins may curate, regenerate, edit or delete. Every other member gets 403, enforced in every route and not only in the UI. Allow one curate or regenerate in flight per draft and channel (use the existing claim), and add a per-user rate limit on the curate route.
>   **Status:** upheld

### [WARN] party-security — The general caption is model output, and passing it into every curated prompt spreads any made-up fact into all three channels

**Quotes:**

> - **Decided (user, 2026-10-28):** a curated caption is written from the brief, the kit voice, the post style and the project briefing, with the general caption passed in as context so the facts and offers stay consistent.
> - Each produces one caption for that channel, written from the post (the brief, kit voice, post style, project briefing and the general caption).
>   **Problem:** The general caption is model output, or a user's inline edit of it, and it is fed back as a source for every curated caption. A number, date or offer the model invented in the general caption gets copied into the Instagram, LinkedIn and Facebook captions. If the facts check also counts the general caption as a source, the invented value is checked against itself and passes, so the model's own output grades its next output. The proposal never says which sources the check compares curated captions against. party-architect's finding on old drafts with no general caption and party-visionary's provenance NOTE confirm that the general caption is a live input with no stated status. Neither one closes the self-grading path.
>   **Fix:** State that the facts check's sources stay the brief, the kit voice text and the project briefing and documents, and never include any caption. If the general caption is `flagged`, show that before a curate runs, and again on each curated caption that repeats the flagged value.
>   **Status:** upheld

### [WARN] party-security — The MCP and ACP read returns caption text without the facts flag, so the only safeguard left is invisible on the machine surface

**Quotes:**

> 8. **MCP and ACP.** `get_draft` returns the general caption plus any curated ones. `generate_post` makes the general caption only. The ACP manifest version goes up. 5. **Facts check.** It runs on the headline, the general caption and every curated caption. It recomputes on curate, regenerate and edit. It shows a notice only; nothing is held.
> **Problem:** With holding gone, the facts notice is the only signal that a caption contains an unsupported value. `generate_post` runs unattended, and its caption reaches an external agent through `get_draft`. The proposal lists the caption text in that response but not the facts status, so an agent gets a flagged caption that looks exactly like a clean one. party-architect's `get_draft` schema finding asks the same question ("Do route stamps and the facts-check result travel with each caption?") but as a contract gap. The failure mode, where a flag nobody can see lets a flagged caption pass as clean, belongs to this seat.
> **Fix:** Have `get_draft` and its ACP counterpart return each caption's facts status (`clear`, `flagged` or `error`) and its matched values next to the text. Document that clients must treat `flagged` and `error` as needing review.
> **Status:** upheld

### [WARN] party-security — The copy event must come from the browser, so any member can forge it and it has no stated bound

**Quotes:**

> - New events for a curated caption generated (with its channel and outcome), a caption copied (with its channel, general included) and a post downloaded. Each event has one emitter and carries no text.
> - Insights adds a small section: curated captions per channel, and downloads and copies per day.
>   **Problem:** A copy only happens in the browser, so the client has to send "caption copied" to the server. Any signed-in member can then replay or make up copy events, inflating "copies per day" and appending to the event store without limit. The proposal names no validation and no rate limit. party-architect independently found that the copy event's seam is unnamed. party-po's proposal to defer the Insights section would lower the impact of inflated numbers, but the client-writable event would still ship, because the coverage test needs it. The finding stands either way.
>   **Fix:** Accept the copy event only through the existing session-scoped client-event path, with team, user and source taken from the session. Check that the draft belongs to the caller's team and that the channel is in the caption registry, and reject anything else. Allow at most one event per user, draft and channel in a short window. Emit the download event from the server's download route. Label copies in Insights as client-reported.
>   **Status:** upheld

### [WARN] party-security — Rolling back the enum migration means deleting every general and Facebook caption, and a dropped `Brief.channels` has no recovery path

**Quotes:**

> - The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner. Each `ALTER TYPE … ADD VALUE` goes in its own migration, with a down script.
>
> 1. **Default generation.** The on-image headline stays, and one platform-neutral general caption is generated with every post. No channel caption is generated until asked for. The wizard's channel picker goes, and `Brief.channels` is dropped or ignored (the plan decides).
>    **Problem:** Postgres cannot drop an enum value while rows still use it. Every post gets a general caption, so a down script for `ADD VALUE` either fails partway or must first delete every general (and Facebook) caption. The proposal does not say which, so an operator who rolls back can silently wipe the captions this change creates. party-visionary's BLOCK reaches the same point from the design side ("reversible in name only"). This finding is about the runtime rollback: what the operator's down script does to live rows. Dropping `Brief.channels` also destroys data that no down script can bring back.
>    **Fix:** Make the down script fail closed. It counts the rows that use the new values, refuses with that count, and deletes only when the operator passes an explicit flag. Prefer ignoring `Brief.channels` over dropping it. If it is dropped, document a pre-migration `pg_dump` of the column next to the down script.
>    **Status:** upheld

### [NOTE] party-security — Rebuttal to party-visionary's "drop the column" fix: dropping `Brief.channels` is safe only with a stated recovery step

**Quotes:**

> The wizard's channel picker goes, and `Brief.channels` is dropped or ignored (the plan decides).
> **Problem:** party-visionary's finding on `Brief.channels` concludes "Decide in the proposal: drop the column." I agree the decision belongs in the proposal, and the risk of reviving a dead field that looks live is real. But a drop is the one choice with a runtime effect that cannot be undone. Once it runs, the down script can recreate the column but not its values. party-po's fix ("Decide `Brief.channels` as ignored (no migration)") avoids that effect completely. The two fixes conflict, and the irreversibility is the deciding factor under this lens. It is not a reason to keep the field. It means a drop must carry its recovery step.
> **Fix:** If the user picks drop, the migration must ship with a documented pre-drop dump of the column, and the down script must say it restores the schema only. If the user picks ignore, mark the field deprecated in the schema as party-visionary suggests, which handles the reuse risk without destroying data.
> **Status:** upheld

### [BLOCK] party-visionary — Whether "general" is a Channel is the one-way decision, and it is deferred to the plan as an implementation detail

**Quotes:**

> The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner. Each `ALTER TYPE … ADD VALUE` goes in its own migration, with a down script.
> New events for a curated caption generated (with its channel and outcome), a caption copied (with its channel, general included) and a post downloaded.
> `get_draft` returns the general caption plus any curated ones.
> **Problem:** The choice between "GENERAL is a `Channel` value" and "a caption-kind column" lands in three places that a later change cannot rewrite. (1) The Postgres enum: every post gets a general caption, so once GENERAL rows exist on every draft, the promised down script can only remove the value by deleting or remapping every post's general caption. That makes the down script reversible in name only. (2) The analytics events: the proposal already commits the copy event to carry "channel, general included", so the event payload has decided that general is a channel before the plan chooses. Those append-only rows keep that meaning whatever the schema later becomes. (3) The MCP/ACP `get_draft` response: external clients will key on whatever axis ships. The artifact calls the choice "whichever the plan finds cleaner" and does not mark it as permanent, so the user would accept a permanent vocabulary without having decided one. After 037, `Channel` will also mean "a platform a caption is written for" (publishing is gone). Putting a non-platform value into it changes what the type means for every later reader. Round 2: party-architect reaches the same open choice from the merge-day side (four contracts depend on it), and party-security shows that the down script for the enum addition must delete every general caption. Together these confirm that the decision is both load-bearing now and irreversible later.
> **Fix:** Decide in the proposal, not the plan, whether general is a channel or a caption kind. Make the analytics payload and the `get_draft` shape follow that decision. State plainly that the enum addition is effectively one-way once rows exist.
> **Status:** upheld

### [WARN] party-visionary — "At most one per channel" plus general-as-a-channel sets the template the excluded languages change will have to undo

**Quotes:**

> It is saved on the post next to the general caption, at most one per channel.
> Caption languages other than English, and hashtag research.
> **Problem:** The proposal names the next change on this surface: captions in another language. That change needs a general caption in Sinhala next to the English one, and a curated Instagram caption per language. The uniqueness rule (one per channel per draft) has to widen to (channel, language), and every reader that assumes one caption per key has to change too: copy, facts check, `get_draft`, the regenerate route, and the Insights counts. If general is a `Channel` value, the next contributor will likely follow the template and add another axis value to the same enum, because that is how this change added a non-platform caption. The pattern is right for one more platform (Threads, X) and wrong for any other dimension of a caption, and nothing in the artifact separates those two cases.
> **Fix:** Name the caption's identity as a key that can grow, such as (kind, channel) with room for a language. Alternatively, record in the artifact that the uniqueness key is expected to widen and which column is meant to carry new dimensions.
> **Status:** upheld

### [WARN] party-visionary — The registry and the Prisma enum become two copies of the channel list with no stated guard

**Quotes:**

> `CAPTION_CHANNELS` is no longer the publish list. `CaptionKey`, `FACT_WHERE` and the prompt budget come from the registry.
> Each `ALTER TYPE … ADD VALUE` goes in its own migration, with a down script.
> **Problem:** Deriving `CaptionKey`, `FACT_WHERE` and the budget from the registry is the right compounding move, but the database enum is still a second, hand-kept copy. Take the next change that adds a fourth curated channel, the most likely follow-up to adding Facebook. It must add an enum migration, a registry entry, that channel's rules, the analytics catalogue's channel vocabulary and an ACP manifest bump, and the artifact names no check that fails if only some of these are edited. If the enum value lands without its registry entry, rows are silently hidden. If the registry entry lands without the migration, the first curate attempt fails at write time in production, not in a unit test.
> **Fix:** State which list is authoritative and add a guard test that fails when the registry and the `Channel` enum disagree, so adding a channel is one checklist the test enforces.
> **Status:** upheld

### [WARN] party-visionary — The `get_draft` caption shape becomes a published contract before its extensibility is decided

**Quotes:**

> `get_draft` returns the general caption plus any curated ones. `generate_post` makes the general caption only. The ACP manifest version goes up.
> **Problem:** MCP and ACP clients are external agents. Once a client parses the new response, its shape cannot be changed without a breaking manifest bump. The artifact does not say whether curated captions come back as fixed named fields (instagram, linkedin, facebook) or as an open list keyed by channel or kind. With fixed fields, the next channel addition and the languages change are both breaking changes to a published interface. With an open list, they are additive. This is the cheapest moment to choose, and the proposal does not choose. Round 2: party-architect asks for the shape to be written down, and party-security asks for a facts-check status per caption. Both are additive fields per entry, which an open keyed list carries for free and a set of fixed top-level fields does not.
> **Fix:** Commit in the artifact to an open, keyed list for captions in the `get_draft` response, with general carried as a kind and not as a special top-level field, so later caption kinds and per-caption fields (route stamp, facts status) are additive.
> **Status:** upheld

### [WARN] party-visionary — Legacy drafts make "this post has no general caption" a permanent state that every later caption reader must handle

**Quotes:**

> Old drafts that already have Instagram or LinkedIn caption rows show them as curated captions. Such a draft offers "Generate general caption".
> **Problem:** This creates a second, lasting shape for a post: curated captions with no general caption. Those curated captions were not written from a general caption, so their provenance differs from every caption 039 creates. Every later change that reads captions inherits the branch: the languages change, a library caption search, project-level caption defaults, `get_draft` consumers and the Insights counts. My reasoning depends on something the artifact does not state: how many such drafts exist. If the deployment starts with no imported posts, the branch may serve almost no rows and still cost every future reader a test case. Round 2: party-architect's finding that curate has no defined input on such a draft shows that the branch reaches the generation path as well as the readers, which strengthens this finding.
> **Fix:** Count the drafts this applies to. If the count is negligible, backfill a general caption or leave old rows as read-only history. If the branch stays, name the single reader that hides it, so later changes do not each rediscover it.
> **Status:** upheld

### [WARN] party-visionary — "Dropped or ignored" leaves `Brief.channels` as a field that looks live but means nothing

**Quotes:**

> The wizard's channel picker goes, and `Brief.channels` is dropped or ignored (the plan decides).
> **Problem:** If the plan picks "ignored", the brief keeps a populated column whose values describe a picker that no longer exists. The next plausible change, a project-level default for which curated captions to generate (038 makes projects the owner of post defaults), will find `Brief.channels` filled with plausible-looking data and either read it or try to revive it. Nothing will say the field is dead. An ignored field is also a no-op input wherever briefs are created through external surfaces, which keeps a meaningless parameter in that contract. Round 2: party-security and party-po both prefer "ignore" to avoid a destructive drop. That is a fair merge-day argument, and I accept either outcome. The long-horizon cost comes only from leaving the field ignored without a marker.
> **Fix:** Decide in the proposal. Dropping the column is cleanest. If it is kept (as security and po prefer), record it as deprecated in the schema comment and in the docs where the schema is described, stop every writer from setting it, and remove it from the `generate_post` input, so the next contributor does not reuse it.
> **Status:** upheld

### [NOTE] party-visionary — Curated captions are derived from the general caption but record nothing about which version they came from

**Quotes:**

> a curated caption is written from the brief, the kit voice, the post style and the project briefing, with the general caption passed in as context so the facts and offers stay consistent.
> regenerate it (which replaces it; the draft's history allows undo)
> **Problem:** A curated caption depends on the general caption, and the general caption can be edited or regenerated on its own. The obvious follow-up is a "this Instagram caption predates your general caption edit" notice, the caption counterpart of the stale-headline notice. That feature needs each curated row to record which general caption it was written from, such as a hash or revision of that text. If 039 does not record it, every curated caption written until then has an unknown origin, and the information cannot be backfilled.
> **Fix:** Store a hash or revision reference of the general caption on each curated caption when it is written. It is one small column, and it makes a later staleness check free for every row from day one.
> **Status:** upheld

### [NOTE] party-visionary — The Facebook rules are measurable data but are framed as prompt instructions, one step short of a channel rules registry

**Quotes:**

> **Facebook:** 40 to 120 words, a clear call to action with the website link, and 0 to 3 hashtags.
> **Instagram and LinkedIn:** today's rules.
> **Problem:** Word range, hashtag count and link presence can all be checked by code. If the registry already feeds `CaptionKey`, `FACT_WHERE` and the prompt budget, these rules could be registry fields that feed both the prompt and a post-generation check. That would work like the facts check, which already compares captions without a model call. The artifact keeps them as prose ("today's rules"). That leaves the next channel's rules as prompt text that nothing verifies, and leaves Instagram and LinkedIn's rules implicit, so they cannot be compared side by side. Round 2: party-architect (no enforcing layer, so E2E can test only the mock), party-ba (no falsifiable criteria) and party-security (the link must come from a stored field and be checked by code) each need the same seam on merge day. A rules entry per channel answers all three and gives every later channel the same treatment.
> **Fix:** Put each channel's measurable rules (word range, hashtag range, link required, and the stored field the link comes from) in the registry entry. Then adding a channel is one data entry that gives prompt wording and a conformance check together.
> **Status:** upheld

### [WARN] party-visionary — Rebuttal to party-po's slice order: shipping slice 1 first fixes the caption vocabulary and the `get_draft` shape before curated captions exist to test them

**Quotes:**

> The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner.
> **Problem:** party-po suggests shipping the general caption, the events and the MCP/ACP shape as slice 1, with curated captions in slice 2. On merge day, that is cheaper. Over the longer horizon, slice 1 would publish the copy-event payload ("channel, general included"), write general-caption rows and set the `get_draft` response shape, all before any curated caption exists. Those are the three commitments my BLOCK names as irreversible. Slice 2 would then have to fit curated captions into a vocabulary and an external contract that were chosen without them, or ship a breaking manifest bump. I do not oppose slicing. I object to slicing while the vocabulary is still undecided.
> **Fix:** Slice only after the proposal decides between kind and channel, and fixes `get_draft` as an open keyed list. Slice 1 then ships the final shape with one entry in it, and slice 2 is purely additive.
> **Status:** upheld

## Dissent

No withdrawals.
