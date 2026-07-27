'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  GraduationCap,
  CalendarDays,
  Users,
  Shield,
  UserCircle,
  Bookmark,
  Mail,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/app/login/actions'
import Image from 'next/image'
import type { Channel } from '@/lib/types'
import { APP_NAME, BRAND_LOGO_URL } from '@/lib/config'
import { NotificationBell } from './notification-bell'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  // Unread count badge (currently DMs only). Omitted/0 → no badge.
  badge?: number
}

export function Sidebar({
  userEmail,
  isAdmin,
  channels,
  slug,
  teacherId,
  brandName,
  brandLogoUrl,
  dmUnread = 0,
}: {
  userEmail: string
  isAdmin: boolean
  channels: Channel[]
  // [MT] Unread direct-message count for this teacher; drives the Messages badge.
  dmUnread?: number
  // [MT] The teacher whose shell this is. Present in /t/[slug]; drives the
  // notification bell (scopes its query + realtime to this teacher). Absent in
  // the legacy single-tenant (app) shell — the bell is then not rendered.
  teacherId?: string
  // [MT] Present in the teacher shell (/t/[slug]) → all teacher nav is prefixed with
  // `/t/${slug}`. Absent in the not-yet-ported single-tenant (app) layout → legacy
  // unprefixed hrefs. Profile is GLOBAL data, but the tab is prefixed too so it stays
  // in-shell (/t/[slug]/profile) when slug is present; it falls back to the global
  // /profile in the legacy (app) shell when slug is undefined.
  slug?: string
  // [MT] Per-teacher brand. In the teacher shell (/t/[slug]) the layout passes the
  // teacher's own name AND logo (brandLogoUrl = teacher.logo_url, falling back to the
  // platform logo for a logo-less teacher — never another teacher's brand). Both are
  // absent in the single-tenant (app) shell, where they fall back to the per-deployment
  // APP_NAME / BRAND_LOGO_URL config below — the path single-tenant `main` relies on.
  brandName?: string
  brandLogoUrl?: string
}) {
  const base = slug ? `/t/${slug}` : ''
  const appName = brandName ?? APP_NAME
  const logoUrl = brandLogoUrl ?? BRAND_LOGO_URL

  const navItems: NavItem[] = [
    { href: `${base}/community`, label: 'Community', icon: MessageSquare },
    { href: `${base}/classroom`, label: 'Classroom', icon: GraduationCap },
    { href: `${base}/events`, label: 'Events', icon: CalendarDays },
    // [MT] Direct messages — teacher shell only (same-community 1:1 DMs).
    ...(slug
      ? [
          {
            href: `${base}/messages`,
            label: 'Messages',
            icon: Mail,
            badge: dmUnread,
          },
        ]
      : []),
    { href: `${base}/saved`, label: 'Saved', icon: Bookmark },
    // [MT] Members is a member-visible directory (gated by membership in the layout),
    // so it shows for everyone. Admin stays admin-only.
    { href: `${base}/members`, label: 'Members', icon: Users },
    ...(isAdmin
      ? [{ href: `${base}/admin`, label: 'Admin', icon: Shield }]
      : []),
    { href: `${base}/profile`, label: 'Profile', icon: UserCircle },
  ]

  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Desktop: vertical sidebar */}
      {/* NOTE: the aside must NOT scroll. overflow-y-auto here makes it a clipping
          boundary, which cuts off the NotificationBell dropdown below. The scroll
          lives on the <nav> instead (it's flex-1, so it takes the leftover height),
          keeping the brand row and the sign-out footer pinned. md:z-40 matches main
          so the sticky sidebar stacks above page content. */}
      <aside className="sticky top-0 hidden h-screen md:z-40 md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-line md:bg-canvas">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-line">
          <Image
            src={logoUrl}
            alt={appName}
            width={40}
            height={40}
            className="h-10 w-10 rounded object-contain shrink-0"
          />
          <h1 className="font-semibold text-fg text-sm leading-tight">
            {appName}
          </h1>
          {teacherId && slug && (
            <div className="ml-auto">
              <NotificationBell teacherId={teacherId} slug={slug} />
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-1">
          {navItems.map(({ href, label, icon: Icon, badge }) => {
            if (href === `${base}/community`) {
              return (
                <div key={href} className="flex flex-col gap-1">
                  <Link
                    href={`${base}/community`}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive(`${base}/community`)
                        ? 'font-medium text-fg'
                        : 'text-fg-soft hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </Link>
                  <div className="ml-7 flex flex-col gap-0.5">
                    {channels.map((channel) => {
                      const channelHref = `${base}/community/${channel.slug}`
                      return (
                        <Link
                          key={channel.id}
                          href={channelHref}
                          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                            isActive(channelHref)
                              ? 'bg-muted font-medium text-fg'
                              : 'text-fg-soft hover:bg-muted'
                          }`}
                        >
                          {channel.name}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            }

            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive(href)
                    ? 'bg-muted font-medium text-fg'
                    : 'text-fg-soft hover:bg-muted'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
                {!!badge && badge > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-inverse px-1.5 text-xs font-medium text-inverse-fg">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-line p-3">
          <p
            className="truncate px-1 pb-2 text-xs text-fg-muted"
            title={userEmail}
          >
            {userEmail}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-fg-soft transition-colors hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile: sticky top brand bar */}
      {/* z-40, matching main. At z-10 this sticky header creates a stacking context
          that traps the NotificationBell dropdown (z-30 is scoped INSIDE it), so
          page content like the channel tab bar paints over the panel. */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-canvas px-4 py-3 md:hidden">
        <Image
          src={logoUrl}
          alt={appName}
          width={32}
          height={32}
          className="h-8 w-8 rounded object-contain shrink-0"
        />
        <h1 className="font-semibold text-fg text-sm leading-tight truncate">
          {appName}
        </h1>
        {teacherId && slug && (
          <div className="ml-auto">
            <NotificationBell teacherId={teacherId} slug={slug} />
          </div>
        )}
      </header>

      {/* Mobile: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-canvas md:hidden">
        {navItems.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive(href)
                ? 'font-medium text-fg'
                : 'text-fg-soft hover:bg-muted'
            }`}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {!!badge && badge > 0 && (
                <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-inverse px-1 text-[10px] font-medium text-inverse-fg">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
