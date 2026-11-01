// Shared class helpers for the brief wizard's pickers, on the Folio tokens
// (DESIGN_SYSTEM.md §8.2–§8.4, §9): rules and ink, opaque, no blue. The shared
// atoms (FOCUS, SMALL_CAPS, the section-head strings, NOTICE) come from
// @/components/ui; this module keeps only the brief's own pickers (014 FR-02).

import { FOCUS } from '@/components/ui/atoms'

// An option card (size, generation path, template, reference). Idle: a 1 px
// --line control edge on the canvas, --fg on hover. Selected: paper fill and a
// 2 px ink frame (the --fg border plus an inset 1 px --fg ring).
export function cardCls(selected: boolean, extra = '') {
  return [
    'rounded-ui-md border text-left font-text',
    'transition-[background-color,border-color,box-shadow] duration-fast ease-standard',
    FOCUS,
    selected
      ? 'bg-surface-raised border-fg ring-1 ring-inset ring-fg'
      : 'bg-transparent border-line hover:border-fg',
    extra,
  ].join(' ')
}

// A ruled list row (the project list): no box, a --line-subtle rule beneath.
// Selected: paper fill, --fg weight and a 2 px --accent bar at the left edge,
// as the sidebar marks the current page (§8.6).
export function rowCls(selected: boolean, extra = '') {
  return [
    'relative w-full text-left font-text border-b border-line-subtle',
    'transition-colors duration-fast ease-standard',
    FOCUS,
    'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5',
    selected ? 'bg-surface-raised before:bg-accent' : 'hover:bg-surface before:bg-transparent',
    extra,
  ].join(' ')
}
