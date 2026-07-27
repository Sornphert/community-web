'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Channel } from '@/lib/types'

// Mobile-only pill tabs. Desktop navigates channels via the nested sidebar.
export function ChannelTabs({
  channels,
  basePath = '/community',
  unread = [],
}: {
  channels: Channel[]
  // URL prefix for channel links. Defaults to '/community'; the teacher shell
  // passes `/t/${slug}/community`.
  basePath?: string
  // Channel ids with unread posts — render a dot (0036).
  unread?: string[]
}) {
  const pathname = usePathname()
  const unreadSet = new Set(unread)

  return (
    <div className="sticky top-[57px] z-10 -mx-4 -mt-4 mb-4 border-b border-line bg-canvas px-4 py-2 md:hidden">
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {channels.map((channel) => {
          const href = `${basePath}/${channel.slug}`
          const isActive =
            pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={channel.id}
              href={href}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-inverse text-inverse-fg'
                  : 'border border-line bg-surface text-fg-secondary'
              }`}
            >
              {channel.name}
              {!isActive && unreadSet.has(channel.id) && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-inverse" aria-label="Unread" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
