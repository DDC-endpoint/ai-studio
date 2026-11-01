# Spec: Template viewer

**Change:** 040-template-viewer
**Created:** 2026-10-30
**Size:** bounded

## Requirements

- **FR-01 (preview atom):** `TemplatePreview` in `src/components/ui/` renders a template's stored HTML in an `<iframe srcDoc>` with `sandbox=""` (empty: no scripts, unique origin, no forms, no navigation; never `allow-same-origin` or `allow-scripts`). The iframe is laid out at the template's canvas size from `dimensionsFor(aspectRatio)` (`src/lib/aspectRatio.ts`, the only place pixel sizes live) and scaled with a CSS transform to the width of its container, keeping the aspect ratio. The iframe has a `title`, `aria-hidden`, `tabIndex={-1}` and `pointer-events: none`. No pixel size is written in the component.
- **FR-02 (kit viewer):** On the kit detail page (`KitDetail.tsx`, "HTML templates"), each template's name is a button. Clicking it opens the shared `Modal` with the template name as title, its size tag, and `TemplatePreview` at a readable width. The HTML comes from the kit already loaded (`kit.templates[].htmlTemplate`); no request is made. Delete and the other actions are unchanged.
- **FR-03 (read route):** `GET /api/templates/[id]` returns `{ id, name, aspectRatio, htmlTemplate }` for a template whose parent kit belongs to the caller's team and is not deleted. It uses `withTeamAuth` (any team member, like `GET /api/templates`). Another team's template, a deleted kit's template and an unknown id all return 404 with the same body. `GET /api/templates` (the list) is unchanged and never returns HTML.
- **FR-04 (wizard preview):** In the wizard's design step (`SizeDesignStep.tsx`), when a Path A template is selected, `TemplatePreview` of that template shows under the template grid. When a Path B style reference is selected, the same preview shows under the reference grid. "No reference" or no selection shows no preview. The HTML is fetched from FR-03 on selection and cached per id for the session. A fetch failure shows a one-line muted message in place of the preview and does not block the wizard.

## Non-functional

- **NFR-01:** No schema change, no migration, no env var, no server render.
- **NFR-02:** The UI token guard, the wording guard (`uiWordingGuard.test.ts`) and the design system (`docs/ui-reference/DESIGN_SYSTEM.md`) hold. The template's own HTML is data and is not styled by tokens.
- **NFR-03:** The preview never runs the template's scripts and never gives it access to the app's origin (FR-01's sandbox is the control).

## Acceptance Criteria

- **AC-01:** A unit test of `GET /api/templates/[id]` covers: own team's template (200 with the four fields); another team's template (404); a deleted kit's template (404); unknown id (404).
- **AC-02:** A unit test of `TemplatePreview` checks the iframe has `sandbox=""` exactly (no `allow-*` token), `srcdoc` equal to the input HTML, and width and height from `dimensionsFor` for each `AspectRatio` value.
- **AC-03 (E2E):** On `/admin/brandkits`, clicking a template name opens a dialog whose iframe's `srcdoc` contains a marker string from the seeded template HTML; Escape closes it.
- **AC-04 (E2E):** In the wizard with a kit that has two templates of the current size, selecting the first shows a preview whose `srcdoc` contains its marker; selecting the second changes it to the second marker. In Freeform, selecting a style reference shows its preview; "No reference" hides it.
- **AC-05 (E2E):** `GET /api/templates/<other team's id>` as a member of another team is 404 (in `team-isolation.test.ts`).
- **AC-06:** The a11y suite passes on the kit detail page with the viewer open.
- **AC-07:** `tsc`, lint, the unit suite and the full E2E mock suite pass in CI.

## Edge Cases

- A large template (about 1.8 MB with inline `data:` assets): FR-03 returns it whole; the wizard fetches only the selected one.
- A template whose size does not match the brief: the picker already filters by size, so the preview always uses the template's own `aspectRatio`.
- External fonts or images in a template load in the viewer's browser as written; placeholder text shows unfilled (proposal: out of scope).
- axe and a sandboxed, script-less iframe: if the a11y scan cannot enter the frame, exclude the iframe from the scan by selector, not the page.

## Approach

One shared atom draws the HTML in a fully sandboxed, scaled iframe; both screens use it. The kit page reuses data it already has; the wizard fetches one template at a time from a new team-scoped read route beside the list route.

| File                                                                                                                                                                        | Change                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/components/ui/TemplatePreview.tsx` (+ `index.ts` export)                                                                                                               | New atom (FR-01)                              |
| `src/components/admin/brandkits/KitDetail.tsx`                                                                                                                              | Name becomes a button; viewer `Modal` (FR-02) |
| `src/app/api/templates/[id]/route.ts`, `src/lib/api-types.ts`                                                                                                               | New route and its response type (FR-03)       |
| `src/components/brief/SizeDesignStep.tsx` (and `useBriefWizard.ts` only if the fetch belongs there)                                                                         | Selected-template preview (FR-04)             |
| `tests/unit/templatePreview.test.ts`, `tests/unit/templateRoute.test.ts`, `tests/e2e/template-viewer.test.ts`, `tests/e2e/team-isolation.test.ts`, `tests/e2e/a11y.test.ts` | AC-01 to AC-06                                |
