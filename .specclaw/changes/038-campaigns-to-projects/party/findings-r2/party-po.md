### [BLOCK] party-po — Cheapest variant never considered: a project as a plain grouping, with campaign inputs migrated later or not at all

**Quotes:**

> Projects take over the campaign's generation inputs:
> Files affected:** ~80 (estimated, including tests and docs)
> Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files
> **Problem:** The proposal bundles four separable things into one ~80-file, medium-high-risk change. They are: (a) the visibility rewrite, which is required, (b) the post-to-project link, (c) moving briefing, documents, kit and style defaults, and (d) deleting campaigns. A much cheaper variant exists. Rename or reshape the existing campaign object as the project, keep its briefing, documents and defaults machinery in place, and add only the nullable `projectId` and the team-wide visibility rule. That variant captures most of the value without moving the briefing assistant, chat, Improve and upgrade routes, the document store, the three E2E suites and the analytics schema bumps. The proposal never weighs this option or says why a move is better than a rename. Do-nothing is also unpriced. Today a post cannot be grouped at all, but the proposal gives no usage numbers and no figure for the briefing and document features it is relocating.
> **Fix:** Add a "cheaper variant considered" paragraph. Either justify the full move against an in-place rename of the campaign tables, or cut to the rename. Name the cost of each.
> **Status:** upheld

### [WARN] party-po — Briefing assistant, chat, Improve and upgrade routes are carried over with no stated value

**Quotes:**

> The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes.
> Move the E2E suites `briefing-assistant`, `briefing-upgrade`
> **Problem:** The user's stated need is the briefing text injected into generation. The assistant, chat, Improve and upgrade surfaces are authoring conveniences with their own routes, tests and model spend. The proposal ports all of them without attaching a value to each, in a program whose goal is "generate, download, copy a caption". Carrying them over increases the file count and the E2E rework.
> **Fix:** Ship a plain versioned briefing editor on projects. Keep the assistant, chat, Improve and upgrade routes as an optional follow-up, or state the value that justifies porting each one now.
> **Status:** upheld

### [WARN] party-po — Three different edit-permission tiers and an unpriced assign-anywhere rule add UI and test surface

**Quotes:**

> On the post page and in the library, any team member can assign a post to a project, move it or remove it.
> Project create, rename and delete, a briefing section, a documents section, defaults, and the post list on the project page.
> **Problem:** The proposal adds three assignment surfaces (wizard, post page, library) and a separate permission tier (any member may assign, only the author or an admin may edit). Each surface and each tier needs UI, tests and rules. No value is stated for assigning from the library as well as from the post page. The cost is also unstated, because the permission matrix is not enumerated.
> **Fix:** Ship the wizard picker and the post-page assign first. Add library bulk or inline assign only if there is demand.
> **Status:** upheld

### [NOTE] party-po — Cut line: ship visibility and projectId before the input migration

**Quotes:**

> Removing campaigns without replacing that rule would make every post private to its author.
> This is change 2 of 3. It depends on 037, which removes the campaign queue.
> **Problem:** The visibility rewrite and the project link are what unblock 039 and the user's goal. Moving the briefing, the documents and the analytics schemaVersion bumps are separately valuable and separately shippable. The proposal names no cut line, so one slip in the 80-file change delays all of it.
> **Fix:** Name an explicit split: 038a covers visibility, `projectId`, the picker and the project page. 038b covers briefing, documents, defaults, the campaign drop and the analytics bump.
> **Status:** upheld

### [NOTE] party-po — Running cost of the larger resolver and visibility change is not stated

**Quotes:**

> Risk:** medium-high. The visibility rewrite touches about 24 routes, and the team-isolation E2E suite is the guard.
> **Problem:** The proposal states no operator attention or CI cost. The full mock suite is already 598-plus tests. It is not stated whether the moved suites change CI minutes, and no bound is set on the project count or on document storage per project.
> **Fix:** State the expected CI delta, and the caps on projects per team and on documents per project (or "uncapped, as campaigns are today").
> **Status:** upheld
