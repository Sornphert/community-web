'use client'

import { useState } from 'react'
import type { CommunityEvent } from '@/lib/types'
import { formatKlTime, klDateBadge } from '@/lib/datetime'

// Upcoming + Past lists. `events` arrives sorted ascending; we split on now and
// reverse the past list so the most recent sits on top.
export function EventsSidebar({
  events,
  onSelectEvent,
}: {
  events: CommunityEvent[]
  onSelectEvent: (event: CommunityEvent) => void
}) {
  // Snapshot "now" once at mount — calling Date.now() during render is impure
  // (flagged by the React Compiler) and the upcoming/past split needn't be live.
  const [now] = useState(() => Date.now())
  const upcoming: CommunityEvent[] = []
  const past: CommunityEvent[] = []
  for (const event of events) {
    // An event is "past" once it has ended.
    if (new Date(event.ends_at).getTime() < now) {
      past.push(event)
    } else {
      upcoming.push(event)
    }
  }
  past.reverse()

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">
          Upcoming Events
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-4 text-sm text-zinc-500">
            No upcoming events. Check back soon!
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((event) => (
              <SidebarRow
                key={event.id}
                event={event}
                onSelectEvent={onSelectEvent}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">
            Past Events
          </h2>
          <ul className="flex flex-col gap-2">
            {past.map((event) => (
              <SidebarRow
                key={event.id}
                event={event}
                onSelectEvent={onSelectEvent}
                muted
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SidebarRow({
  event,
  onSelectEvent,
  muted = false,
}: {
  event: CommunityEvent
  onSelectEvent: (event: CommunityEvent) => void
  muted?: boolean
}) {
  const badge = klDateBadge(event.starts_at)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectEvent(event)}
        className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2.5 text-left transition-colors hover:bg-zinc-50"
      >
        <div
          className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md ${
            muted ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-900 text-white'
          }`}
        >
          <span className="text-sm font-semibold leading-none">{badge.day}</span>
          <span className="text-[10px] uppercase leading-none">
            {badge.month}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900">
            {event.title}
          </p>
          <p className="text-xs text-zinc-500">{formatKlTime(event.starts_at)}</p>
        </div>
      </button>
    </li>
  )
}
