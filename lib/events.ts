import { createClient } from '@/lib/supabase/server'
import type { CommunityEvent } from '@/lib/types'

// NOTE: imports the server Supabase client — only call from Server Components.
// Client components receive the already-fetched events as props.

// One teacher's events, soonest first. The calendar buckets them by KL day
// client-side (see lib/datetime.ts), and the sidebar splits them into
// upcoming/past; a single ascending fetch serves both.
//
// [MT] teacherId is REQUIRED (no optional param — an optional teacherId bakes the
// silent cross-teacher leak into the signature). Resolve it from the slug via
// getTeacherBySlug in the page. RLS (events_select USING has_membership) would NOT
// error on an un-scoped read — it would quietly return every teacher the viewer
// belongs to — so this .eq is the actual tenant boundary, not a nicety.
export async function getEvents(teacherId: string): Promise<CommunityEvent[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('starts_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to load events: ${error.message}`)
  }

  return (data ?? []) as CommunityEvent[]
}
