### [WARN] party-architect — The caption vocabulary is left open, and four contracts in the proposal depend on the choice

**Quotes:** > The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner.
**Quotes:** > These events become the `Channel` carrier `analyticsCoverage.test.ts` needs.
**Quotes:** > It is saved on the post next to the general caption, at most one per channel.
**Problem:** The two options produce different systems. If the general caption becomes a `Channel` value, a channel that is not a channel lives in the enum that the analytics coverage test, `CaptionKey`, `FACT_WHERE` and the uniqueness rule ("at most one per channel") all read. If it becomes a separate caption-kind column, every caption row is classified by two fields at once (kind and channel). The uniqueness key, the FAILED-row CHECK the proposal lists as a risk, and the copy event's "channel, general included" field then need a second vocabulary next to `Channel`. In that case the events cannot be "the `Channel` carrier", because "general" is not a `Channel` value. The proposal sizes itself as architectural because "it changes the caption data model", yet it leaves that same model to the plan. Two implementers would build incompatible schemas, events and MCP shapes.
**Fix:** Choose in the proposal. Either `GENERAL` is a `Channel` value (and say how a non-channel value fits the registry and the coverage test), or there is a caption-kind column (and give the uniqueness key, the CHECK change, and the vocabulary the copy event's channel field uses).
**Status:** upheld

### [WARN] party-architect — "Dropped or ignored" for `Brief.channels` leaves the merge's blast radius undefined

**Quotes:** > The wizard's channel picker goes, and `Brief.channels` is dropped or ignored (the plan decides).
**Quotes:** > `generate_post` makes the general caption only.
**Problem:** Dropping the column means every writer and reader of `Brief.channels` changes in the same commit, plus a migration and a down script. Ignoring it leaves a field that is still written and never read. The proposal names only the wizard as a surface that sets channels. It also changes `generate_post`, another surface that creates posts, without saying whether that tool's input still accepts or writes channels. Nothing in the artifact lists who else writes or reads the field, so neither option's co-change set is stated.
**Fix:** Decide drop or ignore. List every surface that writes or reads `Brief.channels` (wizard, `POST /api/briefs`, MCP and ACP `generate_post`, and any other the plan finds), and say what each does with it after the merge.
**Status:** upheld

### [WARN] party-architect — The curate, regenerate and delete routes and their claim actions are unnamed, and undo depends on history the proposal never extends

**Quotes:** > The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
**Quotes:** > Shared enums and the caption store invariants (the FAILED-row CHECK, the claim and settle actions) are the risk areas
**Quotes:** > Can the general caption be regenerated on its own? The proposed default is yes, using today's per-channel regenerate route, with general as one more target.
**Problem:** The proposal reuses the regenerate route but never says how the first curate (creating a row where none exists) or a delete reaches the caption store. It doesn't say whether either goes through that same route or a new one, or which claim and settle action each runs under. If curate or delete becomes a new action value, that is one more value the analytics coverage contract must carry, and the proposal doesn't list it. Undo is promised through "the draft's history", but the proposal never says that history records caption content or lists a change to it. If it doesn't already record captions, the undo promise has no mechanism. Delete has no undo at all.
**Fix:** Name the route for curate, regenerate and delete, the claim action each uses (existing or new), what the draft's history records for a caption change, and whether delete can be undone.
**Status:** upheld

### [WARN] party-architect — The facts check recompute list leaves out delete and undo, so the stored result can go stale

**Quotes:** > It runs on the headline, the general caption and every curated caption. It recomputes on curate, regenerate and edit. It shows a notice only; nothing is held.
**Problem:** The check's result is computed over the whole set of captions. Deleting a curated caption that held the flagged value, or undoing a regenerate, changes that set. Neither is in the recompute list, so the notice would stay up for a caption that no longer exists, or miss one that came back. Every caption writer must also call the recompute in the same commit. The proposal lists three triggers, but its own action list has five writers (curate, regenerate, edit, delete, undo), plus "Generate general caption" on old drafts.
**Fix:** State that the check recomputes on every write to the caption set, delete, undo and general-caption backfill included, or name the single function that every caption writer calls.
**Status:** upheld

### [WARN] party-architect — On an old draft with no general caption, the curate input is undefined

**Quotes:** > Old drafts that already have Instagram or LinkedIn caption rows show them as curated captions. Such a draft offers "Generate general caption".
**Quotes:** > Each produces one caption for that channel, written from the post (the brief, kit voice, post style, project briefing and the general caption).
**Problem:** The curated-caption prompt takes the general caption as an input. An old draft has none until the user runs "Generate general caption". The proposal doesn't say whether curate (or regenerating a migrated Instagram or LinkedIn row) on such a draft is refused, runs without that input, or generates the general caption first. The same gap reaches `get_draft`, which "returns the general caption plus any curated ones", and the Copy button. Two implementers would handle the null differently.
**Fix:** State what curate does when no general caption exists (refuse with a named error, generate it first, or omit the input), and what `get_draft` returns for that field.
**Status:** upheld

### [WARN] party-architect — The Facebook rules name no source for the link and no layer that enforces them, so the E2E cases can only test the mock

**Quotes:** > **Facebook:** 40 to 120 words, a clear call to action with the website link, and 0 to 3 hashtags.
**Quotes:** > Rewrite the E2E suites `captions` and `caption-route`, and add Facebook and copy cases.
**Problem:** "The website link" does not trace to any field the proposal names: not the brief, the kit or the project. The implementer has to guess where it is read from, and what happens when it is missing. The proposal also doesn't say whether the word count and hashtag limits are prompt instructions only, or checked in code after generation. If they are prompt-only, a deterministic E2E case under the model mock can only assert what the mock returns, not that the rule holds. If they are checked in code, there is a validator to specify, along with what happens on a violation.
**Fix:** Name the field the link comes from and the behaviour when it is empty. State whether the Facebook limits are checked in code (and if so, the pure function and the outcome of a violation) so the test seam is that function rather than the model.
**Status:** upheld

### [WARN] party-architect — The download and copy events have no named emitter, and Download belongs to 037

**Quotes:** > New events for a curated caption generated (with its channel and outcome), a caption copied (with its channel, general included) and a post downloaded. Each event has one emitter and carries no text.
**Quotes:** > Every caption (general and curated) has a Copy button. Download is 037's single button.
**Problem:** The proposal says Download is 037's button, then defines the "post downloaded" event here. One emitter per event needs one owner. If 037's Download route already emits a download event, this is a second one. If it doesn't, this change edits 037's route, and that co-change goes unnamed. Copy happens in the browser, but the proposal doesn't say how a client-side copy becomes a stored event: through which endpoint, with team and user taken from the session or from the payload. Different answers give different server contracts.
**Fix:** State which change emits the download event and at which route. Name the seam that records the copy event (an existing client-event endpoint extended to accept it, or a new route).
**Status:** upheld

### [WARN] party-architect — The `get_draft` response shape changes without a stated schema

**Quotes:** > `get_draft` returns the general caption plus any curated ones. `generate_post` makes the general caption only. The ACP manifest version goes up.
**Problem:** This contract is shared with external MCP and ACP clients, and the proposal lists "the MCP/ACP response shape" as one reason the change is architectural. It never gives the shape. Open questions include: is the general caption a top-level field or an entry in a list? Are curated captions keyed by channel or a list of rows? Do migrated Instagram and LinkedIn rows look the same as new curated ones? Is a missing general caption null or absent? Do route stamps and the facts-check result travel with each caption? Raising the manifest version without the new schema leaves each surface to invent its own.
**Fix:** Write the new `get_draft` caption JSON shape into the proposal, including the null case for old drafts, and state whether MCP and ACP return the same shape.
**Status:** upheld
