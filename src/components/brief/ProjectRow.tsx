'use client'

import React from 'react'
import { Check } from 'lucide-react'
import type { ProjectSummary } from '@/lib/api-types'
import { rowCls } from './cardCls'

// ─── Project row ─────────────────────────────────────────────────────────────
// A ruled row (DESIGN_SYSTEM.md §6: lists as ruled rows, not cards).

interface ProjectRowProps {
  project: ProjectSummary
  selected: boolean
  onSelect: () => void
}

export function ProjectRow({ project, selected, onSelect }: ProjectRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={rowCls(selected, 'flex items-center gap-3 py-3.5 pl-4 pr-3')}
    >
      <span className="flex-1 min-w-0">
        <span className={['block text-ui-base text-fg truncate', selected ? 'font-semibold' : ''].join(' ')}>
          {project.name}
        </span>
        <span className="block text-ui-xs text-fg-muted truncate">
          {project.postCount} post{project.postCount === 1 ? '' : 's'}
          {project.defaultBrandKit ? ` · ${project.defaultBrandKit.name}` : ''}
        </span>
      </span>
      {selected && <Check size={15} strokeWidth={1.4} className="text-accent flex-shrink-0" />}
    </button>
  )
}
