'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { ProjectBriefing, ProjectSummary } from '@/lib/api-types'
import { FOCUS, ICON } from '@/components/ui/atoms'
import { rowCls } from './cardCls'
import { StepHead } from './StepHead'
import { ProjectRow } from './ProjectRow'

// ─── Step 0 — Project ────────────────────────────────────────────────────────

interface ProjectStepProps {
  projectId: string
  projects: ProjectSummary[]
  onSelectProject: (id: string) => void
  onClearProject: () => void
}

// Read-only preview of the project's active briefing, so the author knows what
// context every post in this project already carries (and does not repeat it in
// the post prompt). Collapsed by default.
function BriefingPreview({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const { data: briefings = [] } = useQuery({
    queryKey: ['projects', projectId, 'briefing'],
    queryFn: () => apiFetch<ProjectBriefing[]>(`/api/projects/${projectId}/briefing`),
  })
  const active = briefings.find(b => b.isActive)
  if (!active) return null

  return (
    <div className="mb-6 border-b border-line-subtle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 py-3 text-left font-text text-ui-sm font-semibold text-fg rounded-ui-sm ${FOCUS}`}
      >
        {open ? <ChevronDown {...ICON} aria-hidden /> : <ChevronRight {...ICON} aria-hidden />}
        Project briefing (applies to every post)
        <span className="ml-auto text-ui-xs font-normal text-fg-muted">
          v{active.version}
        </span>
      </button>
      {open && (
        <p className="pb-4 pl-[23px] text-ui-sm text-fg whitespace-pre-wrap leading-relaxed">
          {active.content}
        </p>
      )}
    </div>
  )
}

export function ProjectStep({ projectId, projects, onSelectProject, onClearProject }: ProjectStepProps) {
  return (
    <div>
      <StepHead index={0} title="Select a project (optional)">
        Put this post in a project. The project&apos;s brand kit and post style become the defaults on
        the next step, and its briefing is added to what the AI reads. You can still change them.
      </StepHead>

      {/* The project's active briefing, read-only */}
      {projectId && <BriefingPreview projectId={projectId} />}

      {/* Ruled list, opened by the 2 px --fg rule */}
      <div className="border-t-2 border-fg">
        <button
          type="button"
          onClick={onClearProject}
          aria-pressed={projectId === ''}
          className={rowCls(projectId === '', 'flex items-center gap-3 py-3.5 pl-4 pr-3')}
        >
          <span className="flex-1 min-w-0">
            <span className={['block text-ui-base text-fg', projectId === '' ? 'font-semibold' : ''].join(' ')}>
              No project
            </span>
            <span className="block text-ui-xs text-fg-muted">
              Pick a brand kit yourself on the next step.
            </span>
          </span>
          {projectId === '' && <Check {...ICON} aria-hidden className="text-accent flex-shrink-0" />}
        </button>

        {projects.map(p => (
          <ProjectRow
            key={p.id}
            project={p}
            selected={projectId === p.id}
            onSelect={() => onSelectProject(p.id)}
          />
        ))}
      </div>
    </div>
  )
}
