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
