'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  GraduationCap,
  CalendarDays,
  Newspaper,
  Users,
  Shield,
  UserCircle,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/app/login/actions'
import Image from 'next/image'
import type { Channel } from '@/lib/types'
import { APP_NAME, BRAND_LOGO_URL, SHOW_WEEKLY } from '@/lib/config'
import { NotificationBell } from './notification-bell'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export function Sidebar({
  userEmail,
  isAdmin,
  channels,
}: {
  userEmail: string
  isAdmin: boolean
  channels: Channel[]
}) {
  const navItems: NavItem[] = [
    { href: '/community', label: 'Community', icon: MessageSquare },
    { href: '/classroom', label: 'Classroom', icon: GraduationCap },
    ...(SHOW_WEEKLY
      ? [{ href: '/weekly', label: 'Weekly Report', icon: Newspaper }]
      : []),
    { href: '/events', label: 'Events', icon: CalendarDays },
    ...(isAdmin
      ? [
          { href: '/members', label: 'Members', icon: Users },
          { href: '/admin', label: 'Admin', icon: Shield },
        ]
      : []),
    { href: '/profile', label: 'Profile', icon: UserCircle },
  ]

  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Desktop: vertical sidebar */}
      {/* Note: no overflow on the aside itself — that would clip the notification
          dropdown, which is wider than the rail and hangs into the content area.
          The nav scrolls instead. */}
      <aside className="sticky top-0 hidden h-screen md:z-40 md:flex md:w-72 md:shrink-0 md:flex-col md:border-r md:border-line md:bg-canvas">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-line">
          <Image
            src={BRAND_LOGO_URL}
            alt={APP_NAME}
            width={40}
            height={40}
            className="rounded shrink-0"
          />
          <h1 className="min-w-0 font-semibold text-fg text-sm leading-tight">
            {APP_NAME}
          </h1>
          <div className="ml-auto shrink-0">
            <NotificationBell />
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            if (href === '/community') {
              return (
                <div key={href} className="flex flex-col gap-1">
                  <Link
                    href="/community"
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive('/community')
                        ? 'font-medium text-fg'
                        : 'text-fg-soft hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </Link>
                  <div className="ml-7 flex flex-col gap-0.5">
                    {channels.map((channel) => {
                      const channelHref = `/community/${channel.slug}`
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
                          {channel.name.trim()}
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
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-canvas px-4 py-3 md:hidden">
        <Image
          src={BRAND_LOGO_URL}
          alt={APP_NAME}
          width={32}
          height={32}
          className="rounded shrink-0"
        />
        <h1 className="font-semibold text-fg text-sm leading-tight truncate">
          {APP_NAME}
        </h1>
        <div className="ml-auto">
          <NotificationBell />
        </div>
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
