# bistec-studio — UI Design System

**Direction:** Folio (study B of change 011).
**Chosen:** 2026-10-07, by the user, alone, from three studies.
**Status:** authoritative for all UI work from 011 T4 onward.
**Source study:** [`direction-studies/study-b-folio.html`](direction-studies/study-b-folio.html). The comparison page is [`direction-studies/pick.html`](direction-studies/pick.html).
**Replaces:** Frozen Light, archived (not deleted) at [`archive/frozen-light/`](archive/frozen-light/), together with its screenshots and the Synthetix reference HTML.

> Read this before building or changing any page or component. Where a value is given here, use it; do not approximate it. Where this document says nothing, follow the source study, then ask.

---

## 1. Decision record

| Date       | Decision                                                                                                                                                                                                                                                                      | By   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 2026-10-06 | Neutral tool UI: no BISTEC Global brand cues. Each team's brand kit is the only brand on screen.                                                                                                                                                                              | user |
| 2026-10-06 | Three direction studies of the draft review page; the user picks one alone.                                                                                                                                                                                                   | user |
| 2026-10-06 | The default theme follows the OS. Light and dark are both mandatory.                                                                                                                                                                                                          | user |
| 2026-10-07 | **Direction B, Folio**, picked over A Graphite and C Instrument. No changes to the study.                                                                                                                                                                                     | user |
| 2026-10-07 | **Logo: the typeset "Studio" wordmark** from the Folio study, not the Bistec Studio logo image. `public/BistecStudioLogo.png` is no longer used. The user: _"The font Folio already has that says Studio is already nice, so leave as is."_ Implemented in 011 T6 (see §8.1). | user |
| 2026-10-07 | **No "More" menu on the draft page.** Every action stays a visible button (§8.17).                                                                                                                                                                                            | user |
| 2026-10-09 | **014 (accessibility and consistency) is one change, not split,** with the full clean mock E2E once per wave and lint, unit and `tsc` per task. The shared page primitives land first (wave 1), so later work builds on them (§8.18).                                         | user |
| 2026-10-09 | **Scroll regions follow a static rule:** every container that can scroll on its own is a focusable, labelled region whether or not it overflows now. There is no overflow measurement (§8.15).                                                                                | user |
| 2026-10-09 | **All 27 fields found by the plan-time sweep get a label** (014 A1), not only the proposal's 9. A placeholder is an example value, never a field's only name (§8.3).                                                                                                          | user |
| 2026-10-09 | **Every field label is the small-caps `FieldLabel`, app-wide** (014 A3): Input and Select share one label style, so there is no sentence-case label beside a small-caps one (§8.3).                                                                                           | user |
| 2026-10-09 | **`axe-core` is declared as a devDependency** (014 A4), at the lockfile's 4.12.1 (already present through `eslint-plugin-jsx-a11y`). The E2E injects it with `page.addScriptTag`; `@axe-core/playwright` is not added (§9).                                                   | user |
| 2026-10-09 | **The primitives' three micro-drifts are accepted** (014 A5): each moves 4 px of spacing or less, or a line-height, with no colour, typeface or size change.                                                                                                                  | user |

The logo decision supersedes 011 `spec.md`'s "Dark-mode logo" edge case, which assumed the PNG and its `dark:invert` stay.

---

## 2. The direction in one paragraph

Editorial and flat. A warm paper ground (cream, hue ≈ 40°) with espresso ink in light; espresso ground with bone ink in dark. **One accent, burnt sienna**, used for the primary action, the current-page rule and focus. A serif (Fraunces) speaks for titles and section heads; a quiet grotesk (Instrument Sans) does the work. **Structure comes from rules and type, not boxes and blur.** Floating surfaces are opaque paper with a 1 px ink border and a hard offset shadow. The post sits on a "proof plate" with crop marks, like a page waiting for sign-off.

What Folio removes from Frozen Light: glass and `backdrop-filter`, glow blobs, ghost-fill buttons, blurred shadows, ice-blue accents, and icons in the sidebar nav.

---

## 3. Tokens

All tokens live in `src/app/globals.css`, on `:root` (light) and `.dark` (dark), switched by the existing `.dark` class on `<html>`.

- **Colours are R G B triplets.** Consume them as `rgb(var(--x))`, or `rgb(var(--x) / a)` for a tint. Never write the hex. The one exception is the marked `ui-exception` in §8.12.
- **Status-chip tint alpha is 0.10 in both themes.** The contrast results in §3.3 assume it. Today's chips use 0.15 in dark; Folio does not.
- **Theme-independent tokens are declared once, on `:root`:** radius, motion, type, spacing and the control heights (`--control-sm|md|lg`, 014 FR-07; §6). Colour, shadow and scrim tokens are declared in both blocks.

### 3.1 Token block (exact)

This is the study's block, copied byte for byte. T4 copies it into `globals.css` as it stands, with one exception, the `--font-*` lines (see the note after the block).

<!-- prettier-ignore -->
```css
:root {
  /* colour */
  --canvas: 246 243 237;
  --surface-1: 251 249 245;
  --surface-2: 255 254 251;
  --fg: 33 28 24;
  --fg-muted: 104 95 86;
  --line: 145 134 122;
  --line-subtle: 226 219 207;
  --accent: 140 72 18;
  --accent-fg: 255 254 251;
  --focus: 140 72 18;
  --status-draft: 104 95 86;
  --status-exported: 107 63 160;
  --status-scheduled: 120 84 0;
  --status-published: 44 102 55;
  --status-failed: 176 36 30;
  /* elevation — flat paper: hard offset shadows, never blur */
  --shadow-panel: none;
  --shadow-raised: 4px 4px 0 0 rgb(33 28 24 / 0.10);
  --shadow-overlay: 6px 6px 0 0 rgb(33 28 24 / 0.14);
  --scrim: 33 28 24;
  /* radius — nearly square */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-pill: 999px;
  /* motion — quiet */
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 240ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-exit: cubic-bezier(0.3, 0, 1, 1);
  /* type */
  --font-display: "Fraunces", ui-serif, Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  --text-2xs: 11px;
  --text-xs: 12px;
  --text-sm: 13.5px;
  --text-base: 15px;
  --text-lg: 18px;
  --text-xl: 24px;
  --text-2xl: 42px;
  /* spacing — 8px grid, 24px baseline */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
.dark {
  --canvas: 25 22 19;
  --surface-1: 32 28 24;
  --surface-2: 41 36 31;
  --fg: 240 234 223;
  --fg-muted: 170 159 144;
  --line: 126 116 104;
  --line-subtle: 58 52 45;
  --accent: 230 152 96;
  --accent-fg: 25 22 19;
  --focus: 230 152 96;
  --status-draft: 176 166 152;
  --status-exported: 198 168 242;
  --status-scheduled: 226 184 84;
  --status-published: 142 198 142;
  --status-failed: 246 142 122;
  --shadow-panel: none;
  --shadow-raised: 4px 4px 0 0 rgb(0 0 0 / 0.45);
  --shadow-overlay: 6px 6px 0 0 rgb(0 0 0 / 0.55);
  --scrim: 0 0 0;
}
```

**The `--font-*` exception.** `next/font` serves self-hosted fonts under generated family names (`'__Fraunces_…'`), so a literal `"Fraunces"` in `:root` would not match the self-hosted file and would fall through to Georgia. The three `--font-*` variables therefore come from `next/font`'s `variable` option (`--font-display`, `--font-sans`, `--font-mono`). The study's fallback stacks (`ui-serif, Georgia, serif` and so on) go into `next/font`'s `fallback` option. Every other line is copied as is.

### 3.2 Colour roles

| Token                | Role                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--canvas`           | Page ground. Also the sidebar, and the hover fill of a menu item.                                                                                                                                            |
| `--surface-1`        | The header, sticky bars and in-flow panels (`.surface`).                                                                                                                                                     |
| `--surface-2`        | Floating surfaces (menus, toasts, modals), inputs, and the proof plate.                                                                                                                                      |
| `--fg`               | Primary text. Also the 1 px border of floating surfaces, the 2 px block rule, and the fill of "ink" buttons (with `--canvas` text).                                                                          |
| `--fg-muted`         | Secondary text, metadata and section labels.                                                                                                                                                                 |
| `--line`             | **Any boundary a user must see:** input, select and button edges, toggle outlines, crop marks. It holds 3:1 on every surface.                                                                                |
| `--line-subtle`      | **Decorative dividers only:** rules between sections and rows, panel hairlines. It is exempt from 3:1 (WCAG 1.4.11). Never put text on it, and never use it as a control edge.                               |
| `--accent`           | The primary action, the current-nav bar, section numerals, "Current" labels, links in text.                                                                                                                  |
| `--accent-fg`        | Text and icons on `--accent`.                                                                                                                                                                                |
| `--focus`            | The focus outline. It has the same value as `--accent`, but is a separate token so it can be tuned alone.                                                                                                    |
| `--status-draft`     | Draft, Cancelled, Unfinished.                                                                                                                                                                                |
| `--status-exported`  | Exported, Generating. A plum violet.                                                                                                                                                                         |
| `--status-scheduled` | Scheduled, Queued, **and every warning state** (for example "Brand conflict" in the refine log, or the amber skipped-background notice). An ochre. **Folio has no blue: `scheduled` is no longer sky blue.** |
| `--status-published` | Published, Generated, "Applied", "Saved". A muted green.                                                                                                                                                     |
| `--status-failed`    | Failed, errors, destructive actions (Delete).                                                                                                                                                                |
| `--shadow-panel`     | `none`. In-flow panels have no shadow.                                                                                                                                                                       |
| `--shadow-raised`    | Menus, popovers, and the primary button's hover. A hard 4 px offset, no blur.                                                                                                                                |
| `--shadow-overlay`   | Toasts, modals, the lightbox chrome and the Create post button. A hard 6 px offset, no blur.                                                                                                                 |
| `--scrim`            | The colour of the dimmed layer behind modals (§4.2). Used only with an alpha.                                                                                                                                |

The sienna accent and the ochre `scheduled` sit in the same warm family. They are told apart by the chip's text label, never by colour alone.

### 3.3 Contrast (WCAG 2.2, computed from the token block)

These are the study's own results, generated by script from the block above. Status chips are measured as their text on their own 10% tint, over the worst of canvas, surface-1 and surface-2. **All 40 checks pass.** T4's `contrast.test.ts` (AC-16) re-computes the same pairs; it declares `line/*` at 3:1 and leaves `line-subtle` out.

**Light theme**

| Pair                                        | Ratio   | Needs | Result  |
| ------------------------------------------- | ------- | ----- | ------- |
| fg / canvas                                 | 15.24:1 | 4.5:1 | AA pass |
| fg / surface-1                              | 16.05:1 | 4.5:1 | AA pass |
| fg / surface-2                              | 16.74:1 | 4.5:1 | AA pass |
| fg-muted / canvas                           | 5.64:1  | 4.5:1 | AA pass |
| fg-muted / surface-1                        | 5.94:1  | 4.5:1 | AA pass |
| fg-muted / surface-2                        | 6.20:1  | 4.5:1 | AA pass |
| accent-fg / accent                          | 6.83:1  | 4.5:1 | AA pass |
| accent / canvas (text, links)               | 6.22:1  | 4.5:1 | AA pass |
| accent / surface-1 (text, links)            | 6.55:1  | 4.5:1 | AA pass |
| status-draft / its chip (worst surface)     | 4.94:1  | 4.5:1 | AA pass |
| status-exported / its chip (worst surface)  | 5.74:1  | 4.5:1 | AA pass |
| status-scheduled / its chip (worst surface) | 5.35:1  | 4.5:1 | AA pass |
| status-published / its chip (worst surface) | 5.38:1  | 4.5:1 | AA pass |
| status-failed / its chip (worst surface)    | 5.17:1  | 4.5:1 | AA pass |
| line / surface-1 (input, control edge)      | 3.39:1  | 3:1   | AA pass |
| line / surface-2                            | 3.53:1  | 3:1   | AA pass |
| line / canvas                               | 3.22:1  | 3:1   | AA pass |
| focus / canvas                              | 6.22:1  | 3:1   | AA pass |
| focus / surface-1                           | 6.55:1  | 3:1   | AA pass |
| focus / surface-2                           | 6.83:1  | 3:1   | AA pass |

**Dark theme**

| Pair                                        | Ratio   | Needs | Result  |
| ------------------------------------------- | ------- | ----- | ------- |
| fg / canvas                                 | 15.05:1 | 4.5:1 | AA pass |
| fg / surface-1                              | 14.14:1 | 4.5:1 | AA pass |
| fg / surface-2                              | 12.84:1 | 4.5:1 | AA pass |
| fg-muted / canvas                           | 6.93:1  | 4.5:1 | AA pass |
| fg-muted / surface-1                        | 6.51:1  | 4.5:1 | AA pass |
| fg-muted / surface-2                        | 5.91:1  | 4.5:1 | AA pass |
| accent-fg / accent                          | 7.74:1  | 4.5:1 | AA pass |
| accent / canvas (text, links)               | 7.74:1  | 4.5:1 | AA pass |
| accent / surface-1 (text, links)            | 7.27:1  | 4.5:1 | AA pass |
| status-draft / its chip (worst surface)     | 5.35:1  | 4.5:1 | AA pass |
| status-exported / its chip (worst surface)  | 6.18:1  | 4.5:1 | AA pass |
| status-scheduled / its chip (worst surface) | 6.63:1  | 4.5:1 | AA pass |
| status-published / its chip (worst surface) | 6.38:1  | 4.5:1 | AA pass |
| status-failed / its chip (worst surface)    | 5.52:1  | 4.5:1 | AA pass |
| line / surface-1 (input, control edge)      | 3.70:1  | 3:1   | AA pass |
| line / surface-2                            | 3.36:1  | 3:1   | AA pass |
| line / canvas                               | 3.93:1  | 3:1   | AA pass |
| focus / canvas                              | 7.74:1  | 3:1   | AA pass |
| focus / surface-1                           | 7.27:1  | 3:1   | AA pass |
| focus / surface-2                           | 6.60:1  | 3:1   | AA pass |

### 3.4 Tailwind mapping (for T4)

The semantic names from 011 `design.md` §4, each colour as `rgb(var(--x) / <alpha-value>)`:

| Tailwind                                      | Variable                                                             |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `canvas`                                      | `--canvas`                                                           |
| `surface` (`DEFAULT`) / `surface-raised`      | `--surface-1` / `--surface-2`                                        |
| `fg` (`DEFAULT`) / `fg-muted`                 | `--fg` / `--fg-muted`                                                |
| `line` (`DEFAULT`) / `line-subtle`            | `--line` / `--line-subtle`                                           |
| `accent` (`DEFAULT`) / `accent-fg`            | `--accent` / `--accent-fg`                                           |
| `focus`                                       | `--focus`                                                            |
| `scrim`                                       | `--scrim`                                                            |
| `status-*`                                    | `--status-*` (one key; T4–T12 also had a `dark` key, removed in T13) |
| `boxShadow.panel` / `.raised` / `.overlay`    | `var(--shadow-…)` (full values, not triplets)                        |
| `fontFamily.display` / `.sans` / `.mono`      | `var(--font-…)` (`.sans` and `.text` are both `--font-sans`)         |
| `transitionDuration.fast` / `.base` / `.slow` | `var(--dur-…)`                                                       |
| `transitionTimingFunction.standard` / `.exit` | `var(--ease-…)`                                                      |

**Clashes with Tailwind defaults.** T4 kept them apart (FR-07, AC-08), and the cleanup (T13) left them so: the app uses the `ui-*` keys, and replacing Tailwind's defaults with Folio's values is a later change.

- **Spacing needs only the control heights.** Folio's `--space-N` equals Tailwind's default step `N` (1 = 4 px, 2 = 8, 3 = 12, 4 = 16, 6 = 24, 8 = 32, 12 = 48). Use `p-4`, `gap-6` and so on. The one addition is `spacing.control-sm|md|lg` → `var(--control-sm|md|lg)` (014 FR-07), under new keys, so `h-control-md`, `w-control-sm` and so on exist and no default step changes.
- **Radius clashes by name.** Tailwind's `rounded-sm` is 2 px (matches), but `rounded` is 4 px and `rounded-md` is 6 px, whereas Folio's `md` is 4 px and `lg` is 6 px. Add the Folio radii under names that do not exist yet (for example `rounded-ui-sm|md|lg`), and do not redefine `sm`, `md` or `lg`.
- **Font size clashes by name.** Tailwind's `text-xs` (12) and `text-lg` (18) match, but `sm`, `base`, `xl` and `2xl` differ (14 / 16 / 20 / 24 against Folio's 13.5 / 15 / 24 / 42). Add the Folio scale under new keys and do not redefine the defaults.

---

## 4. Surface model

**The rule (FR-08): text behind a fixed or floating surface is never perceptible.** Every such surface has an opaque background (alpha 1) and no `backdrop-filter`. Folio uses no `backdrop-filter` anywhere, including on scrims.

### 4.1 The three surface classes

They live in `@layer components` in `globals.css`. A primitive gets a surface only through one of them. All three use `background-color`, **never the `background` shorthand**, which erases a Select's chevron `background-image`.

| Class              | Background    | Border               | Radius        | Shadow                  | Used for                                                                                                   |
| ------------------ | ------------- | -------------------- | ------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.surface`         | `--surface-1` | 1 px `--line-subtle` | `--radius-md` | `--shadow-panel` (none) | In-flow panels, where a screen needs a bounded area. Prefer rules over panels.                             |
| `.surface-raised`  | `--surface-2` | 1 px `--fg`          | `--radius-md` | `--shadow-raised`       | Dropdown menus, popovers, Select content, the team switcher menu.                                          |
| `.surface-overlay` | `--surface-2` | 1 px `--fg`          | `--radius-lg` | `--shadow-overlay`      | Modals, confirm dialogs, the lightbox chrome. **Toasts too**, with `--radius-md`, as the study draws them. |

Notes against 011 `design.md` §5:

- **Toasts take the overlay shadow, not the raised one,** because the study gives them `--shadow-overlay`. Both are opaque, so only the offset differs.
- **The Create post button has its own fill,** `--accent`, with `--shadow-overlay`. It is not a surface class. It is opaque because `--accent` is a solid colour.
- **`--radius-lg` (6 px) is reserved for modals and the lightbox chrome.** The study uses no `lg` surface, so this is a T3 choice: the largest surfaces get the largest radius.

### 4.2 Fixed surfaces and the scrim exception

| Surface                        | Treatment                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                         | `--surface-1`, a 1 px `--line-subtle` bottom rule, no shadow.                                                                                                                               |
| Desktop sidebar                | `--canvas`, a 1 px `--line-subtle` right rule.                                                                                                                                              |
| Mobile sidebar panel           | `--canvas`, a 1 px `--fg` right border and `--shadow-overlay`, over a scrim. (The study has no mobile view; this is a T3 choice that matches the other floating surfaces.)                  |
| Sticky bars                    | `--surface-1` (or `--canvas` where the bar sits on canvas), a 1 px `--line-subtle` rule on the content side.                                                                                |
| **Scrims (the one exception)** | `rgb(var(--scrim) / a)`, with nothing legible or interactive on them. Today's alphas carry over: modal and confirm 0.5, lightbox 0.8, mobile sidebar 0.3. Their `backdrop-blur` is dropped. |

`.glow-blob` is not part of Folio. T6 removed its use from `AppShell`, and T13 removed the utility (FR-13).

---

## 5. Type

### 5.1 Families

| Token            | Family              | `next/font/google` import | Use                                                                                       |
| ---------------- | ------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `--font-display` | **Fraunces**        | `Fraunces`                | Page titles, section heads, the logo wordmark, numerals, the refine prompt, toast titles. |
| `--font-sans`    | **Instrument Sans** | `Instrument_Sans`         | All UI and body text. Weights 400, 500, 600.                                              |
| `--font-mono`    | **JetBrains Mono**  | `JetBrains_Mono`          | **Code only.** Weight 400.                                                                |

- **Fraunces needs its optical-size axis.** Load it as a variable font with `axes: ['opsz']` and both styles (`normal`, `italic`). Without the axis, every `font-variation-settings: "opsz" N` below is ignored silently.
- **Self-hosted (NFR-05).** `next/font/google` downloads at build time and serves the files from the app. The study's `fonts.googleapis.com` link is preview-only and never enters the app.
- **Changed from Frozen Light:** Inter is replaced by Instrument Sans, and Fraunces is added. JetBrains Mono no longer marks metadata (IDs, counts, timestamps). Metadata is sans with tabular figures, which the body sets globally.

### 5.2 Scale

Seven steps: `--text-2xs` 11 · `--text-xs` 12 · `--text-sm` 13.5 · `--text-base` 15 · `--text-lg` 18 · `--text-xl` 24 · `--text-2xl` 42 (px).

The body is `--font-sans`, `--text-base`, line-height 1.6, `font-variant-numeric: tabular-nums`, `-webkit-font-smoothing: antialiased`.

| Role                                                    | Family / style      | Size          | Weight                        | Line-height | Tracking | opsz |
| ------------------------------------------------------- | ------------------- | ------------- | ----------------------------- | ----------- | -------- | ---- |
| Page title                                              | display             | `--text-2xl`  | 400                           | 1.04        | −0.025em | 144  |
| Section head (`h2`)                                     | display             | `--text-xl`   | 500                           | inherit     | −0.01em  | 48   |
| Sub-head (`h3`)                                         | display             | `--text-lg`   | 500                           | inherit     | 0        | —    |
| Logo wordmark                                           | display, **italic** | `--text-xl`   | 400                           | inherit     | −0.02em  | 72   |
| Section numeral ("i.", "№ 1")                           | display, italic     | `--text-base` | 400                           | inherit     | 0        | —    |
| Refine prompt input                                     | display, italic     | `--text-base` | 400                           | inherit     | 0        | 24   |
| Body, nav items                                         | sans                | `--text-base` | 400                           | 1.6         | 0        | —    |
| Controls, menu items, meta                              | sans                | `--text-sm`   | 600 on buttons, 400 elsewhere | —           | 0        | —    |
| Small text, counters, times                             | sans                | `--text-xs`   | 400                           | —           | 0        | —    |
| Small caps (eyebrows, nav section labels, status words) | sans, uppercase     | `--text-2xs`  | 600                           | —           | 0.14em   | —    |

**Off-scale sizes in the study** (10.5, 14, 15.5 and 17 px) belong to its spec sheet and a few demo details. In the app, use the nearest step: 10.5 → `--text-2xs` (chips, refine status words), 14 → `--text-sm` (proof caption), 15.5 → `--text-base` (team name), 17 → `--text-lg` (toast title). This is a T3 choice, made to keep the scale at seven steps.

**Below `md`,** the page title steps down to `--text-xl` (24 px). Frozen Light did the same (30 → 24); 42 px serif on a 343 px column wraps into four lines. This is a T3 choice.

---

## 6. Spacing, layout and density

**An 8 px grid on a 24 / 26 px baseline.** Spacing tokens: 4 · 8 · 12 · 16 · 24 · 32 · 48 px (`--space-1` to `--space-12`, equal to Tailwind's default steps).

**Density is medium and reading-first.** Body 15 px / 1.6.

**Control heights come from three tokens (014 FR-07),** declared once on `:root` in `globals.css` and nowhere else: `--control-md` is the default control, `--control-sm` the small one and `--control-lg` the large `Button` size. Tailwind exposes them as `h-control-*` / `w-control-*`. Buttons, single-line fields (`Input`, `Select`, `inputClasses`, `COMPACT_FIELD`), icon buttons (`ICON_BUTTON`, the shell's `SHELL_ICON_BUTTON`) and the other one-line controls read them; a control never writes its height as a literal (`h-9`, `h-[30px]`). Textareas, the display-size title field, the attached prompt fields and skeleton bars are not controls of a size and keep their own heights. `tests/unit/designTokens.test.ts` holds the values and the no-literal rule.

| Element                | Desktop (from the study)                                                | At 375 px (A4 floor)                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header                 | 60 px tall; grid `220px 1fr auto`; logo inset 28 px                     | 60 px; logo, menu button and theme toggle; breadcrumbs truncate or hide                                                                          |
| Sidebar                | 220 px wide, fixed                                                      | Hidden; opens as the Radix Dialog overlay (today's behaviour, focus-trapped)                                                                     |
| Main padding           | 36 px top, 48 px sides, 140 px bottom (room for the Create post button) | 16 px sides                                                                                                                                      |
| Draft "spread"         | Two columns, `500px 1fr`, 56 px gap                                     | One column, proof first. The spread is two columns only where the proof (500 px) and a copy desk of at least 480 px both fit beside the sidebar. |
| Versions contact sheet | 4 columns, 20 px gap, 72 px thumbnails                                  | 4 columns, 12 px gap (4 × 72 + 3 × 12 = 324 px, inside 343)                                                                                      |
| Action bar             | One row, `gap: 8px`                                                     | Wraps (`flex-wrap`); never scrolls sideways                                                                                                      |

**No screen scrolls horizontally at 375 px** (`scrollWidth <= clientWidth` on `<html>`). A wide table may scroll inside its own container; the page never does.

The study covers only the draft review page. For other screens, carry its patterns: an eyebrow, a display title and a meta row at the top; a 2 px `--fg` rule to open a major block; 1 px `--line-subtle` rules between sections and rows; lists as ruled rows, not cards.

---

## 7. Radius and motion

### 7.1 Radius

**2 · 4 · 6 px, nearly square.** Rules and type do the softening.

| Token           | Value  | Used for                                                                       |
| --------------- | ------ | ------------------------------------------------------------------------------ |
| `--radius-sm`   | 2 px   | Inputs, textareas, chips, thumbnails, the expand button on a preview.          |
| `--radius-md`   | 4 px   | Buttons, segmented toggles, menus, toasts, the Create post button, `.surface`. |
| `--radius-lg`   | 6 px   | Modals and the lightbox chrome (§4.1).                                         |
| `--radius-pill` | 999 px | Avatars only. Folio has no pill buttons or pill chips.                         |

### 7.2 Motion

**Quiet.** Fades plus a 3 px drop; **never scale**.

| Token             | Value                        | Used for                                                                   |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `--dur-fast`      | 120 ms                       | Hover colour and border changes, nav colour, the Create post button press. |
| `--dur-base`      | 180 ms                       | Menu entrance, the theme colour switch on `body`.                          |
| `--dur-slow`      | 240 ms                       | Toast entrance.                                                            |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Everything entering or changing.                                           |
| `--ease-exit`     | `cubic-bezier(0.3, 0, 1, 1)` | Elements leaving (menu close, toast dismiss).                              |

- **Entrance keyframe (`drop`):** from `opacity: 0; transform: translateY(-3px)` to `opacity: 1; transform: none`.
- **The Create post button** moves `translate(-1px, -1px)` on hover. On press it moves `translate(2px, 2px)` with its shadow cut to `2px 2px 0 0 rgb(0 0 0 / 0.2)`, so it "presses into its shadow".
- **The primary button** gains `--shadow-raised` on hover. It does not move.
- **The modal keeps `modalIn`**, whose keyframes carry `translate(-50%, -50%)` through every frame. Never put a keyframe `transform` on a transform-centred element without carrying its centring (the 2026-07-13 `animate-scale-in` bug).

### 7.3 Reduced motion (NFR-03)

Under `@media (prefers-reduced-motion: reduce)`:

```css
*,
*::before,
*::after {
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
}
/* loading indicators keep moving, slowly (added in T4) */
.animate-spin {
  animation-duration: 1.5s !important;
  animation-iteration-count: infinite !important;
}
.animate-pulse {
  animation-duration: 2s !important;
  animation-iteration-count: infinite !important;
}
/* menus and toasts keep a 150 ms opacity-only fade instead of the drop */
@keyframes fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
/* the Create post button does not move */
```

- The `transition-duration` line is the study's; the `animation-duration` line is from 011 `design.md` §4. Shortening durations, rather than removing animations, keeps `modalIn`'s final frame, which carries the modal's centring (AC-18).
- **Loops (T4).**
  - The iteration-count cap stops infinite decorative loops from strobing at 1 ms per cycle; they settle on their end frame.
  - Loading indicators (`animate-spin`, `animate-pulse`) are status, so they are exempt: they keep looping at 1.5 s and 2 s, so a pending state still shows as pending.
  - A new looping loader must use one of those two classes, or add its own exemption here.
- Menus and toasts use `animation: fade 150ms linear both !important`. Their selectors are more specific than `*`, so the 150 ms wins over the 1 ms.
- The Create post button's hover and press transforms become `none`.
- **Side effect, from the T2 report:** `transition-duration: 1ms` on `*` turns on a 1 ms transition for every property, because `transition-property` defaults to `all`. A computed style read right after a state change can catch an in-between value. E2E checks (AC-17, AC-18) should wait briefly before they read computed styles, or T4 can scope the rule.

---

## 8. Components

### 8.1 Logo (the "Studio" wordmark)

- **The logo is the word "Studio", typeset,** exactly as the study's `.logo`: `--font-display`, italic, 24 px (`--text-xl`), `letter-spacing: -0.02em`, `font-variation-settings: "opsz" 72`, colour `--fg`. In the header it is inset 28 px from the left.
- **It is text in the ink colour, so it needs no `dark:invert`.** The variable switches with the theme.
- **Accessible name: "Studio".** Today's `Logo.tsx` exposes `role="img"` with the name "Bistec Studio"; no test depends on that name.
- **`public/BistecStudioLogo.png` is not used.** T6 rewrites `src/components/Logo.tsx` to render the wordmark and removes the PNG.
- **This reverses a Frozen Light rule** ("never re-type the brand as text"). The wordmark is not a brand cue: it is the product's name set in the UI's display face, which is consistent with the neutral-tool decision.

### 8.2 Buttons

All buttons: `display: inline-flex`, `gap: 8px`, `--text-sm` 600, `white-space: nowrap`, `--radius-md`, transitions on `background-color`, `color` and `box-shadow` at `--dur-fast`.

| Variant         | Height         | Padding | Fill / border / text                                              | Hover                  |
| --------------- | -------------- | ------- | ----------------------------------------------------------------- | ---------------------- |
| **Primary**     | `--control-md` | 0 20 px | `--accent` fill, 1 px `--accent` border, `--accent-fg` text       | adds `--shadow-raised` |
| **Outline**     | `--control-md` | 0 14 px | transparent, 1 px `--line` border, `--fg` text                    | border → `--fg`        |
| **Text**        | —              | 0 6 px  | no border; `--fg` text, underlined in `--line` with a 4 px offset | —                      |
| **Ink**         | fills its row  | 0 16 px | `--fg` fill, `--canvas` text (the refine Send button)             | —                      |
| **Danger**      | `--control-md` | 0 14 px | the outline shape with `--status-failed` text and border          | —                      |
| **Small** (any) | `--control-sm` | 0 10 px | `--text-xs`                                                       | —                      |

- **One accent primary per view.** On the draft page it is Publish. A submit attached to a field or sitting in an inline form (the refine Send, inline add and save rows) uses **Ink**, and per-item actions in repeated lists and grids use **Outline**, so the view's one primary stays the only accent fill.
  - **Reading (014 FR-08):** "a view" is the page's `main` content in its current state, and a modal or drawer is its own view. The floating Create post button is shell chrome, outside `main` and outside every view. "One" means **at most one** accent-filled control.
  - **Brand kits:** the open kit's **Save** (edit mode) is the primary, and **Add Kit** is primary only while no kit is open (it turns Outline once one is). **Save template** and **Save as new version** are inline-form submits, so they are **Ink**. The assistant drawer's Apply and the Add Kit modal's Create are each the one primary of their own view.
- **An open menu button** (`aria-expanded="true"`) takes a `--fg` border and a `--surface-2` fill.
- **Disabled** keeps today's treatment (reduced opacity and `cursor: not-allowed`). The study draws no disabled state.
- **The Danger variant is a T3 choice.** The study shows destructive actions only as a `--status-failed` menu item. An outline danger button keeps `--status-failed` text on a plain surface, which is higher contrast than on its 10% tint (§3.3).

### 8.3 Inputs, selects and textareas

- **Edge:** 1 px `--line` (3:1). **Fill:** `--surface-2`. **Radius:** `--radius-sm`. `--text-base`. Placeholder in `--fg-muted`.
- **Height (014 FR-07):** a single-line field (`Input`, `Select`, a raw `<input>` with `inputClasses`) is `--control-md` tall with 14 px side padding and no vertical padding, so it lines up with the md button beside it. A textarea (`fieldClasses`) has no fixed height: padding 10 px 14 px, and its rows set the height. The compact field (`COMPACT_FIELD`, `--text-sm`) is `--control-sm` tall, beside small buttons; its multi-line form is `COMPACT_TEXTAREA`.
- **Focus:** the §9 outline. Where the input sits inside a wrapper with an attached button (the refine prompt), the wrapper shows the outline on `:focus-within`.
- **The caption textarea is ruled:** a `repeating-linear-gradient` draws a 1 px `--line-subtle` line every 26 px, line-height 26 px, `background-attachment: local`, padding 4 px 16 px, `--text-sm`. Only the caption is ruled.
- **Selects** use `background-color` for the fill so the chevron `background-image` survives.
- **Field labels are one style app-wide (014 FR-06):** the small-caps `FieldLabel` (§5.2 small caps, `--fg-muted`, §8.18). `Input` and `Select` render their `label` prop through it, 6 px above the field, so the style lives in the primitives, not at call sites. There is no other label class.
  - A field's label is visible and associated: the `label` prop, or `FieldLabel htmlFor` with the field's `id` (from `React.useId()`). A placeholder is an example value, never the field's only name.
  - The caption over a group of controls (checkboxes, radios, a segmented toggle, a set of option buttons) is `FieldLabel as="span"`. The group carries its own name: a checkbox set is `role="group"` and a radio set `role="radiogroup"`, each `aria-labelledby` the caption's `id`; a set of option buttons has its own `aria-label`; a segmented toggle's tablist is named by the toggle itself (014 T17).
  - `text-transform` does not change the DOM text, so the accessible name stays in sentence case ("Brand Kit", not "BRAND KIT").

### 8.4 Segmented toggles (`SegmentedToggle`, the theme toggle)

1 px `--line` outline, `--radius-md`, `overflow: hidden`. Segments are `--text-xs` 600 with 6 px 10 px padding, in `--fg-muted`. **The selected segment is ink:** `--fg` fill with `--canvas` text.

### 8.5 Status chips

22 px tall, 0 8 px padding, `--radius-sm`, `--text-2xs` (§5.2), uppercase, 0.14em, 600. Text in the status colour, fill the same colour at **0.10**, and a 1 px inset ring in `currentColor` (`box-shadow: inset 0 0 0 1px currentColor`). Every chip carries its text label: status is never colour alone. The ten chip states map onto the five tokens as in §3.2. A chip never shrinks or wraps (`flex-shrink-0 whitespace-nowrap`).

`StatusChip` takes one of two props (014 FR-03):

- **`status`:** one of the ten known states. The label comes from the chip.
- **`tone` with `children`:** for a state the chip has no entry for (Connected, Not connected, Invalid — reconnect, Active, Deactivated, Revoked). `tone` is one of `published`, `draft`, `scheduled`, `failed` or `exported` and borrows that status's colours; `children` is the visible label. It replaces the old team `StatusWord`, with the same classes.

### 8.6 Sidebar nav and team switcher

- **Text only, no icons.** Items are `--text-base` in `--fg-muted`, padded 5 px 0 5 px 12 px; hover → `--fg`.
- **The current page** (`aria-current="page"`) is `--fg`, weight 600, with a 2 px `--accent` bar at the left edge, inset 8 px top and bottom.
- **Section labels** (Create, Organize, Admin) are small caps in `--fg-muted`. The sections, the role-gating and the bottom-pinned Settings and Sign out are unchanged (FR-10).
- **Team switcher:** the team name in `--font-display` 500 at `--text-base`, opsz 24, over the role in `--text-xs` `--fg-muted`, with an up-down icon, and a 1 px `--line-subtle` rule beneath. Its menu is `.surface-raised`.
- **Breadcrumbs:** `--text-sm` in `--fg-muted`; links underlined by a 1 px `--line` border; the current page in `--fg` 500.

### 8.7 Menus

`.surface-raised`, padding 6 px 0. Items: 7 px 14 px, `--text-sm`, a 15 px icon with a 10 px gap. Hover or highlight fill: `--canvas`. Separator: 1 px `--line-subtle`, 6 px vertical margin. A destructive item is `--status-failed`. Entrance: `drop` at `--dur-base`.

### 8.8 Toasts

`.surface-overlay` at `--radius-md`, 340 px wide, padding 14 px 16 px. The title is `--font-display` 500 at `--text-lg`; the body `--text-sm` `--fg-muted`; Dismiss is a `--text-xs` 600 underlined text button. A success icon is `--status-published`. Entrance: `drop` at `--dur-slow`. Sonner is set `unstyled`, so its own theme colours never fight the tokens (011 `design.md` §5).

### 8.9 Create post button

- **Fill and shape:** `--accent` with `--accent-fg` text and icon, 48 px tall, padding 0 22 px, `--radius-md`, `--text-base` 600, `--shadow-overlay`. Motion as in §7.2.
- **Position:** fixed, 28 px from the right and bottom. Below `md` it is icon only, 48 × 48 (A2), with the same accessible name, "Create post", and a `title` tooltip.
- **Layering:** above page content, below the header, the mobile sidebar overlay, modals and the lightbox (`z-30`, as built in T1).
- **Toast clearance:** toasts sit at least 16 px above the button. With the button 48 px tall at a 28 px inset, the toast offset is 92 px from the bottom and 28 px from the right. (T1's current offset, 96 px bottom and 24 px right, already clears it; T6 aligns both to 28 px.)
- **It fixes T1's carry-over contrast:** white on today's blue is about 4.1:1; `--accent-fg` on `--accent` is 6.83:1 in light and 7.74:1 in dark.

### 8.10 Modals and confirm dialogs

`.surface-overlay` over a 0.5 scrim, padding 24 px. Title in `--font-display` 500 at `--text-xl`; body `--text-base`. Actions sit bottom-right, with the primary (or Danger, in a destructive confirm) rightmost. The study draws no modal; these values are derived from its section heads and floating surfaces.

### 8.11 Lightbox

The image is shown as rendered and is never restyled. The chrome (caption, buttons) is `.surface-overlay`. Scrim 0.8.

### 8.12 The post preview ("proof plate")

- **The plate:** `--surface-2`, a 1 px `--line-subtle` border, 40 px padding, and four 18 px crop marks in `--line`, 1 px, inset 20 px from each corner.
- **The post** fills the plate's width **at its own aspect ratio** (1:1, 4:5 or 9:16), never cropped.
- **The expand button** ("View full screen") is 30 × 30 at the post's top right, inset 10 px. It sits on the post image, which can be any colour, so it uses fixed ink-on-paper values (border `#211c18`, fill `#fffefb`) that stay visible in both themes. That is a documented `ui-exception` (§11).
- **The caption line beneath:** "Proof, v3 of 4" in display italic at `--text-sm`, then the last change, and on the right the pixel size and ratio in `--text-xs` `--fg-muted`.
- **Library tiles** use the same pattern without the plate: the thumbnail with a 1 px `--line-subtle` outline at 3 px offset (→ `--line` on hover), then a display title and a muted meta line. No card box.

### 8.13 Versions (contact sheet)

A head row (a sub-head "Versions", then Previous / Next / Undo as small text buttons) over a 1 px `--fg` rule. Below it, the grid of §6. Each frame: a 72 px thumbnail at the post's ratio, outlined like a library tile; the current one has a 2 px `--fg` outline and a small-caps "Current" label in `--accent`; then "v3" in display 500 at `--text-base`, and its note and time in `--text-xs` `--fg-muted`.

### 8.14 Caption and refine sections ("caption desk")

- **Section head:** an italic display numeral in `--accent` ("i.", "ii."), the `h2`, and on the right the tail: the Saved state (`--status-published`, 600) and the small Regenerate text button.

**The caption desk (012).** Section "i. Captions" (`CaptionPanels`, `src/components/drafts/`) is a `SectionHead` h2 whose tail holds **"Regenerate all"** (and "Regenerating…" while it runs). "Writing the captions…" shows while the draft generates. Inside it are **four sub-panels**, each a `SectionHead level={3}` with a `useId` id, in this order:

| h3            | Field                                                                         | Helper text                                                                                    | Counter                               |
| ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Headline**  | single-line `Input` (not ruled, §8.3), placeholder "Write the headline…"      | "The text on the image. Regenerate the design to use a changed headline."                      | `n / 100`, `--status-failed` past 100 |
| **Instagram** | the ruled caption textarea (§8.3), placeholder "Write the Instagram caption…" | none                                                                                           | `1,234 / 2,200 (Instagram)`           |
| **LinkedIn**  | the ruled caption textarea                                                    | none                                                                                           | `412 / 3,000 (LinkedIn)`              |
| **WhatsApp**  | the ruled caption textarea                                                    | "Not published from Studio yet. Copy it and post it in WhatsApp." (left of the counter, wraps) | `412 / 1,000 guide`                   |

- **Names (014 FR-12).** Every field is `aria-labelledby` its h3, so its accessible name is "Headline", "Instagram", "LinkedIn" or "WhatsApp". Its `aria-describedby` lists only what is rendered, in this order: the review notice, the failure notice, the helper text, the counter, the limit or guide warning. The headline's lists its inline error, the helper and the counter.
- **Saving.** Every field saves on blur (the PATCH). The tail shows Saving… / Saved / Unsaved changes. Saving is **never** blocked by a limit. A headline PATCH error shows inline as `<p role="alert">`, with `aria-invalid` and a `--status-failed` edge; the typed value stays, "Unsaved changes".
- **The panel tail, in order:** save state · **Undo** (only while a snapshot exists) · **Copy** · **Generate / Regenerate**. The headline's tail has no Copy.
  - **Generate / Regenerate:** "Generate" when the field is empty, otherwise "Regenerate"; named "Generate <Label> caption" / "Regenerate <Label> caption". The headline's reads "Generate headline" / "Regenerate headline". A spinner shows while that panel's own row is `PENDING`.
  - **Undo:** one per panel (`useUndoableAction`), named "Undo <Label> caption" / "Undo headline". It restores **only its own panel** through the PATCH. The snapshot is what the field showed when Regenerate was pressed (an unsaved edit included; for the headline only if it validates); an empty field takes none. A regenerate that leaves the text unchanged drops it.
  - **Copy:** `navigator.clipboard.writeText`, named "Copy <Label> caption". Toast "Caption copied"; on any failure "Couldn't copy. Select the text and copy it manually." Disabled while the row is `PENDING` or the field is empty.
- **"Regenerate all"** regenerates the three captions and **never the headline** (012 A9). It first waits for every panel's in-flight blur-save, then captures an Undo snapshot in each caption panel. A refused request puts back only what it captured.
- **Locking.** While any regenerate POST is in flight, or the draft has a pending action, every Regenerate, Undo and "Regenerate all" is disabled. The headline field is disabled while a `REGENERATE_COPY` action holds the draft (its PATCH would 409).
- **Skeletons.** Only a `PENDING` row shows one: a `role="status"` region named "Generating the <Label> caption" (the headline: "Generating the headline", one line at control height). **Empty text on a row that is not `PENDING` always shows the editable field** (the TC-ASYNC-10 lesson).
- **Notices** (the `Notice` primitive, §8.18; icon `AlertTriangle`, `aria-hidden`), above the field:

  | Notice                      | Shown when                                                       | Tone      | Role     | Text                                                                                                           |
  | --------------------------- | ---------------------------------------------------------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
  | ~~Review~~ (removed by 016) | the row `needsReview` (fallback-migrated Instagram and LinkedIn) | `warning` | `status` | Migrated from the old single caption, which wasn't split by channel. Review this caption before publishing it. |
  | Failed                      | `status` FAILED                                                  | `error`   | none     | The <Label> caption failed to generate (<reason>). Write it below, or use Generate.                            |
  | Last regenerate failed      | `status` READY with a `failureReason`                            | `warning` | none     | The last regenerate failed: <reason>. The caption below is unchanged.                                          |

  **The Review notice was removed by change 016 (2026-10-13)** with `needsReview` and the legacy caption migration; the row is kept as history. The review and last-failed notices go once the row is saved after an edit, or regenerated successfully. Failed and last-failed never show together.

- **Limits and warnings** (from the channel registry, `src/lib/channels.ts`; numbers `en-US`): past a **hard** limit the counter turns `font-semibold` `--status-failed` and a line below reads "Over the <Label> limit". Past WhatsApp's **soft** 1,000 guide the counter stays muted and a `--status-scheduled` line reads "Longer than the 1,000-character guide". A channel with no limit shows `n characters`. The publish resolver, not the panel, refuses an over-limit caption.
- **Refine log:** ruled rows on a `40px 1fr auto` grid: an italic numeral ("№ 1") in `--fg-muted`; the request in `--text-base`; its outcome beneath, as a small-caps status word (`--status-published` for Applied, `--status-scheduled` for a brand conflict or not applied) and a `--text-xs` explanation; the time on the right.
- **Suggestions:** a muted "Try:" label, then each suggestion as a text button with a 1 px dotted `--line` underline.

### 8.15 Data tables

Ruled rows (1 px `--line-subtle`), with a small-caps `--fg-muted` header row at 0.1em tracking. Numbers align right and use the body's tabular figures.

**A container that scrolls on its own** (a wide table at 375 px, a long list) is a focusable, labelled region: `tabIndex={0}`, `role="region"` and an `aria-label`, so a keyboard user can scroll it. It is `relative` when it holds `sr-only` cells: an `sr-only` element is absolutely positioned, and without a positioned ancestor inside the container it widens the page.

**The rule is static (014 FR-17).** Any `overflow-*-auto` box with a height or width cap has `tabIndex={0}`, `role="region"`, an `aria-label` and the inset `SCROLL_FOCUS` **unconditionally**, whether or not it overflows now. Never spread `role: 'region'` conditionally on measured overflow: an empty conversation or refine log is still a region, so its tab stop never appears or vanishes as content arrives. Examples: the kit list "Brand kits", the assistant drawers' "Conversation", the draft page's "Refine requests", "Planned posts", "Recent drafts", the admin teams and users tables.

**Exempt, with the reason:**

- **The app shell's `main` and sidebar:** page-level scroll, and each is already a landmark.
- **`Modal` and `Drawer` bodies, and the `ElementEditPanel` aside inside the inline-edit dialog:** Radix moves focus to the first focusable element, so a tab stop on the body would change every dialog's initial focus. Their content is reached through the controls it holds.
- **The `FontEditor` listbox:** a popup that manages its own focus.

### 8.16 Icons

`lucide-react` stays (NFR-05). Icons are 15 px, `strokeWidth={1.4}`, in `currentColor`. They label actions inside buttons and menus. The sidebar nav has none. An icon-only button always has an `aria-label`.

### 8.17 Draft page: Folio's grouping, and FR-12

**The draft page has no "More" menu** (user decision, 2026-10-07). The study grouped some actions under a "More ▾" menu; the app does not. **Every action is a visible button** with its own name:

- **Bar:** **Regenerate design** (outline, Path B only) on the left; on the right **Edit inline** (outline, once the draft is ready), **Export** / **Re-export** (outline) and **Publish** (primary, team admins only), the view's one accent fill (§8.2). A 2 px `--fg` rule above the bar, a 1 px `--line-subtle` rule below, 14 px vertical padding. The bar wraps; it never scrolls.
- **View full screen** is the 30 × 30 button on the post itself (§8.12), not a bar action.
- **Undo sits beside the versions** (§8.13).

**FR-12 binds this layout, which is why there is no menu.** Every control must stay present and reachable, with its accessible name and **role** unchanged. The E2E suite opens the inline editor with `getByRole('button', { name: 'Edit inline' })` (`tests/e2e/draft-inline-edit.test.ts`, six cases). An item inside a Radix menu is a `menuitem`, not a `button`, and is hidden until the menu opens, so moving an action into a menu would change its role. No action is added or regrouped into a menu without a new decision.

### 8.18 Page primitives

The page heads, section heads, notices and field labels are shared components in `src/components/ui/` (014 FR-01). The class strings they are built from live in `src/components/ui/atoms.ts`, for the few heads with a bespoke structure.

**The components:**

- **`PageHead({ eyebrow?, title, lead?, actions?, actionsClassName?, className? })`** renders the page's `h1`, always level 1. The eyebrow is small caps in `--fg-muted` above the title, which then takes `mt-2`. The lead is a `--text-sm` `--fg-muted` paragraph. `actions` sits on the right and drops below the title at 375 px. Its wrapper does not shrink below its content, so a button never overflows; a caller with a fixed-width control that should shrink at md widths (the library search) passes `actionsClassName="min-w-0"`.
- **`PageTitle({ children, className? })`** is the `h1` alone, for detail pages whose head is a breadcrumb plus a title (a project, a draft, choose-team).
- **`SectionHead({ title, numeral?, level = 2, id?, className?, children? })`** renders an `h2` in the §8.14 section style, or with `level={3}` an `h3` in the §5.2 sub-head style.
  - The numeral is an `aria-hidden` span outside the heading's name.
  - `id` goes on the heading, for `aria-labelledby`.
  - `children` is the right-hand tail (a status chip, a count, small buttons), at `--text-xs`.
  - The row wraps at 375 px, and the tail keeps right.
- **`Notice({ tone, role?, icon?, className?, children, ...rest })`** is a notice on its status tint (§3.2).
  - Tones: `warning` (`--status-scheduled`), `error` (`--status-failed`) and `info` (`--accent`): the text in that colour on its 10 % fill, with a 1 px inset ring in `currentColor`.
  - `neutral` is a `--surface-1` fill with `--fg` text and an explicit `--line` ring. The ring no longer depends on the text colour, so a child that sets no colour of its own reads in `--fg`, never in `--line`.
  - It renders **no `role` of its own.** The caller passes `role="status"` or `role="alert"` where it wants one, and `role`, `aria-*` and `data-*` pass through.
  - `icon` puts the icon and a flexible body in a row (`items-start`, 8 px gap). Use it only where the notice is that row; a notice with its own layout passes it in `className`.
- **`FieldLabel({ htmlFor?, id?, as = 'label', className?, children })`** is a field label in small caps, `--fg-muted`. `as="span"` is for the caption of a group that carries its own `aria-label`.
- **`StatusChip`** is §8.5.

**The use rule.**

- A screen uses the component wherever its head is "numeral + title + tail" or "eyebrow + title + lead + actions".
- A bespoke heading uses the class strings from `ui/atoms.ts` instead. Today that covers the dashboard's Activity and Recent Drafts heads, the projects group head with its link, the project head, the kit title with its inline marks, the brief `StepHead` and the admin `GateNotice` (`src/components/ui/GateNotice.tsx`).

**No primitive owns its outer margin.** The caller passes the spacing in `className`: `mb-8` after a page head (`mb-10` on `/brief`), `mb-3` under a section head, `pb-2.5` where a rule follows. Pass spacing only: `cn` is a plain join, so a `className` that repeats a property the primitive already sets is settled by CSS source order, not by the order of the classes.

**The residue rule.** A screen group's own style module (`brief/cardCls.ts`, `projects/classes.ts`, `admin/brandkits/classes.ts`) keeps only helpers that one screen group uses and that are defined nowhere else, composed from the `ui` atoms. `BLOCK` and `ROW` (team and settings) live in `ui/atoms.ts`, and `GateNotice` is its own module, `ui/GateNotice.tsx`. No module is named `folio`. A module never redefines a shared name.

**The guard.** `tests/unit/uiTokenGuard.test.ts` fails when any file under `src/` outside `src/components/ui/` declares a `const` or `function` with a shared name. The names are `FOCUS`, `SCROLL_FOCUS`, `SMALL_CAPS`, `EYEBROW`, `FIELD_LABEL`, `PAGE_TITLE`, `PAGE_LEAD`, `SECTION_HEAD`, `SECTION_NUMERAL`, `SUB_HEAD`, `KIT_TITLE`, `STEP_HEAD`, `STEP_NUMERAL`, `STEP_LEAD`, `GROUP_HEAD`, `ASIDE_HEAD`, `NOTICE`, `WARN_NOTICE`, `ICON`, `ICON_SM`, `ICON_BUTTON`, `TEXT_LINK`, `TAG`, `TABLE_HEAD_ROW`, `ROW`, `COMPACT_FIELD`, `COMPACT_TEXTAREA`, `PILL_BADGE`, `PageHead`, `PageTitle`, `SectionHead`, `SectionHeader`, `Notice`, `FieldLabel`, `StatusWord` and `GateNotice`. A copy has no legitimate exception, so `// ui-exception:` does not apply to this guard. Import the atom, or give a genuinely different thing a different name (the shell's 36 px icon button is `SHELL_ICON_BUTTON`). A file in the guard's `PENDING_RESTYLE` list is exempt until its restyle task removes it (see §11).

### 8.19 The model picker, its hint line and the team-token notice (008)

**`ModelPicker`** (`src/components/ui/ModelPicker.tsx`) is the one control for choosing a Claude model. It is a `Select` (§8.3) with its `FieldLabel`, then a hint line, then an optional notice. Every answer it shows comes from the pure helpers in `src/lib/models/pickerState.ts`, which call the server's own resolver (`decideModel`) over `GET /api/models` (`useModels()`, React Query key `['models']`). It adds no rule of its own.

- **Options:** only the models this user can run on this surface on this team: the team's allowed models that the surface supports, minus Opus when the switch applies. They are cheapest first, valued by key (`HAIKU`, `SONNET`, `OPUS`), and labelled `<name> · <tier> (<speed>)`, for example "Sonnet 5.5 · $$ (medium)". The tier (`$`, `$$`, `$$$`) is computed from the catalogue's prices. The speed sits in parentheses because a native `<option>` can't hold secondary text.
- **Pre-selection:** what the server would run if the picker is left alone (the stamp, then the team default, then the system default).
- **The send rule:** the picker reports `undefined` until the user picks a different model, and the caller then omits `model` from the request. Picking the pre-selected model again reports `undefined` too, so a later change to the team default still reaches an untouched picker.
- **Accessible name:** `FieldLabel` "Model", or a surface-specific name wherever more than one picker shares a screen. The names in use: "Caption model" and "Design model" (wizard Review); "Refine model", "Design model", "Headline model", "All captions model" and "Instagram / LinkedIn / WhatsApp caption model" (draft page); "Briefing assistant model" and "Brand kit assistant model" (the assistant drawers). Each is unique on its screen.
- **Disabled** while any action on the screen is pending, like the controls beside it.
- **One model** shows as plain text, `--text-sm` `--fg`, "Model: Haiku 4.5" (the label, a colon, the name), with no select.
- **Hidden** (renders nothing) while `/api/models` loads, when no model can run the surface, and for captions when the caption provider isn't Claude.
- **A refused pick** (the server's `400 MODEL_NOT_ALLOWED`) is shown as the `Select`'s field error: `<id>-error`, joined to `aria-describedby`, with `aria-invalid="true"` on the select. It is not a toast. A new pick clears it.
- **A pick that stops being offered** (an admin unticked it, the switch went on, or the wizard moved to template fill) is reset to `undefined` by the picker, so it is never sent.

**The hint line** is `--text-xs` `--fg-muted` under the select, with the id `<id>-hint`, tied to the select by `aria-describedby`. It says why the pre-selection is what it is. Once the user picks, the pre-selection line drops; the gated line and the caller's note stay.

| Why                                         | Text                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The draft's stamp                           | "Same model as the current caption" (or "headline", or "design")                              |
| The team default                            | "Team default"                                                                                |
| The system default                          | "Default"                                                                                     |
| The fallback                                | "Default (the team's choice isn't available)"                                                 |
| A stamp the team no longer allows           | "Opus 5.5 is no longer available on this team — using Sonnet 5.5" (the stamped and run names) |
| The switch hides Opus from this user        | "Opus requires a personal Claude token on this team — connect one in Settings"                |
| The caller's note (the wizard's path reset) | "Opus 5.5 isn't available for template fill"                                                  |

**The team-token notice** is `Notice tone="warning" role="status"` (§8.18) under the hint, non-blocking: "This run uses your team's Claude allowance. Connect your own token in Settings to use yours." It shows only in CLI mode, on the team credential, when the shown model is one the switch can gate (today, Opus). It belongs to the picker; no screen draws its own copy.

**"Generated with"** (`src/components/drafts/GeneratedWith.tsx`) is a muted `<p>`, `--text-xs` `--fg-muted`, in each caption panel's tail, the headline panel's tail and under the post: "Generated with Sonnet 5.5". A stamp no catalogue entry describes shows the raw ID. A substitution adds "(substituted)", whose `title` reads "Substituted for <name>", with an `sr-only` copy of that text. It is hidden while the row is generating, for a FAILED caption row (whose stamp may belong to older text) and on a FAILED draft. In the Versions cells (§8.13) the model name shows alone at `--text-2xs` `--fg-muted`, with the sentence in its `title` and an `sr-only` "Generated with".

**Where pickers sit:**

| Screen                    | Placement                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brief wizard, Review step | Two pickers in a `sm:grid-cols-2` grid under the summary list; the summary gains "Caption model" and "Design model" rows naming the effective choice   |
| Draft page, refine        | Under the instruction form                                                                                                                             |
| Draft page, captions      | In each caption panel's and the headline panel's tail; "All captions model" in the section tail, under the head that holds "Regenerate all"            |
| Draft page, design        | Under the action bar, Path B only and once the draft is ready, `sm:max-w-xs`                                                                           |
| Assistant drawers         | The first strip under the drawer's title bar, with a 1 px `--line-subtle` rule below; nothing renders, not even the strip, until the models view loads |

**`/team` → Models** (section "vi.") is the admin side: a named group of checkboxes, "Allowed models", labelled `<name> · <tier> · <speed>` with a "New" `StatusChip` outside the label for a model added since the team saved; six `Select`s in a "Defaults" group, each starting with "System default (<name>)"; the switch "Opus requires a personal token" with its helper text (disabled in API mode, "Only applies in CLI mode."); and an ink Save (§8.2). A 400 shows inline as `Notice tone="error" role="alert"`.

### 8.20 The draft-page notices: image style, image key, fonts and facts check

The notices sit under the post, its caption line and the "Generated with" lines, in the Preview section's proof column (§8.12), in this order: the background notice (`BackgroundNotice`, 008), the image-key notice, the font notice, the image-style notice (`CompositionNotice`), the facts check and the stale-headline badge (§8.21). The image-key and font notices are drawn in `drafts/[id]/page.tsx`; the others have their own file in `src/components/drafts/`. Each is a `Notice` (§8.18) with `tone="warning"` and `role="status"`: a heads-up about a working post, never a blocker (Publish stays enabled).

**Anatomy: the one draft-notice form.** Every draft notice, in every file, is this form: a `Notice` with `icon={<Icon {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden="true" />}` (a lucide `LayoutTemplate` for the image style, `ShieldAlert` for the facts check, `Type` for the headline, `ImageOff` for the background), then a body of a `font-semibold` title line (the image-style notice's reads "Image style", the facts check's "Facts check", the headline's "Headline", the background's "No AI background") and a `mt-1 text-ui-xs text-fg` message line. Each carries its `data-testid`, and a `data-reason`, `data-status` or `data-state` where it has one. The image-key and font notices have the message line only. The notice itself is `mt-4`.

**Atoms and tokens.** `Notice` carries the fill and the ring: `--status-scheduled` text on its 10 % fill, ringed in `currentColor` (§3.2, the pair §3.3 checks), radius `--radius-sm`. Message text is `--fg` on that fill. A value quoted in a notice is in the body face, `font-semibold tabular-nums break-all`: JetBrains Mono is for code only (§5.1). No notice has a bezel, a pill, a boxed mark or a shadow.

**The image-style notice** (`CompositionNotice`) shows the fixed per-reason line for the look that was not applied. Its `data-reason` names the reason; a `composite-*` reason is a product screenshot that could not be placed, and the post fell back to the classic look.

**States.** One notice per cause, stacked, none shown for a clear state. Light and dark use the same classes: the status colour, its 10 % fill and `--fg` text are checked in both themes (§3.3), so no notice sets a theme class.

### 8.21 The facts-check notice and the stale-headline badge

**The facts-check notice** (`FactsCheckNotice`) is the §8.20 anatomy with the title "Facts check". When the check is `flagged` it lists each value as `<span class="font-semibold tabular-nums break-all">` with its source in parentheses, then the fixed advice sentence; when the check could not run it shows one message line. It renders nothing for a clear check or one that was never run.

**The stale-headline badge** (`HeadlineImageNotice`) is a §8.20 notice with the title "Headline" and the `Type` icon. Under the title are the headline line, an optional reason line and an optional scheduled-post line, each `mt-1 text-ui-xs text-fg`. Then an action row, `mt-3 flex flex-wrap gap-2`, of secondary small `Button`s (§8.2), each with its own `aria-label`:

| Action            | When it shows                                                               |
| ----------------- | --------------------------------------------------------------------------- |
| Edit inline       | Always; disabled when the draft cannot be edited inline or an action runs.  |
| Regenerate design | Freeform posts with a design.                                               |
| Apply to image    | Only while the headline is `stale` (no model call; a confirm dialog first). |

"Apply to image" can carry a "Beta" mark, a small-caps word with no box (`ml-1.5 text-fg-muted` plus `SMALL_CAPS`, §7.1 has no pill chips), only while the re-measure sits below its bar; today the mark is off. The badge and the three buttons are disabled while any draft action runs. Nothing renders for a `fresh` or `unknown` headline.

**States.** `stale` and `unconfirmed` both show the badge (the text differs). The Apply confirm uses the confirm dialog (§8.10) with the old and new headline in curly quotes. A failed apply names the reason in a toast, and a render-time failure arrives as the page's failure line. Light and dark are identical.

### 8.22 The post style picker

`PostStylePicker` (`src/components/brief/PostStylePicker.tsx`) opens step 1 of the post wizard, above the size and design choices. `SizeDesignStep` places it in a `SECTION` block (`py-6`, a 1 px `--line-subtle` rule above), like the size, kit and design-mode blocks below it. The picker is one `radiogroup`, with one tab stop and the arrow, Home and End keys moving the choice. It is built from `FieldLabel`, `cardCls`, `CARD_TITLE` and `ICON`; it is the same option card as the size and design-mode cards of the same step, with no structure of its own.

**Anatomy.** A `FieldLabel as="span"` ("Post style", §8.3) names the group (`aria-labelledby`). Under it a `--text-xs` `--fg-muted` line says what a style does. Then a grid, one column and two from `sm`, 12 px apart, of option cards. Each card is a `role="radio"` button drawn by `cardCls` (`brief/cardCls.ts`): the style's label (`CARD_TITLE`, `brief/classes.ts`: display face, 18 px, 500) with a 15 px `Check` in `--accent` at the right when chosen, and the style's summary (`--text-xs`, `--fg-muted`) beneath. A retired style that is already chosen stays in the list with "(retired)" in `--fg-muted`.

**Atoms and tokens.** The card is a ruled control, not a panel: a 1 px `--line` edge on the page ground, `--radius-md`, text in `--fg`. No shadow, no blur.

| State    | Look                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Idle     | transparent fill, 1 px `--line` edge                                                                          |
| Hover    | the edge turns `--fg`                                                                                         |
| Selected | `--surface-2` fill and a 2 px ink frame (the `--fg` border plus an inset 1 px `--fg` ring), the check showing |
| Focus    | the §9 outline (`FOCUS`), 2 px `--focus` at 2 px offset, on the card that holds the tab stop                  |

**Light and dark.** The same classes serve both themes: `--line`, `--fg` and `--surface-2` switch with the `.dark` class and keep the 3:1 edge of §3.3.

### 8.23 The image look picker

The "Image style" section of the same step (`SizeDesignStep`, Freeform only) picks how the hero image sits in the post. It is a group of `aria-pressed` toggle cards on the same `cardCls` option card as the post style picker, three columns from `sm`, in a `SECTION` block of `SizeDesignStep.tsx` (`data-testid="image-style-section"`) shown only in Freeform mode.

**Anatomy.** A `FieldLabel` "Image style", a `--text-xs` helper line and, when the style came from the post style, a second `--text-xs` line. Each card shows the look's label (`CARD_TITLE`), a `Check` when chosen, its summary, and, for a look that cannot be used at the chosen size or without a screenshot, one more `--text-xs` `--fg-muted` line giving the reason. The product screenshot field sits below as its own section (a `FieldLabel as="span"` with an `(optional)` or `(required)` note in normal case, a Secondary `Button` to add, a 96 × 64 px thumbnail with a Remove button once attached). Its required line is `--status-failed`.

**Atoms and tokens.** As §8.22. Sections are ruled apart by `SECTION` (`py-6`, a 1 px `--line-subtle` rule above); an empty state is the `.surface` panel at `--text-sm` `--fg-muted`.

| State                  | Look                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Idle, hover, selected  | as the post style card (§8.22)                                                      |
| Disabled (unsupported) | `disabled:opacity-60`, `cursor-not-allowed`, no hover change; the reason line shows |
| Focus                  | the §9 outline                                                                      |

A look that is not available is disabled with its reason, never hidden. Light and dark are identical.

### 8.24 The rule review panel

`RuleReviewPanel` (`src/components/textUpgrade/`) sits under the text field it reviews: the brand-kit voice prompt editor (`PromptSection`) and the project briefing editor (`ProjectBriefingSection`, `src/components/projects/`). It draws a `RuleReview` from `useRuleReview` and holds no state of its own.

**Anatomy.** A `section` (`role="region"`, `aria-label="Design rules"`) of stacked blocks, 12 px apart:

- **Head:** an `h4` in the sub-head style (`SUB_HEAD`, §5.2) on the left, and on the right a `--text-xs` `--fg-muted` count ("2 phrases flagged", or "No vague phrases flagged"), an `aria-live="polite"` region.
- **Flagged list:** ruled rows (`divide-y` on `--line-subtle`, 10 px padding), not cards. A row holds the quoted phrase in `font-mono` `--text-sm` 600, its rule label as a `TAG` (§8.18), a `--text-xs` `--fg-muted` "Try:" line, and a ghost small "Dismiss" `Button` at the right (its `aria-label` names the phrase).
- **Upgrade:** a secondary small `Button` with a 15 px `Sparkles` icon, "Upgrade", showing "Upgrading…" while it runs.
- **Notices:** each is a `Notice` (§8.18). A failed call is `tone="error" role="alert"` with a "Try again" secondary small `Button` when it can be retried. A warning is `tone="warning" role="status"`. The neutral tone (`--surface-1` fill, `--line` ring) carries the "nothing to upgrade" and "suggestions failed the checks" lines.
- **Proposed edits:** ruled rows again. Each is a `role="group"` with the kind ("Replace" or "Add after") and the provenance as two small-caps `EYEBROW` words (no box), then the sentence (a replaced quote struck through in `--fg-muted`, the new wording in `ins` 600 with no underline), the rationale (`--text-xs` `--fg-muted`), an unverified-number `Notice tone="warning"`, and the action row: an Ink small "Accept" and a ghost small "Reject", or, once settled, a small-caps status word (`SMALL_CAPS`): "Accepted" in `--status-published`, "Rejected" in `--fg-muted`, as the refine log's status words (§8.14). The rule label on a flagged row keeps its `TAG`.

**Atoms and tokens.** `SUB_HEAD`, `EYEBROW`, `SMALL_CAPS`, `TAG` (the rule label only), `ICON`, `Notice`, `Button`; the row rules are `--line-subtle`. The panel has no fill, ring or shadow of its own, and no bezel: it reads as part of the editor's section.

| State        | Look                                                          |
| ------------ | ------------------------------------------------------------- |
| No flags     | the head count only; no list                                  |
| Flagged      | the ruled list, one row per phrase                            |
| Upgrading    | the Upgrade button disabled with its working label            |
| Edit pending | Accept (Ink) and Reject (ghost) side by side                  |
| Edit stale   | Accept disabled, a `--text-xs` `--fg-muted` line says why     |
| Edit settled | the "Accepted" or "Rejected" status word replaces the buttons |

**Light and dark.** The same classes serve both themes: the notice tints and `--fg-muted` text are the pairs §3.3 checks.

### 8.25 The script font picker

`ScriptFontPicker` (`src/components/admin/brandkits/ScriptFontPicker.tsx`) is the one control for the font a brand kit uses for Sinhala text. It shows only while the kit is in edit mode, in the Fonts section ("iii."), under the `FontEditor`.

**Anatomy.** One `Select` (§8.3) labelled "Sinhala font" (`FieldLabel` above it), with the first option "None (system font)" and then each family that carries the script, read from `GET /api/fonts?script=sinhala` through React Query (key `['fonts', 'script', 'sinhala']`, five minutes fresh). A stored family the list no longer holds is added as an option so it still shows as selected. The two blocks in the section are `space-y-4` apart.

**Atoms and tokens.** The field is the `Select` of §8.3: 1 px `--line` edge, `--radius-sm`, `--surface-2` fill, the chevron `background-image`, the focus ring of §9. The picker adds no class of its own: its only primitives are `Select` and `FieldLabel`.

| State                   | Look                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None chosen             | "None (system font)" selected                                                                                                                            |
| Family chosen           | the family's name selected; Save writes `scriptFonts.sinhala`                                                                                            |
| List loading            | the options hold "None" and the stored family only; the full list fills in on arrival                                                                    |
| Read-only (not editing) | no select: `KitDetail`'s Fonts list shows the family as a ruled row with a "Sinhala" `TAG` (the Heading and Body roles in that list are `EYEBROW` words) |

**Light and dark.** Identical.

### 8.26 The caption route card

`CaptionRouteCard` (`src/components/team/`) is the first section of `/team` (numeral "i."): the one place a team admin names the credential its captions run on. It renders `GET /api/team/caption-route` and holds no rule of its own.

**Anatomy.** A section named by its heading (`aria-labelledby`): a `SectionHead` ("Caption route", numeral "i.") over a body opened by the 2 px ink block rule (`BLOCK`, §6). In the body, a `--text-sm` `--fg-muted` helper paragraph; then, 16 px below, a row of a `SegmentedToggle` (§8.4, "Caption route": "Claude CLI (OAuth)" or "Anthropic API key") and, once a route is chosen, a small secondary `Button` "Use the default"; then one state line.

**Atoms and tokens.** `SectionHead`, `BLOCK`, `SegmentedToggle`, `Button`, `Notice`, `QueryError`. The card has no fill, ring or shadow of its own: like every `/team` section it is a numbered head over a ruled body, 48 px (`gap-12`) from the next.

| State           | Look                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Loading         | "Loading…" in `--text-sm` `--fg-muted`                                                                       |
| Ready           | one `--text-sm` `--fg` line: "Captions run on <route>."                                                      |
| No route chosen | the same line says the server default applies; no "Use the default" button                                   |
| Not ready       | `Notice tone="warning" role="status"` with the server's message and "New captions fail until this is fixed." |
| Save failed     | `Notice tone="error" role="alert"` with the server's message                                                 |
| Load failed     | `QueryError` with Retry                                                                                      |

**Light and dark.** The same classes serve both themes (`--fg`, `--line`, and the notice tints §3.3 checks).

### 8.27 The insights page: section, data table and rate bar

`/admin/insights` (super admin only) is one page of ruled sections, each answering one question. Its parts are in `src/components/admin/insights/`.

**The section** (`InsightSection`) is a `role="region"` named by its heading (`aria-labelledby`, `data-testid="section-<id>"`): a `SectionHead` (no numeral: the page does not number its sections; `mb-3`) with an optional tail (a `StatusChip`), over a body opened by the 2 px ink block rule (`BLOCK`, §6). The body holds a one-line `--text-sm` `--fg-muted` question, then the content 20 px apart. Sections sit 48 px apart. A sub-block (`Block`) is an `h3` in the sub-head style (`SUB_HEAD`, §5.2) over its table. A figure (`Stat`) is Folio's KPI: an `EYEBROW` label over a display numeral (`font-display text-ui-2xl`, tabular figures, `opsz` 144) on a row ruled below in `--line-subtle`, with no box; the numeral carries the `data-testid`. Figures sit in a grid of two columns (four from `sm`). Primitives: `SectionHead`, `BLOCK`, `SUB_HEAD`, `EYEBROW`.

**The data table** (`DataTable`) is §8.15: a scroll region (`tabIndex={0}`, `role="region"`, an `aria-label`, `SCROLL_FOCUS`), `relative` so it never widens the page, holding a table with a minimum width. The head row is `TABLE_HEAD_ROW` (small caps, `--fg-muted`, 0.1em); every row, the last included, is ruled below in `--line-subtle`; numeric columns are right-aligned. An empty table is one `--text-sm` `--fg-muted` line.

**The rate bar** (`RateBar`) draws a rate as a 64 × 6 px `--radius-sm` track in `--line-subtle` with an `--accent` fill, then the number in `--text-sm` tabular figures. The number is always visible text; the bar is decorative (`aria-hidden`), so a rate is never carried by colour alone.

| State             | Look                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| Loading           | "Loading insights…" (`role="status"`, `--text-sm` `--fg-muted`)      |
| Empty table       | the table's empty line; the section and its head stay                |
| Rate unknown      | an empty track and the placeholder number                            |
| Events lost       | `Notice tone="warning" role="status"` above the lost-events table    |
| Retention health  | a `StatusChip` in the section tail: `published`, `failed` or `draft` |
| Not a super admin | `GateNotice` ("Requires super admin"), nothing else                  |

**Light and dark.** Identical: the track, rules and text are tokens that switch with `.dark`.

---

## 9. Accessibility floor

- **NFR-01, contrast.** Every text-on-surface pair meets WCAG 2.2 AA in both themes: 4.5:1 for body text, 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold). Every non-text boundary a user must perceive (input and control edges, focus) meets 3:1 against its adjacent surface. §3.3 shows every declared pair passing; T4's `contrast.test.ts` enforces it. `--line-subtle` is decorative and is never a boundary or a text colour.
- **NFR-02, visible focus.** Every interactive element shows `outline: 2px solid rgb(var(--focus))` with `outline-offset: 2px` on `:focus-visible`. That is at least 6.22:1 on paper and 6.60:1 on espresso. A Tailwind `ring-2 ring-focus ring-offset-2 ring-offset-canvas` is an accepted equivalent where an outline would be clipped. `outline: none` without a replacement is never allowed.
- **NFR-03, reduced motion.** §7.3.
- **Status is never colour alone.** Chips and refine outcomes always carry a text label.
- **Targets.** Controls take their height from the `--control-*` tokens (§3.1, §8.2, §8.3): `--control-md` by default, `--control-sm` for small controls, both above WCAG 2.2's 24 × 24 px minimum.
  - **The 24 px box (014 FR-18).** A remove or delete target is at least 24 × 24 px as **its own border box** (`boundingBox()` at zoom 1), not by the spacing exception's hit area. An icon-only remove button that is not an `ICON_BUTTON` (30 × 30) is `inline-flex h-6 w-6 items-center justify-center`, as the ColorEditor and FontEditor "Remove …" buttons and the Recent Drafts "Discard unfinished brief" are.
- **Every field has a label (014 FR-12).** A visible, associated label (§8.3): the `label` prop, `FieldLabel htmlFor`, or `aria-labelledby` a visible heading or `dt` (the draft caption and refine prompt, the project aside selects). A placeholder is never a field's only name. `aria-label` alone is kept only where a visible label would repeat a sibling's (each row's "Post topic" in the proposed schedule).
- **Every tablist has a name (014 FR-13).** `SegmentedToggle` takes a **required** `label`, rendered as the `tablist`'s `aria-label` ("Filter by status", "Provider slot", "Prompt view", "Briefing view", "Size", "Design", "Edit mode"). `tsc` fails without it.
- **Stepper steps not yet reached are `aria-disabled="true"` (014 FR-15).** They stay focusable, so the tab order is unchanged; the current step is `aria-current="step"`, and done steps carry neither.
- **A name is read once (014 FR-16).** Decorative duplicates are `aria-hidden`: a kit row's colour swatches (they keep their `title`), and a breadcrumb's current-page crumb, which stays visible while the `h1` beneath carries the name.
- **One `h1` per page,** including `/login` (a `sr-only` "Sign in to Studio", 014 FR-14).
- **The axe scan (014 AC-19).** `tests/e2e/a11y.test.ts` injects `axe-core` and runs `label`, `select-name`, `aria-input-field-name`, `aria-toggle-field-name`, `button-name`, `link-name`, `page-has-heading-one`, `scrollable-region-focusable`, `target-size`, `aria-allowed-attr`, `aria-valid-attr-value` and `aria-required-attr` on the main routes, in light theme at 1440 px, and expects zero violations. A rule is never removed to make the scan pass. `nested-interactive` is not in the list because of the library tile's nested button, which predates 014.
- **375 px.** Every screen works at 375 px wide with no horizontal page scroll (A4, AC-11, AC-12).

---

## 10. Build decisions carried over from Frozen Light §0

| Frozen Light §0 decision                                                                                                                                                                                      | Status under Folio                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Theme default and persistence.** Follow the OS (`prefers-color-scheme`) on first visit, then remember the user's manual toggle in `localStorage`. Apply the class before first paint. Not stored in the DB. | **Kept, unchanged.** The key is `bistec-theme`; `themeInitScript` (`src/components/theme/ThemeProvider.tsx`) sets `.dark` on `<html>` before paint (NFR-04). A user's stored choice survives the redesign.                  |
| **Both a dark and a light theme are mandatory**, switched by the `dark` class on `<html>` (Tailwind `darkMode: "class"`).                                                                                     | **Kept.** The token switch keys on the same class. Portaled Radix and Sonner surfaces inherit the tokens from `<html>`.                                                                                                     |
| **Self-host fonts and icons; no runtime CDN.**                                                                                                                                                                | **Kept; the fonts change.** Fraunces, Instrument Sans and JetBrains Mono through `next/font/google` (build-time download, served by the app). Icons stay `lucide-react`. Inter is dropped.                                  |
| **Design fidelity: Frozen Light is a starting point, not a rigid spec;** deviate where a screen needs it.                                                                                                     | **Changed.** Screens may change layout within the page (FR-12 allows it), but **never through ad-hoc values**: colours, sizes, radii, shadows and durations come from the tokens. A raw value needs a `ui-exception` (§11). |
| **Shared foundation first** (then task T25): theme config, utilities, theme provider and base components before screen work.                                                                                  | **Kept, renamed.** 011 T4 (tokens) and T5 (primitives and the surface classes) land before any screen task, and T6 (shell) before the screens.                                                                              |

Frozen Light rules that **no longer hold**: the glass utilities and glow blobs; ghost-fill buttons; the ice-blue accent and `primary-light` convention; JetBrains Mono for metadata; Material Symbols; icons in the sidebar nav; and "never re-type the brand as text" (§8.1).

---

## 11. The `// ui-exception:` convention and the guards

**App code uses semantic tokens only.** The AC-12 check and the guard test (`tests/unit/uiTokenGuard.test.ts`, AC-14) flag three patterns (011 `design.md` §7):

```
(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder)-(light|dark)-[a-z-]+
\bglass(-panel|-popover|-input)?\b
(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|sky|blue|red|green|amber|emerald|violet|purple|indigo|rose|orange|yellow|teal|cyan|lime|pink|fuchsia)-\d{2,3}
```

The guard also flags `GlassInput` and `GlassPanel`, the names of the removed Frozen Light primitives. It walks every `.ts`, `.tsx` and `.css` file under `src/` and fails with `file:line` for each hit.

**Four more tokens (014 FR-11):** `glow-blob`, `animate-scale-in` (use `animate-modal-in`, §8.10), `font-inter` (the body is Instrument Sans, §5.1) and the legacy `primary` colour family, `(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|decoration|shadow)-primary` with any `-<word>` suffix (`bg-primary-light`). These match as **whole class tokens**:

- a token starts at the start of the line or after one of ``\s " ' ` { ( :``, so a variant (`hover:text-primary`, `md:animate-scale-in`) is caught;
- it ends at the end of the line or before one of ``\s " ' ` } ) ] /``, so an opacity (`text-primary/50`) is caught, or before `, . ; :`, the punctuation that follows a token in prose;
- so `variant="primary"`, `my-glow-blob-x`, `xtext-primary` and `animate-scale-in-out` pass.

**Comments are scanned like code.** A comment that names a retired token by its class name fails; describe it instead ("not the old scale-in keyframe").

**The shared-name guard (014 FR-05)** lives in the same file: §8.18. `// ui-exception:` does not apply to it.

**The Graphite deny-list (032 FR-14).** This is the Folio system again, and the same file keeps the 021 Graphite look from returning. It fails on the Tailwind keys that only the Graphite config had, the Graphite font and the PNG logo:

```
\brounded-ui-xl\b
\btracking-label\b
\b[\w:-]+/12\b        (the 021 status-tint alpha; ignores comments)
Plus Jakarta
BistecStudioLogo
```

It scans `src/app/**`, `src/components/**` and `tailwind.config.ts`, including `ui/atoms.ts` and every `classes.ts`. Post font data (`src/lib/fonts/catalogue.json`) is not read. `// ui-exception:` does not apply (there is no legitimate Graphite leftover). The 021 Folio deny-list is gone; its one surviving rule is that no file imports a path ending in `/folio` and no module is named `folio`.

**`PENDING_RESTYLE`.** A file that a change after 021 touched and that is not yet restyled is listed by path in `uiTokenGuard.test.ts`. It is exempt from the Graphite deny-list and from the shared-name guard until the 032 task that restyles it removes it. A listed file must exist and still fail, so a file that passes has to leave the list. The last restyle task sets `W3_DONE`, after which the list must be empty.

**`designTokens.test.ts`** pins the tokens to `direction-studies/study-b-folio.html` (§3), the Tailwind mapping, the surface classes and the control-height literals (§6).

**A line may opt out of the token guard** by carrying `// ui-exception: <reason>` on the same line. The guard skips that line. Inside JSX children, where `//` is not a comment, write `{/* ui-exception: <reason> */}` on the same line. The reason says why a token cannot serve.

**The expected exceptions are only these:**

- **Brand-kit colour swatches** in the brand-kit admin and the brief wizard. They show the kit's own colour, as an inline style from data.
- **The post-preview frame:** the post preview, the lightbox image, library thumbnails, and controls drawn on top of a post (the expand button, §8.12). Tokens never restyle a rendered post. The inline editor's hover and focus outlines are CSS injected into the post's own iframe, where the app's variables don't reach, so they carry the light `--accent` value as literal `rgba(140,72,18,…)`.

Anything else that seems to need an exception is a missing token. Raise it rather than writing the raw value.

---

## 12. Words

**The glossary for every word a person reads in the app (031 FR-05).** Routes, API fields, Prisma names, enum values, analytics names and code identifiers do not change; only the words on screen and in user-facing messages do. `tests/unit/uiWordingGuard.test.ts` enforces the retired terms in `src/app/(app)/**` and `src/components/**`; a line opts out only with `// wording-exception: <reason>` (JSX form: `{/* wording-exception: <reason> */}`), and the reason names the code value that is shown verbatim.

| Rule                                                               | Applies to                                                                                                                                                                                                                                                                                                       | Does not apply to                                                                                                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **post**, not "brief"                                              | page titles, buttons, lists, toasts, empty states and errors for the thing a user creates (`/brief` page title "New post"; "Create post"); the Content step's text field is "Description"                                                                                                                        | routes (`/brief`), API fields, Prisma models (`Brief`, `Post`), analytics names, code, docs about code. The publish record is "published post" in the UI where it must be told apart |
| **Template** / **Freeform**, not "Path A" / "Path B"               | every UI label, column and badge                                                                                                                                                                                                                                                                                 | `designMode` values, code, docs about code, E2E test names                                                                                                                           |
| **Brand kit** (sentence case; "brand kits" plural)                 | all UI text, the nav item, model-catalogue labels shown in the UI                                                                                                                                                                                                                                                | route segments (`/admin/brandkits`), code identifiers                                                                                                                                |
| **Project**, not "campaign"                                        | page titles, nav, the wizard step, the library filter, buttons, toasts and errors for a group of posts with shared defaults (`/projects`)                                                                                                                                                                        | the retired `campaignId` field and its `CAMPAIGN_RETIRED` code, the bucket `campaign-docs`, operator scripts                                                                         |
| **General caption**, **Curated caption**, **Curate for <channel>** | the caption desk (039): the platform-neutral caption every post has ("General caption" as a heading, "general caption" in a sentence: "Copy general caption"), a channel's caption written on request ("Curated captions" heading, "Instagram caption" card, "Curate for Instagram" button, "Deleted" with Undo) | the enum `CaptionKind` and the route `regenerate-copy`                                                                                                                               |
| **Team settings**                                                  | the `/team` page title, nav and every pointer to it ("Team settings > AI providers")                                                                                                                                                                                                                             | the route `/team`                                                                                                                                                                    |
| **Captions** / **Images** for the `COPY` / `IMAGE` slots           | `/team` toggles, tags, headings and server messages shown to users. Helper text: "Captions: writes captions and headlines."                                                                                                                                                                                      | the enum values `COPY` and `IMAGE`                                                                                                                                                   |
| **Image generation key**                                           | the personal key card and every pointer to it                                                                                                                                                                                                                                                                    | the route `/api/me/openai-key`, the table `UserOpenAiKey`                                                                                                                            |
| **Sentence case** for labels, headings, buttons and titles         | all UI                                                                                                                                                                                                                                                                                                           | proper nouns and product names (Instagram, LinkedIn, OpenAI, Gemini, Claude)                                                                                                         |
| **US spelling** (color, organize)                                  | all UI text and user-facing messages                                                                                                                                                                                                                                                                             | code identifiers already in use, Prisma fields                                                                                                                                       |

**UI to code mapping** (what a UI word means in the code):

- post ↔ `Brief` (the thing a user creates)
- project ↔ `Project` (038: it took over the briefing, documents and defaults of the retired campaign)
- Template ↔ `designMode: TEMPLATE`; Freeform ↔ `designMode: GENERATE`
- Captions ↔ the `COPY` provider slot; Images ↔ the `IMAGE` provider slot
- Image generation key ↔ `UserOpenAiKey` (route `/api/me/openai-key`)
- Brand kit ↔ `BrandKit`; Team settings ↔ the `/team` page

The deny-list today: `Path A`, `Path B`, `Brand Kit`(s), `Brandkits`, `Brand-kit`, `copy provider` (any case), `COPY provider`, `colour`(s), `Organise` and `New Brief`. Change 031 task T5 adds `OpenAI key` once the personal key card is renamed.
