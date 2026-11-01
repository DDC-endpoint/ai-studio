'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import type { TemplateDetail, TemplateSummary } from '@/lib/api-types'
import { TemplatePreview } from '@/components/ui/TemplatePreview'
import { FieldLabel } from '@/components/ui/FieldLabel'

interface SelectedTemplatePreviewProps {
  /** The selected template, looked up in the offered list; nothing renders when it is not offered. */
  template: TemplateSummary | undefined
  'data-testid': string
}

/**
 * 040 FR-04: a small preview of the template picked in the wizard. The HTML is
 * fetched once per id per session; a failure is one quiet line and blocks nothing.
 */
export function SelectedTemplatePreview({ template, 'data-testid': testId }: SelectedTemplatePreviewProps) {
  const id = template?.id ?? ''
  const { data, isLoading, isError } = useQuery({
    queryKey: ['template', id],
    queryFn: () => apiFetch<TemplateDetail>(`/api/templates/${id}`),
    enabled: !!id,
    staleTime: Infinity,
  })

  if (!template) return null

  return (
    <div className="mt-4" data-testid={testId}>
      <FieldLabel as="span" className="mb-2">Preview</FieldLabel>
      {isLoading ? (
        <p className="text-ui-xs text-fg-muted" role="status">Loading preview…</p>
      ) : isError || !data ? (
        <p className="text-ui-xs text-fg-muted">Preview unavailable.</p>
      ) : (
        <TemplatePreview
          html={data.htmlTemplate}
          aspectRatio={data.aspectRatio}
          title={`Preview of ${template.name}`}
          className="max-w-xs"
        />
      )}
    </div>
  )
}
