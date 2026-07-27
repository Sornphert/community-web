'use client'

import { useState } from 'react'
import {
  CalendarPlus,
  CalendarRange,
  Clock,
  MapPin,
  Pencil,
  Trash2,
  Video,
} from 'lucide-react'
import type { CommunityEvent } from '@/lib/types'
import { formatKlDateLong, formatKlTime, KL_TZ_LABEL } from '@/lib/datetime'
import { buildIcs, icsFileName } from '@/lib/ics'
import { deleteEvent } from '../actions'
import { EventRsvp } from './event-rsvp'
import { Modal } from './modal'

export function EventDetailModal({
  event,
  isAdmin,
  seriesCount,
  onClose,
  onEdit,
  onDeleted,
}: {
  event: CommunityEvent
  isAdmin: boolean
  // Number of events sharing this event's series_id (0/1 for a standalone event).
  seriesCount: number
  onClose: () => void
  onEdit: (event: CommunityEvent) => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inSeries = event.series_id !== null && seriesCount > 1

  function handleAddToCalendar() {
    const blob = new Blob([buildIcs(event)], {
      type: 'text/calendar;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = icsFileName(event)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleDelete(scope: 'one' | 'series') {
    const message =
      scope === 'series'
        ? `Delete all ${seriesCount} events in this series? This cannot be undone.`
        : 'Delete this event? This cannot be undone.'
    if (!confirm(message)) return

    setDeleting(true)
    setError(null)
    const result = await deleteEvent({
      id: event.id,
      seriesId: event.series_id,
      scope,
    })
    if (result.error) {
      setError(result.error)
      setDeleting(false)
      return
    }
    onDeleted()
  }

  const footer = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={handleAddToCalendar}
        className="inline-flex items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
      >
        <CalendarPlus className="h-4 w-4" />
        Add to Calendar
      </button>

      {isAdmin && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(event)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => handleDelete('one')}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-md border border-danger-border px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {inSeries ? 'Delete this event' : deleting ? 'Deleting…' : 'Delete'}
          </button>
          {inSeries && (
            <button
              type="button"
              onClick={() => handleDelete('series')}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-danger-border px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete entire series
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <Modal title="Event" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-semibold text-fg">{event.title}</h3>

        <div className="flex flex-col gap-2 text-sm text-fg-secondary">
          <p className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" />
            <span>
              {formatKlDateLong(event.starts_at)}
              <br />
              {formatKlTime(event.starts_at)} – {formatKlTime(event.ends_at)}
              <span className="ml-1 text-fg-faint">({KL_TZ_LABEL})</span>
            </span>
          </p>

          {event.location && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" />
              <span>{event.location}</span>
            </p>
          )}

          {event.meeting_url && (
            <p className="flex items-start gap-2">
              <Video className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" />
              <a
                href={event.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-fg underline hover:text-fg-soft"
              >
                {event.meeting_url}
              </a>
            </p>
          )}
        </div>

        {event.description && (
          <p className="whitespace-pre-wrap text-sm text-fg-secondary">
            {event.description}
          </p>
        )}

        <EventRsvp eventId={event.id} isAdmin={isAdmin} />

        {inSeries && (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-fg-soft">
            <CalendarRange className="h-3.5 w-3.5" />
            Part of a {seriesCount}-day series
          </p>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
