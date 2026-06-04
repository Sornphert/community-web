import { createClient } from '@/lib/supabase/server'
import { getEvents } from '@/lib/events'
import { EventsView } from './_components/events-view'

export default async function EventsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Admin gating mirrors (app)/layout.tsx; drives the "+ Event" affordance.
  // Writes are also guarded server-side (actions.ts) and by RLS (migration 0008).
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
    isAdmin = profile?.is_admin === true
  }

  const events = await getEvents()

  return <EventsView events={events} isAdmin={isAdmin} />
}
