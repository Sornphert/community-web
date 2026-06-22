import { notFound } from 'next/navigation'
import { getEvents } from '@/lib/events'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { EventsView } from './_components/events-view'

export default async function EventsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // cache()-deduped with the layout's resolution. The layout already gates
  // membership and 404s an unknown slug; this is the defensive re-resolve so the
  // page has the teacher id for scoping (slug is carried in the URL, not props).
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  // [MT] Admin gating per-teacher via the same is_teacher_admin RPC the RLS uses,
  // keyed to THIS teacher — never a global is_admin. Drives the "+ Event"
  // affordance; writes are also guarded in actions.ts and by RLS (events_*_admin).
  const isAdmin = await isTeacherAdmin(teacher.id)

  // teacherId scopes the fetch AND is passed to the composer so created events are
  // stamped with the right teacher_id (events.teacher_id is NOT NULL).
  const events = await getEvents(teacher.id)

  return <EventsView events={events} isAdmin={isAdmin} teacherId={teacher.id} />
}
