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
