'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'
import type { ProjectSummary } from '@/lib/api-types'

export interface ProjectRef {
  id: string
  name: string
}

interface ProjectPickerProps {
  draftId: string
  /** The post's current project (null = none). */
  value: ProjectRef | null
  /** Called with the saved assignment, after the server accepted it. */
  onChanged?: (project: ProjectRef | null) => void
  /** A visible label (the post page). Without one, `ariaLabel` names the field. */
  label?: string
  ariaLabel?: string
  id?: string
}

// Assign, move or unassign one post (038 D22). One component for the post page
// and the library card: any member of the team may use it, because a move only
// relabels (the route is the view tier). The options are the team's live
// projects, "No project" first.
export function ProjectPicker({ draftId, value, onChanged, label, ariaLabel, id }: ProjectPickerProps) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummary[]>('/api/projects'),
  })

  const options = [
    { value: '', label: 'No project' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]
  // A current project the list has not loaded yet still shows by name.
  if (value && !projects.some((p) => p.id === value.id)) options.push({ value: value.id, label: value.name })

  async function change(next: string) {
    setSaving(true)
    try {
      const res = await apiFetch<{ project: ProjectRef | null }>(`/api/drafts/${draftId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: next || null }),
      })
      toast.success(res.project ? `Moved to ${res.project.name}` : 'Removed from its project')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
      ])
      onChanged?.(res.project)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The project could not be changed')
      // A deleted project leaves the list stale.
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Select
      id={id}
      label={label}
      aria-label={label ? undefined : ariaLabel ?? 'Project'}
      options={options}
      value={value?.id ?? ''}
      onChange={(e) => void change(e.target.value)}
      disabled={saving}
    />
  )
}
