'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { inputClasses, fieldEdge } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { QueryError } from '@/components/ui/QueryError'
import { PageHead } from '@/components/ui/PageHead'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ICON } from '@/components/ui/atoms'
import { LibraryCard } from '@/components/library/LibraryCard'
import { postStyleOptions } from '@/components/projects/postStyleOptions'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/apiFetch'
import type { BrandKitSummary, LibraryResponse, ProjectSummary } from '@/lib/api-types'

const PAGE_SIZE = 20

// ── Skeleton loader ───────────────────────────────────────────────────────────

// The shape of a library tile (LibraryCard): a thumbnail, a title, a meta line
// and the action row. No card box (DESIGN_SYSTEM.md §8.12).
function SkeletonCard() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="aspect-square w-full bg-surface outline outline-1 outline-offset-[3px] outline-line-subtle" />
      <div className="pt-4 flex flex-col gap-2">
        <div className="h-4 rounded-ui-sm bg-line-subtle w-3/4" />
        <div className="h-3 rounded-ui-sm bg-line-subtle w-1/2" />
        <div className="h-[30px] rounded-ui-md bg-line-subtle w-1/2 mt-1" />
      </div>
    </div>
  )
}

// Tiles: a contact sheet with room between frames for the 3 px outline offset.
const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [brandKitId, setBrandKitId] = useState('')
  const [postStyle, setPostStyle] = useState('')
  // '' = all projects, 'none' = posts with no project, else a project id (038 FR-13).
  const [projectId, setProjectId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchId = React.useId()
  const [search, setSearch] = useState('')

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['library', brandKitId, postStyle, projectId, search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        ...(brandKitId ? { brandKitId } : {}),
        ...(postStyle ? { postStyle } : {}),
        ...(projectId ? { projectId } : {}),
        ...(search ? { search } : {}),
      })
      return apiFetch<LibraryResponse>(`/api/library?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * PAGE_SIZE < lastPage.total ? allPages.length + 1 : undefined,
  })

  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })
  const kitOptions = [
    { value: '', label: 'All kits' },
    ...brandKits.map((k) => ({ value: k.id, label: k.name })),
  ]
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummary[]>('/api/projects'),
  })
  const projectOptions = [
    { value: '', label: 'All projects' },
    { value: 'none', label: 'No project' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]
  const styleOptions = postStyleOptions('All styles')

  const drafts = data?.pages.flatMap((p) => p.drafts) ?? []

  function invalidateLibrary() {
    return queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function handleDelete(draftId: string) {
    const ok = await confirm({
      title: 'Delete this post?',
      description:
        'This permanently removes the draft, its revisions, and its brief. This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/drafts/${draftId}`, { method: 'DELETE' })
      toast.success('Post deleted')
      invalidateLibrary()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <>
      {/* Page header */}
      <PageHead
        eyebrow="Posts"
        title="Library"
        lead="All finished posts."
        className="mb-8"
        actionsClassName="min-w-0"
        actions={
          // The label sits above the icon's relative box, so the icon stays
          // centred on the field (014 FR-12 row 3).
          <div className="flex w-full flex-col gap-1.5 sm:w-72">
            <FieldLabel htmlFor={searchId}>Search by topic</FieldLabel>
            <div className="relative">
              <Search
                {...ICON}
                aria-hidden
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
              />
              <input
                id={searchId}
                type="search"
                placeholder="Search by topic…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={cn(inputClasses, fieldEdge(), 'pl-10')}
              />
            </div>
          </div>
        }
      />

      {/* Filters, over the 2 px --fg rule that opens the sheet */}
      <div className="pb-4 mb-8 border-b-2 border-fg flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-64">
          <Select
            label="Brand kit"
            options={kitOptions}
            value={brandKitId}
            onChange={(e) => setBrandKitId(e.target.value)}
          />
        </div>
        <div className="sm:w-64">
          <Select
            label="Post style"
            options={styleOptions}
            value={postStyle}
            onChange={(e) => setPostStyle(e.target.value)}
          />
        </div>
        <div className="sm:w-64">
          <Select
            label="Project"
            options={projectOptions}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      {isPending ? (
        <div className={GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : drafts.length === 0 ? (
        <p className="py-12 text-center text-ui-sm text-fg-muted">No posts found.</p>
      ) : (
        <>
          <div className={GRID}>
            {drafts.map((draft) => (
              <LibraryCard
                key={draft.id}
                draft={draft}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Load more */}
          {hasNextPage && (
            <div className="mt-10 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
