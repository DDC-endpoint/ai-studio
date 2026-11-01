### [BLOCK] party-security — The Facebook call to action's link has no stated source and no check, so a link the model makes up goes straight to the Copy button

**Quotes:**

> - **Facebook:** 40 to 120 words, a clear call to action with the website link, and 0 to 3 hashtags.
>
> 4. **Copy.** Every caption (general and curated) has a Copy button. Download is 037's single button.
> 5. **Facts check.** It runs on the headline, the general caption and every curated caption. It recomputes on curate, regenerate and edit. It shows a notice only; nothing is held.
>    **Problem:** The proposal requires every Facebook caption to carry "the website link". It never says where that link comes from: a stored kit or project field, the brief, or the model. If the model writes the URL, it is untrusted output. It can be a made-up domain, a lookalike, or a URL planted by text in the brief or project briefing, and it lands in a call to action that the user copies and posts publicly. The facts check is the only check named, and the proposal lists only which captions it covers, not that it checks URLs. Because the rule says the link is mandatory, the model has to produce a link even when the post has none to give, so an invented URL is the expected result whenever no link exists, not a rare one. The output looks exactly like a correct caption.
>    **Fix:** Take the link from one stored, validated field (for example a kit or project website URL that an admin set, https only). Code inserts it, or code checks that every URL in the caption exactly matches the stored value and rejects the caption with a named error if not. When no stored link exists, the call to action leaves the link out and the UI says so. The model is never asked to supply one. Have the facts check flag any URL in any caption that does not appear in the brief, the kit or the project sources.
>    **Status:** upheld

### [BLOCK] party-security — Regenerate and delete destroy a caption, possibly edited by hand, and the only recovery is an undo the proposal claims but never establishes

**Quotes:**

> - The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
>   **Problem:** Regenerate "replaces" the caption, and its recovery rests on "the draft's history allows undo". The proposal never says caption text, or a hand edit of it, is written to that history. Delete has no recovery path at all. Two outcomes follow. (a) A user's hand-edited caption can be lost for good with one click, by its author or by anyone else allowed to act on the post. (b) The proposal does not say the old caption survives a failed regenerate (route error, timeout, a FAILED row). If the replacement is written before the model call settles, a failure swaps a good caption for an error row, and the operator has nothing to restore from.
>   **Fix:** Say that every caption write (curate, regenerate, inline edit, delete) records the previous text in the draft's history, and that undo restores it. A regenerate replaces the stored caption only once the new one has settled successfully. On failure the old caption stays and the error is shown next to it. Make delete either undoable from the history or a soft delete.
>   **Status:** upheld

### [WARN] party-security — Who may curate, regenerate, edit or delete a caption is not stated, and each click spends tokens with no cap

**Quotes:**

> - Under the general caption, three actions: Curate for Instagram, LinkedIn or Facebook.
> - The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
>   **Problem:** "The user" is never tied to a role. These are new write actions that mutate a post and spend tokens on the team's caption credential (point 6 routes them through `selectRoute('CAPTION')`). Without a stated gate, any member who can see a post can overwrite or delete captions on someone else's post and spend the team's credential. Nothing in the proposal caps how many curate or regenerate calls a post, a user or a team can make, so a script or a stuck client is an unbounded spend.
>   **Fix:** State the gate: only the post's author and team admins may curate, regenerate, edit or delete, and any other member gets 403. Check it on the server, in every route, not only in the UI. Add a per-draft limit of one curate or regenerate in flight per channel, enforced by the existing claim, and a per-user rate limit on the curate route.
>   **Status:** upheld

### [WARN] party-security — The general caption is model output, and passing it into every curated prompt spreads any made-up fact into all three channels

**Quotes:**

> - **Decided (user, 2026-10-28):** a curated caption is written from the brief, the kit voice, the post style and the project briefing, with the general caption passed in as context so the facts and offers stay consistent.
> - Each produces one caption for that channel, written from the post (the brief, kit voice, post style, project briefing and the general caption).
>   **Problem:** The general caption is written by the model, or edited inline by a user, and is then fed back as a source for the curated captions "so the facts and offers stay consistent". A number, date or offer that the model invented in the general caption gets copied into the Instagram, LinkedIn and Facebook captions. If the facts check counts the general caption as one of the post's sources, as "written from the post" suggests, the invented value is checked against itself and passes: the model's own output grades its next output. The proposal does not say which sources the facts check compares against for curated captions.
>   **Fix:** State that the facts check sources stay the brief, the kit voice text and the project briefing and documents, and never include any caption. When the general caption is `flagged`, show the flag before a curate runs. Show it again on each curated caption that repeats the flagged value.
>   **Status:** upheld

### [WARN] party-security — The MCP and ACP read returns caption text without the facts flag, so the only safeguard left is invisible on the machine surface

**Quotes:**

> 8. **MCP and ACP.** `get_draft` returns the general caption plus any curated ones. `generate_post` makes the general caption only. The ACP manifest version goes up. 5. **Facts check.** It runs on the headline, the general caption and every curated caption. It recomputes on curate, regenerate and edit. It shows a notice only; nothing is held.
> **Problem:** Holding is gone, so the facts notice is now the only signal that a caption contains an unsupported number, date or link. `generate_post` runs unattended, and its caption reaches an external agent through `get_draft`. The proposal lists the caption text in that response but not the facts check status. An agent client then receives a flagged caption that looks like a clean one and may post it with no human ever seeing the notice.
> **Fix:** Have `get_draft` and the ACP equivalent return the facts check status (`clear`, `flagged` or `error`) and its matched values for each caption, next to the text. Document that clients must treat `flagged` and `error` as needing review.
> **Status:** upheld

### [WARN] party-security — The copy event must come from the browser, so any member can forge it and it has no stated bound

**Quotes:**

> - New events for a curated caption generated (with its channel and outcome), a caption copied (with its channel, general included) and a post downloaded. Each event has one emitter and carries no text.
> - Insights adds a small section: curated captions per channel, and downloads and copies per day.
>   **Problem:** A copy happens only in the browser, so "a caption copied" has to be sent by the client to the server. That makes Insights' "copies per day" a number any signed-in member can inflate or invent, by replaying the request or posting arbitrary channel values. The proposal names no validation and no rate limit for this new client-writable event. It is an unbounded append into the event store from a client endpoint.
>   **Fix:** Accept the copy event only through the existing session-scoped client-event path, with team, user and source set from the session. Check the draft id against the caller's team and the channel against the caption registry, and reject anything else. Allow at most one copy event per user, draft and channel per short window. Emit download from the server's download route, not the client. Label copies in Insights as client-reported.
>   **Status:** upheld

### [WARN] party-security — Rolling back the enum migration means deleting every general and Facebook caption, and a dropped `Brief.channels` has no recovery path

**Quotes:**

> - The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner. Each `ALTER TYPE … ADD VALUE` goes in its own migration, with a down script.
>
> 1. **Default generation.** The on-image headline stays, and one platform-neutral general caption is generated with every post. No channel caption is generated until asked for. The wizard's channel picker goes, and `Brief.channels` is dropped or ignored (the plan decides).
>    **Problem:** Postgres cannot drop an enum value while rows use it. A down script for `ADD VALUE` therefore either fails partway or must first delete or rewrite every row that uses the value. Since every post gets a general caption, that means every general caption. The proposal does not say which of these the down script does, so an operator rolling back can silently wipe the captions this change creates. Dropping `Brief.channels` destroys data: once the drop runs, no down script can restore the values, and no backup or export step is named.
>    **Fix:** Make the down script fail closed. It checks for rows that use the new values, refuses with a message that names the count, and deletes only when the operator passes an explicit flag. Prefer ignoring `Brief.channels` over dropping it in this change. If it is dropped, state the recovery path: a `pg_dump` of the column taken before the migration, documented next to the down script.
>    **Status:** upheld
