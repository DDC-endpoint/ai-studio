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
