'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { CommunityEvent } from '@/lib/types'
import {
  KL_TZ_LABEL,
  formatKlTime,
  klDayKey,
  klToday,
  monthLabel,
} from '@/lib/datetime'
import { MonthCalendar } from './month-calendar'
import { ListView } from './list-view'
import { EventsSidebar } from './events-sidebar'
import { EventDetailModal } from './event-detail-modal'
import { EventComposerModal } from './event-composer-modal'
import { Modal } from './modal'

type ComposerState =
  | { open: false }
  | { open: true; event: CommunityEvent | null }

// Client shell for the Events tab. Owns the viewed month, month/list toggle, and
// the detail/composer/day-popup modals. Calendar comes first in the DOM (so
// mobile stacks it on top and screen-reader order stays calendar→sidebar); on
// desktop `lg:order` floats the sidebar to the left.
export function EventsView({
  events,
  isAdmin,
}: {
  events: CommunityEvent[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const today = klToday()

  const [view, setView] = useState({ year: today.year, month: today.month })
  const [mode, setMode] = useState<'month' | 'list'>('month')
  const [selected, setSelected] = useState<CommunityEvent | null>(null)
  const [composer, setComposer] = useState<ComposerState>({ open: false })
  const [dayPopup, setDayPopup] = useState<string | null>(null)

  // Bucket events by KL day for the grid + day popup.
  const byDay = new Map<string, CommunityEvent[]>()
  for (const event of events) {
    const key = klDayKey(event.starts_at)
    const existing = byDay.get(key)
    if (existing) existing.push(event)
    else byDay.set(key, [event])
  }

  function goPrev() {
    setView((v) =>
      v.month === 0
        ? { year: v.year - 1, month: 11 }
        : { year: v.year, month: v.month - 1 },
    )
  }
  function goNext() {
    setView((v) =>
      v.month === 11
        ? { year: v.year + 1, month: 0 }
        : { year: v.year, month: v.month + 1 },
    )
  }
  function goToday() {
    setView({ year: today.year, month: today.month })
  }

  function afterMutation() {
    setComposer({ open: false })
    setSelected(null)
    router.refresh()
  }

  const popupEvents = dayPopup ? (byDay.get(dayPopup) ?? []) : []

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Calendar column — first in DOM; desktop moves it to the right. */}
        <div className="lg:order-2 lg:flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-fg">
                  {monthLabel(view.year, view.month)}
                </h1>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous month"
                    className="rounded-md p-1.5 text-fg-muted hover:bg-muted hover:text-fg-secondary"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next month"
                    className="rounded-md p-1.5 text-fg-muted hover:bg-muted hover:text-fg-secondary"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-md border border-line-strong px-2.5 py-1 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
                >
                  Today
                </button>
              </div>
              <p className="mt-0.5 text-xs text-fg-faint">{KL_TZ_LABEL}</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-line-strong p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('month')}
                  className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                    mode === 'month'
                      ? 'bg-inverse text-inverse-fg'
                      : 'text-fg-soft hover:bg-muted'
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                    mode === 'list'
                      ? 'bg-inverse text-inverse-fg'
                      : 'text-fg-soft hover:bg-muted'
                  }`}
                >
                  List
                </button>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setComposer({ open: true, event: null })}
                  className="inline-flex items-center gap-1.5 rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
                >
                  <Plus className="h-4 w-4" />
                  Event
                </button>
              )}
            </div>
          </div>

          {mode === 'month' ? (
            <MonthCalendar
              year={view.year}
              month={view.month}
              byDay={byDay}
              todayKey={today.dateKey}
              onSelectEvent={setSelected}
              onShowMore={setDayPopup}
            />
          ) : (
            <ListView events={events} onSelectEvent={setSelected} />
          )}
        </div>

        {/* Sidebar — second in DOM; desktop floats it left at ~300px. */}
        <aside className="lg:order-1 lg:w-[300px] lg:shrink-0">
          <EventsSidebar events={events} onSelectEvent={setSelected} />
        </aside>
      </div>

      {selected && (
        <EventDetailModal
          event={selected}
          isAdmin={isAdmin}
          seriesCount={
            selected.series_id
              ? events.filter((e) => e.series_id === selected.series_id).length
              : 0
          }
          onClose={() => setSelected(null)}
          onEdit={(event) => {
            setSelected(null)
            setComposer({ open: true, event })
          }}
          onDeleted={afterMutation}
        />
      )}

      {composer.open && (
        <EventComposerModal
          event={composer.event}
          onClose={() => setComposer({ open: false })}
          onSaved={afterMutation}
        />
      )}

      {dayPopup && (
        <Modal title="Events" onClose={() => setDayPopup(null)}>
          <ul className="flex flex-col gap-2">
            {popupEvents.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDayPopup(null)
                    setSelected(event)
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-md border border-line p-2.5 text-left transition-colors hover:bg-hover-subtle"
                >
                  <span className="text-xs font-medium text-fg-muted">
                    {formatKlTime(event.starts_at)}
                  </span>
                  <span className="text-sm font-medium text-fg">
                    {event.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  )
}
