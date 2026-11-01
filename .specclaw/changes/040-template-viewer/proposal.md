# Proposal: Template viewer

**Created:** 2026-10-30
**Status:** 🟡 Draft

## Problem

A brand-kit HTML template cannot be seen anywhere in the app. On the kit detail page (`KitDetail.tsx`, section "iv. HTML templates") a template is a name, a size tag and a delete button. In the wizard's Path A picker (`SizeDesignStep.tsx` with `TemplateCard.tsx`) a template is a name, a kit name and a swatch of the kit's first colour. A user picks a template by name alone and sees its design only after a generation, which spends a model call. A kit admin cannot check what a saved template, or one made by "From image", looks like.

The user asked for this on 2026-10-30.

## Proposed Solution

Render the stored template HTML in the browser, in a locked-down iframe, scaled to fit. Nothing is rendered or stored on the server.

1. **One preview component** in `src/components/ui/` (a shared atom, so the UI guard allows its use anywhere). It takes the HTML and the template's size (`aspectRatio`, through `dimensionsFor` in `src/lib/aspectRatio.ts`). It draws an `<iframe srcDoc>` at the canvas size (1080 wide) and scales it down with a CSS transform to the width it is given.
   - The iframe has `sandbox=""` (no scripts, a unique origin, no forms, no top navigation). It is not given `allow-same-origin`, so the template cannot read the app's cookies or DOM.
   - It is `aria-hidden` with `tabIndex={-1}`. A text label names the template.
2. **Brand kits viewer.** A template's name in the kit detail list becomes a button. It opens a modal (the existing modal atom) with the preview at a readable size, the template name and its size tag. The kit GET (`/api/admin/brandkits/[id]`) already returns `htmlTemplate`, so this needs no API change.
3. **Wizard preview.** When a template is selected in the Path A picker, a small preview of it shows under the picker. The same applies to the selected reference template in Path B's picker. The list route `/api/templates` stays small (it does not return HTML; one template is 1.8 MB). A new route `GET /api/templates/[id]` returns one template's `htmlTemplate` and `aspectRatio`. It uses `withTeamAuth` (any team member, like the list) and scopes the template by its parent kit's `teamId` and `isDeleted: false`. Another team's template, or a missing one, is 404.

The preview shows the template as authored. Its placeholder text is not filled in, and fonts and images load only if the HTML itself carries them (inline `data:` assets render; external links load as written).

## Scope

### In Scope

- The shared preview component (sandboxed, scaled `srcDoc` iframe).
- A view action on each template in the kit detail list, which opens a modal with the preview.
- A small preview of the selected template under the wizard's Path A picker and Path B's reference picker.
- `GET /api/templates/[id]`, team-scoped, with unit or E2E tests for 200, another team's template (404) and a missing id (404).
- E2E coverage: the kit viewer opens and shows the iframe; the wizard preview appears on select and changes when the selection changes.

### Out of Scope

- A server-rendered PNG thumbnail (Puppeteer, MinIO, a migration). The user chose the browser iframe on 2026-10-30.
- Showing or copying the HTML source. The user chose "preview only" on 2026-10-30.
- Editing a template, or previewing it while it is being added (the "Add template" form).
- Filling the template's placeholders with the brief's text, the kit's fonts (`applyPostFonts`) or a sample image.
- Previews on every card in the picker. Only the selected template is previewed.
- The scheduling queue's template picker (`QueueEntryModal.tsx`), which 037 removes.

## Impact

- **Size:** bounded (alters two existing screens and adds one read route beside an existing one; no schema change)
- **Files affected:** about 7 (estimated): the new preview component, `KitDetail.tsx`, `SizeDesignStep.tsx`, the wizard page that holds the selection, the new route, `api-types.ts`, tests
- **Complexity:** small
- **Risk:** low. The template HTML is author-controlled by a team admin and is shown only to members of the same team. The iframe runs no scripts and has no access to the app's origin. A template with external links (fonts, images) makes those requests from the viewer's browser, as the rendered post already does.

## Open Questions

- Decided by the user on 2026-10-30: the browser iframe, not a server PNG; previews in both places; preview only, no source view; build 040 before resuming the 037–039 program; no party panel.
- Should the wizard preview also show for an unselected card on hover? Proposed: no (selected only), to keep it small.

---

**To proceed:** Review this proposal and approve to begin planning.
