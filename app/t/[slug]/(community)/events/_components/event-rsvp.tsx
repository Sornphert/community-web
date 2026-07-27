'use client'

import { useEffect, useState } from 'react'
import { Check, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/app/(app)/_components/avatar'

type Attendee = { user_id: string; display_name: string; avatar_url: string | null }

type RsvpRow = {
  user_id: string
  profile: { display_name: string; avatar_url: string | null } | null
}

// RSVP control for an event: an "I'm attending" toggle, a live count, and (for
// admins) the attendee list. Self-fetches via the browser client — RLS lets members
// of the event's teacher read the rows and write only their own.
export function EventRsvp({
  eventId,
  isAdmin,
}: {
  eventId: string
  isAdmin: boolean
}) {
  const [uid, setUid] = useState<string | null>(null)
  const [attending, setAttending] = useState(false)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const [{ data: auth }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('event_rsvps')
          .select('user_id, profile:profiles!user_id(display_name, avatar_url)')
          .eq('event_id', eventId)
          .order('created_at', { ascending: true }),
      ])
      if (cancelled) return
      const me = auth.user?.id ?? null
      const rows = (data ?? []) as unknown as RsvpRow[]
      setUid(me)
      setAttending(!!me && rows.some((r) => r.user_id === me))
      setAttendees(
        rows
          .filter((r) => r.profile !== null)
          .map((r) => ({
            user_id: r.user_id,
            display_name: r.profile!.display_name,
            avatar_url: r.profile!.avatar_url,
          })),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function toggle() {
    if (!uid || pending) return
    const next = !attending
    setAttending(next)
    setPending(true)
    setAttendees((prev) =>
      next
        ? prev.some((a) => a.user_id === uid)
          ? prev
          : [...prev, { user_id: uid, display_name: 'You', avatar_url: null }]
        : prev.filter((a) => a.user_id !== uid),
    )
    try {
      const supabase = createClient()
      if (next) {
        const { error } = await supabase
          .from('event_rsvps')
          .insert({ event_id: eventId, user_id: uid })
        if (error && error.code !== '23505') throw error
      } else {
        const { error } = await supabase
          .from('event_rsvps')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', uid)
        if (error) throw error
      }
    } catch {
      setAttending(!next)
      setAttendees((prev) =>
        next ? prev.filter((a) => a.user_id !== uid) : prev,
      )
    } finally {
      setPending(false)
    }
  }

  const count = attendees.length

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-secondary">
          <Users className="h-4 w-4 text-fg-faint" />
          {loading ? '—' : count} attending
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={loading || pending || !uid}
          aria-pressed={attending}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            attending
              ? 'border border-line text-fg-secondary hover:bg-muted'
              : 'bg-inverse text-inverse-fg hover:bg-inverse-hover'
          }`}
        >
          {attending ? (
            <>
              <Check className="h-4 w-4" />
              Attending
            </>
          ) : (
            "I'm attending"
          )}
        </button>
      </div>

      {isAdmin && count > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
          {attendees.map((a) => (
            <span
              key={a.user_id}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs text-fg-secondary"
            >
              <Avatar url={a.avatar_url} name={a.display_name} size="sm" />
              {a.display_name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
