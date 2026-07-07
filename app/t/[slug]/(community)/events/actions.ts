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

// [MT] Per-teacher admin guard. Resolves admin status through the SAME
// is_teacher_admin RPC the events_*_admin RLS policies call, keyed to a specific
// teacher — never a global is_admin (that column is gone under MT). This is the
// belt-and-suspenders layer so a non-admin (or an admin of a DIFFERENT teacher)
// never reaches the write; RLS is the real enforcement.
async function requireTeacherAdmin(teacherId: string): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data } = await supabase.rpc('is_teacher_admin', {
    p_teacher_id: teacherId,
  })
  if (data !== true) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

// Resolves the owning teacher of an existing event so update/delete can gate on
// is_teacher_admin(thatTeacher) — an admin of teacher X must not mutate teacher
// Y's event even though the action carries no slug. Mirrors requireOwnerOrAdmin
// in the community posts actions (read the row's teacher_id, then gate).
async function requireTeacherAdminForEvent(eventId: string): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('events')
    .select('teacher_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!existing) {
    return { error: 'Event not found.' }
  }
  return requireTeacherAdmin(existing.teacher_id)
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

// [MT] teacherId is REQUIRED on create (stamped on every inserted row); updates
// resolve the teacher from the existing row instead, so it lives here, not on the
// shared EventInput.
export async function createEvent(
  input: EventInput & { teacherId: string },
): Promise<ActionResult> {
  const row = buildRow(input)
  if ('error' in row) return { error: row.error }

  const repeat = input.repeatDays ?? 1
  if (!Number.isInteger(repeat) || repeat < 1) {
    return { error: 'Invalid number of days.' }
  }
  if (repeat > MAX_SERIES_DAYS) {
    return { error: `A series can span at most ${MAX_SERIES_DAYS} days.` }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Single event: behave exactly as before (series_id stays null). [MT] teacher_id
  // stamped — events.teacher_id is NOT NULL and RLS checks is_teacher_admin(it).
  if (repeat === 1) {
    const { error } = await auth.supabase
      .from('events')
      .insert({ ...row, teacher_id: input.teacherId, created_by: auth.userId })
    if (error) {
      return { error: error.message }
    }
    revalidatePath('/', 'layout')
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
    teacher_id: string
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
    // [MT] Every materialized series row gets teacher_id — the series-loop and the
    // single-event paths above are separate inserts; both must stamp it or the
    // series rows fail the events_insert_admin WITH CHECK (and would leak tenancy).
    rows.push({
      ...row,
      teacher_id: input.teacherId,
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

  revalidatePath('/', 'layout')
  return {}
}

export async function updateEvent(
  input: EventInput & { id: string },
): Promise<ActionResult> {
  const row = buildRow(input)
  if ('error' in row) return { error: row.error }

  // [MT] Gate on THIS event's teacher — an admin of another teacher must not edit
  // it (RLS backstops). teacher_id is never changed by an update.
  const auth = await requireTeacherAdminForEvent(input.id)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('events')
    .update(row)
    .eq('id', input.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

// scope 'series' (with a seriesId) deletes every occurrence sharing that
// series_id; otherwise just the single row. Defaults to single-row delete.
export async function deleteEvent(input: {
  id: string
  seriesId?: string | null
  scope?: 'one' | 'series'
}): Promise<ActionResult> {
  // [MT] Gate on the targeted event's teacher (resolved from input.id), even for a
  // series delete — every occurrence in a series shares one teacher_id, so gating
  // on the clicked row's teacher covers the whole series; RLS backstops each row.
  const auth = await requireTeacherAdminForEvent(input.id)
  if ('error' in auth) return auth

  const query = auth.supabase.from('events').delete()
  const { error } =
    input.scope === 'series' && input.seriesId
      ? await query.eq('series_id', input.seriesId)
      : await query.eq('id', input.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}
