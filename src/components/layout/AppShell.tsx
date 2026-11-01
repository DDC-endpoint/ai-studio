'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Logo } from '@/components/Logo'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { ClaudeTokenPrompt } from '@/components/settings/ClaudeTokenPrompt'
import { TeamSwitcher } from '@/components/layout/TeamSwitcher'
import { CreatePostButton } from '@/components/layout/CreatePostButton'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { authClient } from '@/lib/auth-client'
import { EYEBROW, FOCUS } from '@/components/ui/atoms'

// Folio nav is text only, no icons (DESIGN_SYSTEM.md §8.6); each link's name is its label.
interface NavItem {
  label: string
  href: string
  adminOnly?: boolean
  superAdminOnly?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Create',
    items: [
      { label: 'Dashboard', href: '/' },
      { label: 'Library',   href: '/library' },
    ],
  },
  {
    label: 'Organize',
    items: [
      { label: 'Projects',  href: '/projects' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Brand kits',    href: '/admin/brandkits', adminOnly: true },
      { label: 'Team settings', href: '/team',            adminOnly: true },
      { label: 'Users',         href: '/admin/users',     superAdminOnly: true },
      { label: 'Teams',         href: '/admin/teams',     superAdminOnly: true },
      { label: 'Insights',      href: '/admin/insights',  superAdminOnly: true },
    ],
  },
]

// Pinned to the sidebar's bottom area, above Sign out.
const SETTINGS_ITEM: NavItem = { label: 'Settings', href: '/settings' }

// Folio nav item (DESIGN_SYSTEM.md §8.6): --fg-muted text, --fg on hover.
// Shared by the links and the Sign out button.
const NAV_ITEM =
  'relative block py-[5px] pl-3 text-left font-text text-ui-base rounded-ui-sm ' +
  'transition-colors duration-fast ease-standard ' +
  FOCUS

// The current page: --fg, 600, and a 2 px --accent bar at the left edge,
// inset 8 px top and bottom.
const NAV_CURRENT =
  "text-fg font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-accent before:content-['']"
const NAV_IDLE = 'text-fg-muted hover:text-fg'

// The header's menu button and the mobile sidebar's close button: a
// --control-md target, so not the --control-sm ui ICON_BUTTON.
const SHELL_ICON_BUTTON =
  'inline-flex items-center justify-center h-control-md w-control-md rounded-ui-md text-fg-muted hover:text-fg ' +
  'transition-colors duration-fast ease-standard ' +
  FOCUS

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`${NAV_ITEM} ${isActive ? NAV_CURRENT : NAV_IDLE}`}
    >
      {item.label}
    </Link>
  )
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  // Hide admin-only entries from non-admins (server-side enforcement lives in
  // the /admin layout — this is just honest navigation). `adminOnly` now
  // gates on team-admin (per-team role, super admins pass every gate too);
  // `superAdminOnly` is unchanged — those items are platform-wide (Users,
  // and the Task 17 Teams admin screen), not team-scoped.
  const { isTeamAdmin, isSuperAdmin } = useCurrentUser()
  const [signingOut, setSigningOut] = useState(false)
  const sections = NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items.filter(
        item => (!item.adminOnly || isTeamAdmin) && (!item.superAdminOnly || isSuperAdmin)
      ),
    }))
    .filter(section => section.items.length > 0)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
    } finally {
      // Full reload clears all client-side caches (React Query etc.).
      window.location.href = '/login'
    }
  }

  // Opaque --canvas (FR-08), because the sidebar is fixed over scrolling
  // content (DESIGN_SYSTEM.md §4.2): a --line-subtle right rule on desktop;
  // the mobile panel floats, so it takes the --fg border and overlay shadow.
  return (
    <aside
      className={`flex flex-col h-full w-[220px] pt-[22px] pb-[18px] overflow-y-auto bg-canvas font-text text-fg border-r ${
        onClose ? 'border-fg shadow-overlay' : 'border-line-subtle'
      }`}
    >
      {onClose && (
        <div className="flex items-center justify-end -mt-2.5 mb-2 px-3">
          <button onClick={onClose} aria-label="Close sidebar" className={`md:hidden ${SHELL_ICON_BUTTON}`}>
            <X size={16} strokeWidth={1.4} aria-hidden="true" />
          </button>
        </div>
      )}

      <TeamSwitcher />

      <nav className="flex flex-col">
        {sections.map(section => (
          <div key={section.label} className="flex flex-col px-5 mb-[18px]">
            <div className={`mb-1 ${EYEBROW}`}>
              {section.label}
            </div>
            {section.items.map(item => (
              <NavLink key={item.href} item={item} onClick={onClose} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings + Sign out — pinned to the bottom of the panel */}
      <div className="mt-auto flex flex-col px-5 pt-3.5 border-t border-line-subtle">
        <NavLink item={SETTINGS_ITEM} onClick={onClose} />
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className={`${NAV_ITEM} text-fg-muted hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { teamChoiceRequired } = useCurrentUser()
  const pathname = usePathname()
  const router = useRouter()
  // Hidden on the wizard (/brief) and on the draft page, whose own actions sit
  // in the bottom-right corner (020).
  const hideCreatePost = pathname === '/brief' || pathname.startsWith('/drafts/')

  // Bounce to the chooser when /api/me reports no resolved active team —
  // but never from the chooser itself, or picking a team there would
  // instantly redirect back before the click's POST even lands.
  useEffect(() => {
    if (teamChoiceRequired && pathname !== '/choose-team') {
      router.replace('/choose-team')
    }
  }, [teamChoiceRequired, pathname, router])

  return (
    <ConfirmProvider>
      {/* font-text: the shell sets Folio's text face (Instrument Sans) for
          every screen inside it. */}
      <div className="min-h-screen flex flex-col bg-canvas text-fg font-text">
        {/* Top app bar: opaque --surface-1 with a --line-subtle bottom rule
            (DESIGN_SYSTEM.md §4.2, §6). The logo sits 28 px in on desktop. */}
        <header className="fixed top-0 inset-x-0 z-40 h-[60px] flex items-center justify-between pl-4 pr-4 md:pl-7 md:pr-6 bg-surface border-b border-line-subtle">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className={`md:hidden ${SHELL_ICON_BUTTON}`}
              aria-label="Open sidebar"
            >
              <Menu size={20} strokeWidth={1.4} aria-hidden="true" />
            </button>
            <Logo />
          </div>

          <ThemeToggle />
        </header>

        {/* Body below app bar */}
        <div className="flex flex-1 pt-[60px]">
          {/* Desktop sidebar */}
          <div className="hidden md:flex w-[220px] fixed left-0 top-[60px] bottom-0">
            <Sidebar />
          </div>

          {/* Mobile sidebar overlay — Radix Dialog provides the focus trap,
              Escape-to-close, and aria-modal. The scrim is the one translucent
              layer (DESIGN_SYSTEM.md §4.2): --scrim at 0.3, no blur. */}
          <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/30 md:hidden" />
              <Dialog.Content className="fixed left-0 top-0 bottom-0 z-50 w-[220px] md:hidden focus:outline-none">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Main content */}
          {/* Folio main padding (DESIGN_SYSTEM.md §6): 36 px top, 48 px sides
              on wide screens (16 px at 375), and 140 px at the bottom, clear
              of the Create post button. */}
          <main className="flex-1 min-w-0 md:ml-[220px] overflow-y-auto">
            <div className="max-w-canvas mx-auto px-4 md:px-8 lg:px-12 pt-9 pb-[140px]">
              {/* CLI mode only: nudge users without a (valid) personal Claude token */}
              <ClaudeTokenPrompt />
              {children}
            </div>
          </main>
        </div>

        {/* Floating Create post shortcut, hidden on the wizard it opens and on
            the draft page, whose own actions (refine Send) sit in that corner.
            usePathname() carries no query string, so /brief?resume=… matches too. */}
        {!hideCreatePost && <CreatePostButton />}
      </div>
    </ConfirmProvider>
  )
}
