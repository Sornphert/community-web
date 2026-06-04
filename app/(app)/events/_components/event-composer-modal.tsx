'use client'

import { useState } from 'react'
import type { CommunityEvent } from '@/lib/types'
import {
  KL_TZ_LABEL,
  addDaysToDateKey,
  formatDateKeyShort,
  klDayKey,
  klTimeInputValue,
  klWallClockToUtcIso,
} from '@/lib/datetime'

const MAX_SERIES_DAYS = 14
import { createEvent, updateEvent } from '../actions'
import { Modal } from './modal'

const inputClass =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500'
const labelClass = 'flex flex-col gap-1 text-sm font-medium text-zinc-700'

// Admin create/edit form. All date/time inputs are KL wall-clock; they're
// converted to UTC ISO before hitting the server action (KL has no DST, so the
// fixed +08:00 conversion is exact). `event` non-null => edit mode.
export function EventComposerModal({
  event,
  onClose,
  onSaved,
}: {
  event: CommunityEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = event !== null

  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(
    event ? klDayKey(event.starts_at) : '',
  )
  const [startTime, setStartTime] = useState(
    event ? klTimeInputValue(event.starts_at) : '',
  )
  const [endTime, setEndTime] = useState(
    event ? klTimeInputValue(event.ends_at) : '',
  )
  const [location, setLocation] = useState(event?.location ?? '')
  const [meetingUrl, setMeetingUrl] = useState(event?.meeting_url ?? '')
  const [description, setDescription] = useState(event?.description ?? '')

  // Recurrence is create-only (each occurrence is independent after creation).
  const [repeats, setRepeats] = useState(false)
  const [repeatDays, setRepeatDays] = useState(2)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live preview of the dates a series would create, e.g. "Jun 14, Jun 15".
  const seriesDates =
    !editing && repeats && date && repeatDays >= 2
      ? Array.from({ length: Math.min(repeatDays, MAX_SERIES_DAYS) }, (_, i) =>
          formatDateKeyShort(addDaysToDateKey(date, i)),
        )
      : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    const startsAt = klWallClockToUtcIso(date, startTime)
    const endsAt = klWallClockToUtcIso(date, endTime)
    if (!startsAt || !endsAt) {
      setError('Date, start time, and end time are required.')
      return
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setError('End time must be after the start time.')
      return
    }

    setSubmitting(true)
    const payload = {
      title,
      startsAt,
      endsAt,
      location,
      meetingUrl,
      description,
    }
    const result = editing
      ? await updateEvent({ ...payload, id: event.id })
      : await createEvent({
          ...payload,
          repeatDays: repeats ? repeatDays : 1,
        })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    onSaved()
  }

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="event-composer-form"
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
      </button>
    </div>
  )

  return (
    <Modal
      title={editing ? 'Edit Event' : 'New Event'}
      onClose={onClose}
      footer={footer}
    >
      <form
        id="event-composer-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <label className={labelClass}>
          Title *
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Date *
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Start time *
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            End time *
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              className={inputClass}
            />
          </label>
        </div>
        <p className="-mt-2 text-xs text-zinc-400">
          Times are in {KL_TZ_LABEL}.
        </p>

        {!editing && (
          <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <label className={labelClass}>
              Repeat
              <select
                value={repeats ? 'days' : 'none'}
                onChange={(e) => setRepeats(e.target.value === 'days')}
                className={inputClass}
              >
                <option value="none">Does not repeat</option>
                <option value="days">Repeat for N consecutive days</option>
              </select>
            </label>

            {repeats && (
              <>
                <label className={labelClass}>
                  Number of days
                  <input
                    type="number"
                    min={2}
                    max={MAX_SERIES_DAYS}
                    value={repeatDays}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      setRepeatDays(
                        Number.isNaN(n)
                          ? 2
                          : Math.min(Math.max(Math.trunc(n), 2), MAX_SERIES_DAYS),
                      )
                    }}
                    className={inputClass}
                  />
                </label>
                {seriesDates.length > 0 && (
                  <p className="text-xs text-zinc-500">
                    Creates {seriesDates.length} events:{' '}
                    {seriesDates.join(', ')}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <label className={labelClass}>
          Location
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. KL office, Level 3"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Meeting URL
          <input
            type="url"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://zoom.us/j/…"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
