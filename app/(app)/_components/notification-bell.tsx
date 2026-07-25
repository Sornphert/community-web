'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/format'
import type { NotificationItem, NotificationType } from '@/lib/types'
import { Avatar } from './avatar'
import { PushToggle } from './push-toggle'

// The embed shape returned by the notifications query below. actor/post need the
// FK hints because notifications has two FKs to profiles (actor_id, recipient_id).
const SELECT =
  'id, type, read_at, created_at, post_id, comment_id, event_id, actor:profiles!actor_id(id, display_name, avatar_url), post:posts!post_id(title, channel:channels(slug)), event:events!event_id(title, starts_at)'

type Row = {
  id: string
  type: NotificationType
  read_at: string | null
  created_at: string
  post_id: string | null
  comment_id: string | null
  event_id: string | null
  actor: NotificationItem['actor']
  post: { title: string | null; channel: { slug: string } | null } | null
  event: { title: string | null; starts_at: string | null } | null
}

function mapRow(row: Row): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    read_at: row.read_at,
    created_at: row.created_at,
    post_id: row.post_id,
    comment_id: row.comment_id,
    post_title: row.post?.title ?? null,
    channel_slug: row.post?.channel?.slug ?? null,
    event_id: row.event_id,
    event_title: row.event?.title ?? null,
    event_starts_at: row.event?.starts_at ?? null,
    actor: row.actor,
  }
}

function verbFor(type: NotificationType): string {
  switch (type) {
    case 'mention':
      return 'mentioned you'
    case 'mention_all':
      return 'mentioned everyone'
    case 'post_comment':
      return 'commented on your post'
    case 'post_like':
      return 'liked your post'
    case 'comment_like':
      return 'liked your comment'
    case 'event_reminder':
      return 'starts soon'
  }
}

// "starts in ~N hours" for an event reminder, from its start time.
function startsInLabel(iso: string | null): string {
  if (!iso) return 'starts soon'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'is starting now'
  const hours = Math.round(ms / 3_600_000)
  if (hours >= 20) return 'starts in about a day'
  if (hours >= 2) return `starts in about ${hours} hours`
  return 'starts within the hour'
}

// Notification bell with an unread badge + dropdown. Self-contained: it fetches
// its own rows via the browser client (RLS scopes them to the signed-in
// recipient), subscribes to Supabase Realtime for live inserts, and marks all
// unread as read when the panel is opened.
export function NotificationBell({
  teacherId,
  slug,
}: {
  teacherId: string
  slug: string
}) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('notifications')
        .select(SELECT)
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', teacherId)
        .is('read_at', null),
    ])
    setItems(((data ?? []) as unknown as Row[]).map(mapRow))
    setUnread(count ?? 0)
  }, [teacherId])

  // Initial load + realtime subscription to this recipient's new rows. Both the
  // initial fetch and the subscription are set up inside the async getUser()
  // callback, so no setState fires synchronously in the effect body.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      void load()
      if (!user) return
      // Unique topic per effect run: the browser client memoizes channels by
      // name, so a reused name would hand back an already-subscribed channel and
      // `.on()` after `subscribe()` throws (notably under React's dev double-mount).
      channel = supabase
        .channel(`notifications-bell-${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          () => void load(),
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [load])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      // Optimistically clear the badge, then persist.
      setUnread(0)
      setItems((prev) =>
        prev.map((n) =>
          n.read_at ? n : { ...n, read_at: new Date().toISOString() },
        ),
      )
      const supabase = createClient()
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('teacher_id', teacherId)
        .is('read_at', null)
    }
  }

  function hrefFor(n: NotificationItem): string | null {
    if (n.type === 'event_reminder') return `/t/${slug}/events`
    if (!n.post_id || !n.channel_slug) return null
    return `/t/${slug}/community/${n.channel_slug}/${n.post_id}`
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel: max-w-[calc(100vw-2rem)] and the md anchor flip are load-bearing —
          w-80 alone can't shrink, so a narrow viewport clips the panel. Restored
          from main after the MT port dropped them. Keep both if you edit this. */}
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-lg md:left-0 md:right-auto">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <p className="text-sm font-semibold text-fg">Notifications</p>
            <PushToggle />
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              No notifications yet
            </p>
          ) : (
            <ul className="max-h-96 overflow-auto">
              {items.map((n) => {
                const href = hrefFor(n)
                const actorName = n.actor?.display_name ?? 'Someone'
                const isEvent = n.type === 'event_reminder'
                const body = (
                  <div className="flex gap-3 px-4 py-3">
                    {isEvent ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-secondary">
                        <CalendarClock className="h-4 w-4" />
                      </span>
                    ) : (
                      <Avatar
                        url={n.actor?.avatar_url ?? null}
                        name={actorName}
                        size="sm"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {isEvent ? (
                        <p className="text-sm text-fg">
                          <span className="font-medium">
                            {n.event_title ?? 'An event'}
                          </span>{' '}
                          {startsInLabel(n.event_starts_at)}
                        </p>
                      ) : (
                        <p className="text-sm text-fg">
                          <span className="font-medium">{actorName}</span>{' '}
                          {verbFor(n.type)}
                        </p>
                      )}
                      {n.post_title && (
                        <p className="truncate text-xs text-fg-muted">
                          {n.post_title}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {formatRelativeTime(n.created_at)}
                      </p>
                    </div>
                    {!n.read_at && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
                    )}
                  </div>
                )
                return (
                  <li
                    key={n.id}
                    className={n.read_at ? '' : 'bg-muted/40'}
                  >
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className="block transition-colors hover:bg-muted"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
