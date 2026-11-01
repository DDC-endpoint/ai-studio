# Tasks: Template viewer

**Change:** 040-template-viewer
**Created:** 2026-10-30
**Total Tasks:** 4

## Summary

A shared sandboxed preview atom, a viewer on the kit page, a team-scoped read route, and a wizard preview of the selected template. Then E2E coverage. Spec: `spec.md`.

## Tasks

### Wave 1 — atom and route

- [x] `T1` — `TemplatePreview` atom and the kit page viewer
  - Files: `src/components/ui/TemplatePreview.tsx`, `src/components/ui/index.ts`, `src/components/admin/brandkits/KitDetail.tsx`, `tests/unit/templatePreview.test.ts`
  - Estimate: small
  - Kind: impl
  - Notes: FR-01, FR-02, AC-02. `sandbox=""` exactly. Sizes only through `dimensionsFor`. Use the shared `Modal` (pick a `size` that fits a 1080×1350 preview scaled down). Keep the existing delete button and its `aria-label`. Read `docs/ui-reference/DESIGN_SYSTEM.md` before styling.
- [x] `T2` — `GET /api/templates/[id]`
  - Files: `src/app/api/templates/[id]/route.ts`, `src/lib/api-types.ts`, `tests/unit/templateRoute.test.ts`
  - Estimate: small
  - Kind: impl
  - Notes: FR-03, AC-01. Mirror `src/app/api/templates/route.ts` (`withTeamAuth`, scope by `brandKit: { isDeleted: false, teamId: user.teamId }`). Same 404 for every miss. Follow an existing route unit test's mocking pattern (e.g. `tests/unit/fontsRoute.test.ts`).

### Wave 2 — wizard

- [x] `T3` — Wizard preview of the selected template
  - Files: `src/components/brief/SizeDesignStep.tsx`, `src/components/brief/useBriefWizard.ts` (only if needed)
  - Estimate: small
  - Kind: impl
  - Depends: T1, T2
  - Notes: FR-04. Fetch on selection with the data-fetching pattern the wizard already uses; cache per id. Preview under the Path A grid and under the Path B reference grid; none for "No reference". A failed fetch shows one muted line and never blocks Next.

### Wave 3 — E2E

- [x] `T4` — E2E: kit viewer, wizard preview, cross-team 404, a11y
  - Files: `tests/e2e/template-viewer.test.ts`, `tests/e2e/team-isolation.test.ts`, `tests/e2e/a11y.test.ts`
  - Estimate: medium
  - Kind: test
  - Depends: T1, T2, T3
  - Notes: AC-03 to AC-06. Mint a kit with two templates whose HTML carries distinct marker strings via the admin API; clean up after. Create each `page.waitForResponse` before the click that triggers it. If axe cannot scan the sandboxed frame, exclude the iframe by selector only.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred
