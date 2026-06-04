import { createClient } from '@/lib/supabase/server'
import type { CommunityEvent } from '@/lib/types'

// NOTE: imports the server Supabase client — only call from Server Components.
// Client components receive the already-fetched events as props.

// All events, soonest first. The calendar buckets them by KL day client-side
// (see lib/datetime.ts), and the sidebar splits them into upcoming/past; a
// single ascending fetch serves both.
export async function getEvents(): Promise<CommunityEvent[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('starts_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to load events: ${error.message}`)
  }

  return (data ?? []) as CommunityEvent[]
}
