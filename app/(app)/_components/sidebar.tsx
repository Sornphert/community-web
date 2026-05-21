'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  GraduationCap,
  Users,
  UserCircle,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/app/login/actions'

// Single source of truth for the app name — rename here only.
const APP_NAME = 'App Name'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { href: '/community', label: 'Community', icon: MessageSquare },
  { href: '/classroom', label: 'Classroom', icon: GraduationCap },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/profile', label: 'Profile', icon: UserCircle },
]

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <aside className="sticky top-0 hidden h-screen overflow-y-auto md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-zinc-200 md:bg-zinc-50">
        <div className="px-4 py-5 text-lg font-semibold text-zinc-900">
          {APP_NAME}
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ href, label, icon: Icon }) => (
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
          ))}
        </nav>

        <div className="border-t border-zinc-200 p-3">
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
