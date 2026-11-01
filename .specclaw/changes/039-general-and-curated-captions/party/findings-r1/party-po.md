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
