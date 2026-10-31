// Class helpers used by the projects screens and, until 038 T5, the campaigns screens
// (DESIGN_SYSTEM.md §6, §8.6). The shared atoms (FOCUS, EYEBROW, PAGE_TITLE,
// SECTION_HEAD, ICON, TAG and the rest) come from @/components/ui/atoms
// (014 FR-02); only these screen-specific strings live here.

// A row's title link: --fg in the display face, --accent on hover.
export const ROW_TITLE =
  'font-display text-ui-lg font-medium leading-snug text-fg break-words transition-colors duration-fast ease-standard hover:text-accent'

// Breadcrumbs (§8.6): --text-sm in --fg-muted, links underlined in --line,
// the current page in --fg 500.
export const CRUMB_LINK =
  'inline-flex items-center gap-1.5 rounded-ui-sm text-fg-muted underline decoration-line underline-offset-4 transition-colors duration-fast ease-standard hover:text-fg'
export const CRUMB_CURRENT = 'min-w-0 break-words font-medium text-fg'

// The aside's ruled blocks (brand kit, details): a small-caps h2 (EYEBROW plus
// mb-3) over a --line-subtle rule; the column opens with a 2 px --fg rule (§6).
export const ASIDE_BLOCK = 'border-b border-line-subtle py-4'

// A row in the projects lists: ruled below on --line-subtle
// under the list's 2 px --fg rule (§6).
export const LIST_ROW = 'flex min-w-0 items-start gap-3 border-b border-line-subtle py-3.5'

// The list itself: two columns from lg, opened by the 2 px --fg rule (§6).
export const LIST = 'grid grid-cols-1 border-t-2 border-fg lg:grid-cols-2 lg:gap-x-12'
