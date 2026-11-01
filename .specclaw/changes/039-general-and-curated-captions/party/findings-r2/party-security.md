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
