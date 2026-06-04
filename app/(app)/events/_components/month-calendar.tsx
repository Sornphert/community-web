'use client'

import type { CommunityEvent } from '@/lib/types'
import { buildMonthGrid, formatKlTime } from '@/lib/datetime'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3

// Month grid (Sun–Sat). Events render as chips inside their KL day cell; busy
// days cap visible chips and show a "+N more" button that opens the day's list
// (handled by the parent) so a packed day never overflows the grid.
export function MonthCalendar({
  year,
  month,
  byDay,
  todayKey,
  onSelectEvent,
  onShowMore,
}: {
  year: number
  month: number
  byDay: Map<string, CommunityEvent[]>
  todayKey: string
  onSelectEvent: (event: CommunityEvent) => void
  onShowMore: (dateKey: string) => void
}) {
  const cells = buildMonthGrid(year, month)

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-medium text-zinc-500"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const dayEvents = byDay.get(cell.dateKey) ?? []
          const isToday = cell.dateKey === todayKey
          const visible = dayEvents.slice(0, MAX_CHIPS)
          const overflow = dayEvents.length - visible.length

          return (
            <div
              key={cell.dateKey}
              className={`min-h-[96px] border-b border-r border-zinc-100 p-1.5 ${
                i % 7 === 6 ? 'border-r-0' : ''
              } ${cell.inMonth ? 'bg-white' : 'bg-zinc-50/60'}`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs ${
                    isToday
                      ? 'bg-zinc-900 font-semibold text-white'
                      : cell.inMonth
                        ? 'text-zinc-700'
                        : 'text-zinc-400'
                  }`}
                >
                  {cell.day}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {visible.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    title={event.title}
                    className="flex w-full items-center gap-1 truncate rounded bg-zinc-100 px-1.5 py-1 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-200"
                  >
                    <span className="shrink-0 font-medium text-zinc-500">
                      {formatKlTime(event.starts_at)}
                    </span>
                    <span className="truncate">{event.title}</span>
                  </button>
                ))}

                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onShowMore(cell.dateKey)}
                    className="rounded px-1.5 py-0.5 text-left text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
