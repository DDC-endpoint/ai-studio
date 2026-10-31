'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageTitle } from '@/components/ui/PageHead'
import { SectionHead } from '@/components/ui/SectionHead'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { EYEBROW, FOCUS, ICON, ICON_SM } from '@/components/ui/atoms'
import { LibraryCard } from '@/components/library/LibraryCard'
import { ProjectBriefingSection } from '@/components/projects/ProjectBriefingSection'
import { ASIDE_BLOCK, CRUMB_CURRENT, CRUMB_LINK } from '@/components/projects/classes'
import { postStyleLabel, postStyleOptions } from '@/components/projects/postStyleOptions'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { ProjectDetail, BrandKitSummary, LibraryResponse } from '@/lib/api-types'

const PAGE_SIZE = 12

// Tiles: the library's contact sheet, two across beside the aside.
const GRID = 'grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2'

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { isTeamAdmin } = useCurrentUser()
  const [savingKit, setSavingKit] = useState(false)
  const [savingStyle, setSavingStyle] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // The aside selects are named by their visible dt (FR-12 row 25).
  const kitLabelId = React.useId()
  const styleLabelId = React.useId()

  const projectQuery = useQuery({
    queryKey: ['projects', params.id],
    queryFn: () => apiFetch<ProjectDetail>(`/api/projects/${params.id}`),
  })

  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })

  // Section 02: the posts assigned to this project, from the library route.
  const postsQuery = useInfiniteQuery({
    queryKey: ['library', 'project', params.id],
    queryFn: ({ pageParam }) =>
      apiFetch<LibraryResponse>(
        `/api/library?${new URLSearchParams({
          projectId: params.id,
          page: String(pageParam),
          pageSize: String(PAGE_SIZE),
        })}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * PAGE_SIZE < lastPage.total ? allPages.length + 1 : undefined,
  })

  const project = projectQuery.data
  const posts = postsQuery.data?.pages.flatMap(p => p.drafts) ?? []

  // Mirrors the previous try/catch behaviour: a failed/missing project
  // bounces back to the list rather than showing a dead-end detail page.
  useEffect(() => {
    if (projectQuery.isError) router.push('/projects')
  }, [projectQuery.isError, router])

  async function patchProject(body: Record<string, string | null>) {
    await apiFetch(`/api/projects/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // The wizard and the list read the same projects cache.
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  async function updateBrandKit(value: string) {
    setSavingKit(true)
    try {
      await patchProject({ defaultBrandKitId: value || null })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update brand kit')
    } finally {
      setSavingKit(false)
    }
  }

  // '' clears the default (the wizard then falls to General).
  async function updatePostStyle(value: string) {
    setSavingStyle(true)
    try {
      await patchProject({ defaultPostStyle: value || null })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update post style')
    } finally {
      setSavingStyle(false)
    }
  }

  async function deleteProject() {
    if (!project) return
    const n = project.postCount
    const ok = await confirm({
      title: 'Delete this project?',
      description:
        n === 0
          ? 'No posts are assigned to it. Its briefing and documents are kept, but the project cannot be restored.'
          : `${n} post${n !== 1 ? 's are' : ' is'} assigned to it. They stay in the library with no project. The project cannot be restored.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setDeleting(true)
    try {
      await apiFetch(`/api/projects/${params.id}`, { method: 'DELETE' })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      await queryClient.invalidateQueries({ queryKey: ['library'] })
      toast.success('Project deleted')
      router.push('/projects')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete project')
      setDeleting(false)
    }
  }

  if (projectQuery.isLoading || projectQuery.isError || !project) {
    return <p className="py-8 text-ui-sm text-fg-muted">Loading…</p>
  }

  return (
    <>
      {/* Breadcrumb (DESIGN_SYSTEM.md §8.6), then the page title. */}
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-ui-sm text-fg-muted">
        <button type="button" onClick={() => router.push('/projects')} className={`${CRUMB_LINK} ${FOCUS}`}>
          <ArrowLeft {...ICON} aria-hidden /> Projects
        </button>
        <span aria-hidden>/</span>
        <span aria-hidden className={CRUMB_CURRENT}>{project.name}</span>
      </nav>
      <PageTitle className="mb-10 break-words">{project.name}</PageTitle>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* The briefing (01) and the posts (02), numbered sections ruled apart (§8.14). */}
        <div className="min-w-0 divide-y divide-line-subtle border-t-2 border-fg">
          <ProjectBriefingSection projectId={params.id} isTeamAdmin={isTeamAdmin} />

          <section className="pb-8 pt-[22px]">
            <SectionHead numeral="ii." title="Posts" className="mb-3">
              <span className="text-fg-muted">{project.postCount}</span>
            </SectionHead>
            {postsQuery.isPending ? (
              <p className="text-ui-sm text-fg-muted">Loading…</p>
            ) : postsQuery.isError ? (
              <p className="text-ui-sm text-fg-muted">Posts could not be loaded.</p>
            ) : posts.length === 0 ? (
              <p className="text-ui-sm text-fg-muted">No posts in this project yet.</p>
            ) : (
              <>
                <div className={GRID}>
                  {posts.map(draft => (
                    <LibraryCard key={draft.id} draft={draft} isTeamAdmin={isTeamAdmin} />
                  ))}
                </div>
                {postsQuery.hasNextPage && (
                  <div className="mt-8 flex justify-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => postsQuery.fetchNextPage()}
                      disabled={postsQuery.isFetchingNextPage}
                    >
                      {postsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* Project defaults: ruled blocks in the aside. */}
        <aside className="min-w-0 border-t-2 border-fg">
          <section className={ASIDE_BLOCK}>
            <h2 className={`${EYEBROW} mb-3`}>Details</h2>
            <dl className="space-y-3 text-ui-sm">
              <div>
                <dt id={kitLabelId} className="flex items-center gap-1.5 text-ui-xs text-fg-muted">
                  Default brand kit
                  {savingKit && <Loader2 {...ICON_SM} className="animate-spin" aria-hidden />}
                </dt>
                {isTeamAdmin ? (
                  <dd className="mt-1">
                    <Select
                      aria-labelledby={kitLabelId}
                      options={[
                        { value: '', label: 'No default brand kit' },
                        ...brandKits.map(k => ({ value: k.id, label: k.name })),
                      ]}
                      value={project.defaultBrandKit?.id ?? ''}
                      onChange={e => updateBrandKit(e.target.value)}
                      disabled={savingKit}
                    />
                  </dd>
                ) : (
                  <dd className="font-medium text-fg">
                    {project.defaultBrandKit?.name ?? '—'}
                  </dd>
                )}
              </div>
              <div>
                <dt id={styleLabelId} className="flex items-center gap-1.5 text-ui-xs text-fg-muted">
                  Default post style
                  {savingStyle && <Loader2 {...ICON_SM} className="animate-spin" aria-hidden />}
                </dt>
                {isTeamAdmin ? (
                  <dd className="mt-1">
                    <Select
                      aria-labelledby={styleLabelId}
                      data-testid="project-default-post-style"
                      options={postStyleOptions('No default (General)', project.defaultPostStyle)}
                      value={project.defaultPostStyle ?? ''}
                      onChange={e => updatePostStyle(e.target.value)}
                      disabled={savingStyle}
                    />
                  </dd>
                ) : (
                  <dd className="font-medium text-fg" data-testid="project-default-post-style-text">
                    {postStyleLabel(project.defaultPostStyle) ?? 'General'}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-ui-xs text-fg-muted">Default tone</dt>
                <dd className="font-medium capitalize text-fg">
                  {project.defaultTone ?? '—'}
                </dd>
              </div>
            </dl>
          </section>

          {isTeamAdmin && (
            <section className={ASIDE_BLOCK}>
              <Button variant="ghost" size="sm" onClick={deleteProject} disabled={deleting}>
                <Trash2 {...ICON} aria-hidden /> Delete project
              </Button>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
