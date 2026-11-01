# Verify report: 040-template-viewer (Template viewer)

**Verdict:** PASS

All 7 acceptance criteria are met at `3c54e7c9`. CI run 41060132423 is green: the E2E suite ran 606 passed, 3 skipped (the three intentional skips), 0 failed, 0 flaky. Unit is 206 files and 4616 tests; the render-fidelity harness is 154 tests.

## Acceptance criteria

| AC    | Status                                                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | MET (unit coverage of the other-team and deleted-kit cases is indirect) | `tests/unit/templateRoute.test.ts`: 200 with exactly the four fields; one 404 body when nothing matches; the `where` equals `{ id, brandKit: { isDeleted: false, teamId } }`; 401 when signed out. Prisma is faked, so the other-team and deleted-kit cases are proven by the `where` assertion plus null-to-404. AC-05 adds a real cross-team 404. No test runs a real deleted-kit lookup. |
| AC-02 | MET                                                                     | `tests/unit/templatePreview.test.ts`, for every `ASPECT_VALUES` entry: `sandbox=""` with no `allow-`; width and height from `dimensionsFor`; `srcdoc` equal to the input after unescaping; `aria-hidden`, `tabindex=-1` and `pointer-events:none`.                                                                                                                                          |
| AC-03 | MET                                                                     | `tests/e2e/template-viewer.test.ts` "AC-03": "View template <name>" opens the dialog; the iframe `srcdoc` carries the marker and `sandbox` is `''`; Escape closes it.                                                                                                                                                                                                                       |
| AC-04 | MET                                                                     | "AC-04": no preview before selection, then marker A, then marker B. In Freeform the style reference preview shows B and is gone after "No reference". Each `waitForResponse` is created before its click.                                                                                                                                                                                   |
| AC-05 | MET                                                                     | `tests/e2e/team-isolation.test.ts`: the Hearts Talk template id is 200 for its team and 404 for ClientX.                                                                                                                                                                                                                                                                                    |
| AC-06 | MET                                                                     | `tests/e2e/a11y.test.ts` "AC-19 (040)": axe on the kit page with the viewer open and its iframe visible. No exclusion was needed.                                                                                                                                                                                                                                                           |
| AC-07 | MET                                                                     | Locally at HEAD: `tsc`/build, lint (0 errors) and unit (4616) pass. CI run 41060132423 is green, with E2E 606/3/0/0.                                                                                                                                                                                                                                                                        |

## Requirement checks

- **FR-01:** `TemplatePreview.tsx` has `sandbox=""` exactly, `srcDoc`, `title`, `aria-hidden`, `tabIndex={-1}` and no pointer events. Sizes come only from `dimensionsFor`, and the component holds no 3- or 4-digit number. It scales to the container width with a `ResizeObserver`, and the CSS `aspectRatio` keeps the shape.
- **FR-02:** in `KitDetail.tsx` the template name is a button that opens the shared `Modal` with the size tag and the preview. The HTML comes from the kit already loaded, and the delete button is unchanged.
- **FR-03:** `src/app/api/templates/[id]/route.ts` uses `withTeamAuth`, scopes through the parent kit and sends one 404 body. The list route is unchanged (an empty diff), so it still returns no HTML.
- **FR-04:** `SelectedTemplatePreview` looks the template up in `visibleTemplates`, so a stale or "No reference" selection renders nothing. It fetches with `useQuery` and caches per id (`staleTime: Infinity`). A failure shows "Preview unavailable." and does not block the wizard.
- **NFR-01:** the diff touches nothing under `prisma/`, and adds no env var and no server render.
- **NFR-02 and NFR-03:** only token classes are used, and the "Preview" caption is `FieldLabel as="span"`. The guard tests pass inside the unit suite. The empty sandbox is asserted in both unit and E2E.

## Scope

Source files are the Approach map plus `src/components/brief/SelectedTemplatePreview.tsx`. It was extracted so that `useBriefWizard.ts` stayed untouched, and it is logged as a `design_gap` learning. The unit test is `.test.ts` rather than `.test.tsx`, because vitest runs in a `node` environment; spec.md was corrected during the build. The other changed files are specclaw bookkeeping.

## Per-task reviews

- T1 — WARN(1): the `srcdoc` assertion was weak. Fixed by the orchestrator before commit.
- T2 — NOTE.
- T3 — WARN(2): an orphan `<label>` and a preview that could show for a stale selection. Both fixed before commit.
- T4 — NOTE.

## Verification

- `npm run test:unit` (via `specclaw-verify collect` at `3c54e7c9`): exit 0, 206 files, 4616 tests passed.
- `npm run lint`: exit 0, 0 errors.
- `npm run build`: exit 0.
- `npx vitest run tests/unit/templatePreview.test.ts tests/unit/templateRoute.test.ts`: 2 files, 7 tests passed.
- `npm run test:e2e:mock -- tests/e2e/template-viewer.test.ts tests/e2e/team-isolation.test.ts tests/e2e/a11y.test.ts` (local mock stack): exit 0, 62 passed.
- `gh run view 41060132423`: completed, success. E2E 606 passed, 3 skipped, 0 failed, 0 flaky; unit 4616 passed; render-fidelity 154 passed.
