'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  addDaysToDateKey,
  klDayKey,
  klTimeInputValue,
  klWallClockToUtcIso,
} from '@/lib/datetime'

const MAX_SERIES_DAYS = 14

type ActionResult = { error?: string }
type ServerClient = Awaited<ReturnType<typeof createClient>>

// Shared admin guard. The DB-level enabler is the events_*_admin RLS policies
// from migration 0008; this is the belt-and-suspenders guard so a non-admin
// never reaches the write. Mirrors admin/classroom/recordings/actions.ts.
async function requireAdmin(): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_admin) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

type EventInput = {
  title: string
  // UTC ISO strings, already converted from KL wall-clock on the client.
  startsAt: string
  endsAt: string
  location: string
  meetingUrl: string
  description: string
  // 1 (default) = a single event. >1 materializes that many consecutive-day
  // occurrences linked by a shared series_id (create only).
  repeatDays?: number
}

// Validates the shared fields and normalizes optional text to null. Returns the
// row payload (sans created_by) or an error string.
function buildRow(input: EventInput):
  | { error: string }
  | {
      title: string
      starts_at: string
      ends_at: string
      location: string | null
      meeting_url: string | null
      description: string | null
    } {
  const title = input.title.trim()
  if (!title) return { error: 'Title is required.' }
  if (!input.startsAt) return { error: 'Start date and time are required.' }
  if (!input.endsAt) return { error: 'End time is required.' }

  const start = new Date(input.startsAt)
  const end = new Date(input.endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Invalid date or time.' }
  }
  if (end.getTime() <= start.getTime()) {
    return { error: 'End time must be after the start time.' }
  }

  return {
    title,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    location: input.location.trim() || null,
    meeting_url: input.meetingUrl.trim() || null,
    description: input.description.trim() || null,
  }
}

export async function createEvent(input: EventInput): Promise<ActionResult> {
  const row = buildRow(input)
  if ('error' in row) return { error: row.error }

  const repeat = input.repeatDays ?? 1
  if (!Number.isInteger(repeat) || repeat < 1) {
    return { error: 'Invalid number of days.' }
  }
  if (repeat > MAX_SERIES_DAYS) {
    return { error: `A series can span at most ${MAX_SERIES_DAYS} days.` }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  // Single event: behave exactly as before (series_id stays null).
  if (repeat === 1) {
    const { error } = await auth.supabase
      .from('events')
      .insert({ ...row, created_by: auth.userId })
    if (error) {
      return { error: error.message }
    }
    revalidatePath('/events')
    return {}
  }

  // Repeat: materialize one row per consecutive KL calendar day, sharing a
  // series_id. We re-derive the KL date + times from the (validated) UTC inputs,
  // step the *calendar date* forward, then re-convert each day to UTC — not a
  // 24h-in-UTC shift, so days near the KL midnight boundary land correctly.
  const seriesId = randomUUID()
  const baseDate = klDayKey(row.starts_at)
  const startTime = klTimeInputValue(row.starts_at)
  const endTime = klTimeInputValue(row.ends_at)

  const rows: (typeof row & {
    series_id: string
    created_by: string
  })[] = []
  for (let i = 0; i < repeat; i++) {
    const date = addDaysToDateKey(baseDate, i)
    const startsAt = klWallClockToUtcIso(date, startTime)
    const endsAt = klWallClockToUtcIso(date, endTime)
    if (!startsAt || !endsAt) {
      return { error: 'Failed to compute series dates.' }
    }
    rows.push({
      ...row,
      starts_at: startsAt,
      ends_at: endsAt,
      series_id: seriesId,
      created_by: auth.userId,
    })
  }

  const { error } = await auth.supabase.from('events').insert(rows)
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/events')
  return {}
}

export async function updateEvent(
  input: EventInput & { id: string },
): Promise<ActionResult> {
  const row = buildRow(input)
  if ('error' in row) return { error: row.error }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('events')
    .update(row)
    .eq('id', input.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/events')
  return {}
}

// scope 'series' (with a seriesId) deletes every occurrence sharing that
// series_id; otherwise just the single row. Defaults to single-row delete.
export async function deleteEvent(input: {
  id: string
  seriesId?: string | null
  scope?: 'one' | 'series'
}): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const query = auth.supabase.from('events').delete()
  const { error } =
    input.scope === 'series' && input.seriesId
      ? await query.eq('series_id', input.seriesId)
      : await query.eq('id', input.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/events')
  return {}
}
