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
import { APP_NAME, BRAND_LOGO_URL, SHOW_THEME_TOGGLE } from '@/lib/config'
import { ThemeToggle } from './theme-toggle'

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
      <aside className="sticky top-0 hidden h-screen overflow-y-auto md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-zinc-200 md:bg-zinc-50">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-200">
          <Image 
            src={BRAND_LOGO_URL} 
            alt={APP_NAME}
            width={40} 
            height={40} 
            className="rounded shrink-0"
          />
          <h1 className="font-semibold text-zinc-900 text-sm leading-tight">
            {APP_NAME}
          </h1>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            if (href === '/community') {
              return (
                <div key={href} className="flex flex-col gap-1">
                  <Link
                    href="/community"
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive('/community')
                        ? 'font-medium text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100'
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
                              ? 'bg-zinc-100 font-medium text-zinc-900'
                              : 'text-zinc-600 hover:bg-zinc-100'
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
                    ? 'bg-zinc-100 font-medium text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-zinc-200 p-3">
          {SHOW_THEME_TOGGLE && (
            <div className="pb-1">
              <ThemeToggle />
            </div>
          )}
          <p
            className="truncate px-1 pb-2 text-xs text-zinc-500"
            title={userEmail}
          >
            {userEmail}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile: sticky top brand bar */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 md:hidden">
        <Image
          src={BRAND_LOGO_URL}
          alt={APP_NAME}
          width={32}
          height={32}
          className="rounded shrink-0"
        />
        <h1 className="font-semibold text-zinc-900 text-sm leading-tight truncate">
          {APP_NAME}
        </h1>
        {SHOW_THEME_TOGGLE && (
          <div className="ml-auto">
            <ThemeToggle variant="icon" />
          </div>
        )}
      </header>

      {/* Mobile: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 bg-zinc-50 md:hidden">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive(href)
                ? 'font-medium text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100'
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
