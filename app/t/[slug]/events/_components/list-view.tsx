'use client'

import { Calendar } from 'lucide-react'
import type { CommunityEvent } from '@/lib/types'
import { formatKlDateLong, formatKlTime } from '@/lib/datetime'

// Chronological list alternative to the month grid. Shows all events soonest
// first (the parent passes them pre-sorted ascending), each opening the detail.
export function ListView({
  events,
  onSelectEvent,
}: {
  events: CommunityEvent[]
  onSelectEvent: (event: CommunityEvent) => void
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface py-20 text-center">
        <Calendar className="h-8 w-8 text-fg-disabled" />
        <p className="text-sm text-fg-muted">No events yet</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id}>
          <button
            type="button"
            onClick={() => onSelectEvent(event)}
            className="flex w-full flex-col gap-0.5 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:bg-hover-subtle"
          >
            <span className="text-sm font-medium text-fg-muted">
              {formatKlDateLong(event.starts_at)} · {formatKlTime(event.starts_at)}
            </span>
            <span className="font-semibold text-fg">{event.title}</span>
            {event.location && (
              <span className="text-sm text-fg-soft">{event.location}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
