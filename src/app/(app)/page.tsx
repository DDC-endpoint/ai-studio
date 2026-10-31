import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  FilePlus2,
  BookOpen,
  Palette,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { listBriefDrafts } from '@/lib/brief/briefDrafts'
import { resolveTeamForServerComponent } from '@/lib/authz/serverTeam'
import { draftVisibilityWhere } from '@/lib/authz/visibility'
import type { TeamAuthedUser } from '@/lib/api/handler'
import { PageHead } from '@/components/ui/PageHead'
import { SectionHead } from '@/components/ui/SectionHead'
import { EYEBROW, FOCUS, ICON } from '@/components/ui/atoms'
import { RecentDraftsCard } from '@/components/dashboard/RecentDraftsCard'
import { NoTeamNotice } from '@/components/dashboard/NoTeamNotice'
import { relativeTime } from '@/lib/format'
import { monthStartUtc } from '@/lib/dates'

// Dashboard renders live data; never cache it.
export const dynamic = 'force-dynamic'

// ── Data ────────────────────────────────────────────────────────────────────

async function getDashboardData(user: TeamAuthedUser) {
  const teamId = user.teamId
  const [
    draftsReady,
    postsThisMonth,
    aiProviders,
    recentDrafts,
    recentProviders,
  ] = await Promise.all([
    // KPI counts use the same visibility as the library (038 D10: the whole team).
    prisma.draft.count({ where: { ...draftVisibilityWhere(user), status: 'EXPORTED' } }),
    // Team-wide on purpose (037 D11): the whole team's output this month, by
    // teamId and not through draft visibility, so every member sees one number.
    prisma.draft.count({
      where: { teamId, status: 'EXPORTED', createdAt: { gte: monthStartUtc(new Date()) } },
    }),
    prisma.availableProvider.count({ where: { isEnabled: true, teamId } }),
    // Team-wide visibility (038 D10); never another team's drafts.
    prisma.draft.findMany({
      where: draftVisibilityWhere(user),
      // 25, not 8: the Recent Drafts card shows 8 collapsed and the full list
      // when expanded (RecentDraftsCard) — one query serves both states.
      take: 25,
      orderBy: { createdAt: 'desc' },
      include: {
        brief: {
          select: {
            topic: true,
            designMode: true,
            channels: true,
            campaign: { select: { name: true } },
          },
        },
      },
    }),
    // AvailableProvider is team-wide (no personal ownership concept).
    prisma.availableProvider.findMany({ where: { teamId }, take: 5, orderBy: { createdAt: 'desc' } }),
  ])

  // The viewer's own unfinished (autosaved) briefs, scoped to the active team
  // (a multi-team user's other-team drafts must not surface here — Resume
  // would otherwise dead-end on the briefs POST route's cross-team 404).
  // listBriefDrafts also runs the lazy 7-day TTL sweep.
  const unfinishedBriefs = await listBriefDrafts(user.userId, user.teamId)

  // Build a merged, chronological activity feed from the available signals.
  type Event = { id: string; at: Date; text: string; kind: 'draft' | 'provider' }
  const events: Event[] = [
    ...recentDrafts.map(d => ({
      id: `draft-${d.id}`,
      at: d.createdAt,
      text: `Draft generated — “${d.brief?.topic ?? 'Untitled'}”`,
      kind: 'draft' as const,
    })),
    ...recentProviders.map(p => ({
      id: `prov-${p.id}`,
      at: p.createdAt,
      text: `${p.slot === 'COPY' ? 'Caption' : 'Image'} provider added — ${p.label}`,
      kind: 'provider' as const,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)

  return {
    draftsReady,
    postsThisMonth,
    aiProviders,
    recentDrafts,
    unfinishedBriefs,
    events,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

// A KPI: a small-caps label over a display numeral, on a ruled row (no box).
function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border-b border-line-subtle py-4">
      <div className={EYEBROW}>{label}</div>
      <div className="mt-2 font-display text-ui-2xl font-normal leading-none tabular-nums [font-variation-settings:'opsz'_144]">
        {value}
      </div>
    </div>
  )
}

// A quick action: a link drawn as Folio's Outline button (§8.2). The floating
// Create post button is the view's one primary, so these stay outline.
function QuickAction({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-control-md items-center gap-2 whitespace-nowrap rounded-ui-md border border-line px-3.5 text-ui-sm font-semibold text-fg transition-[border-color] duration-fast ease-standard hover:border-fg ${FOCUS}`}
    >
      {icon}
      {label}
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const resolution = await resolveTeamForServerComponent()

  if (resolution?.team.kind === 'choice-required') {
    redirect('/choose-team')
  }

  if (!resolution || resolution.team.kind === 'no-team') {
    return <NoTeamNotice isSuperAdmin={resolution?.isSuperAdmin ?? false} />
  }

  const teamUser: TeamAuthedUser = {
    userId: resolution.userId,
    teamId: resolution.team.teamId,
    teamRole: resolution.team.teamRole,
    isSuperAdmin: resolution.isSuperAdmin,
  }
  const data = await getDashboardData(teamUser)

  return (
    <>
      <PageHead
        eyebrow="Overview"
        title="Dashboard"
        lead="At-a-glance status across drafts and posts."
        className="mb-8"
      />

      {/* KPI summary: a 2 px --fg rule opens the block; ruled cells, no boxes */}
      <div className="grid grid-cols-2 gap-x-6 border-t-2 border-fg lg:grid-cols-3">
        <KpiCard label="Drafts Ready" value={data.draftsReady} />
        <KpiCard label="Posts this month" value={data.postsThisMonth} />
        <KpiCard label="AI providers" value={data.aiProviders} />
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        <QuickAction href="/brief" label="New post" icon={<FilePlus2 {...ICON} aria-hidden />} />
        <QuickAction href="/library" label="View library" icon={<BookOpen {...ICON} aria-hidden />} />
        <QuickAction
          href="/admin/brandkits"
          label="Manage brand kits"
          icon={<Palette {...ICON} aria-hidden />}
        />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-3">
        {/* Recent drafts — collapsed 8 / expandable to the full fetched list */}
        <RecentDraftsCard
          className="min-w-0 lg:col-span-2"
          unfinished={data.unfinishedBriefs.map(u => ({
            id: u.id,
            topic: u.topic,
            updatedAtLabel: relativeTime(u.updatedAt),
          }))}
          drafts={data.recentDrafts.map(d => ({
            id: d.id,
            status: d.status,
            createdAtLabel: relativeTime(d.createdAt),
            brief: d.brief
              ? {
                  topic: d.brief.topic,
                  designMode: d.brief.designMode,
                  channels: d.brief.channels,
                  campaign: d.brief.campaign,
                }
              : null,
          }))}
        />

        {/* Activity feed */}
        <div className="min-w-0">
          <SectionHead title="Activity" className="pb-2.5" />

          {data.events.length === 0 ? (
            <p className="border-t-2 border-fg py-8 text-center text-ui-sm text-fg-muted">
              No recent activity.
            </p>
          ) : (
            <ul className="border-t-2 border-fg">
              {data.events.map(e => (
                <li key={e.id} className="min-w-0 border-b border-line-subtle py-2.5">
                  <p className="truncate text-ui-sm text-fg">{e.text}</p>
                  <p className="text-ui-xs text-fg-muted">{relativeTime(e.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
