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
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/app/login/actions'
import Image from 'next/image'
import type { Channel } from '@/lib/types'
import { APP_NAME, BRAND_LOGO_URL } from '@/lib/config'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export function Sidebar({
  userEmail,
  isAdmin,
  channels,
  slug,
  brandName,
  brandLogoUrl,
}: {
  userEmail: string
  isAdmin: boolean
  channels: Channel[]
  // [MT] Present in the teacher shell (/t/[slug]) → all teacher nav is prefixed with
  // `/t/${slug}`. Absent in the not-yet-ported single-tenant (app) layout → legacy
  // unprefixed hrefs. /profile is GLOBAL and stays unprefixed in both cases.
  slug?: string
  // [MT] Per-teacher brand. In the teacher shell the layout passes the teacher's
  // own name; absent in the single-tenant (app) layout, where we fall back to the
  // per-deployment APP_NAME / BRAND_LOGO_URL config (the `teachers` table has no
  // logo column yet, so the logo image always uses the config default).
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
    // [MT] Members is a member-visible directory (gated by membership in the layout),
    // so it shows for everyone. Admin stays admin-only.
    { href: `${base}/members`, label: 'Members', icon: Users },
    ...(isAdmin
      ? [{ href: `${base}/admin`, label: 'Admin', icon: Shield }]
      : []),
    { href: '/profile', label: 'Profile', icon: UserCircle },
  ]

  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <aside className="sticky top-0 hidden h-screen overflow-y-auto md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-line md:bg-canvas">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-line">
          <Image
            src={logoUrl}
            alt={appName}
            width={40}
            height={40}
            className="h-10 w-10 rounded object-cover shrink-0"
          />
          <h1 className="font-semibold text-fg text-sm leading-tight">
            {appName}
          </h1>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
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
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas px-4 py-3 md:hidden">
        <Image
          src={logoUrl}
          alt={appName}
          width={32}
          height={32}
          className="h-8 w-8 rounded object-cover shrink-0"
        />
        <h1 className="font-semibold text-fg text-sm leading-tight truncate">
          {appName}
        </h1>
      </header>

      {/* Mobile: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-canvas md:hidden">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive(href)
                ? 'font-medium text-fg'
                : 'text-fg-soft hover:bg-muted'
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
