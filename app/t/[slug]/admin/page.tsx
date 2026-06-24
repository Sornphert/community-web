import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  Film,
  FileText,
  Image as ImageIcon,
  Users,
  CalendarDays,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'

type AdminCard = {
  // Path relative to /t/[slug] — prefixed per-request below. All targets are
  // already-ported teacher-scoped routes.
  to: string
  label: string
  description: string
  icon: LucideIcon
}

const cards: AdminCard[] = [
  {
    to: '/admin/classroom/recordings',
    label: 'Classroom Recordings',
    description: 'Create and manage recording folders and videos.',
    icon: Film,
  },
  {
    to: '/admin/classroom/documents',
    label: 'Classroom Documents',
    description: 'Upload PDF and image lessons into topics.',
    icon: FileText,
  },
  {
    to: '/admin/classroom/topics',
    label: 'Topic Covers',
    description: 'Set or change the cover image on classroom topics.',
    icon: ImageIcon,
  },
  {
    to: '/members',
    label: 'Members',
    description: 'Browse the member directory and profiles.',
    icon: Users,
  },
  {
    to: '/events',
    label: 'Events',
    description: 'Add, edit, and delete events on the calendar.',
    icon: CalendarDays,
  },
]

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // cache()-deduped with the admin layout. Defensive 404 + per-teacher admin guard
  // (belt-and-suspenders alongside the shared admin layout; mirrors the classroom
  // admin pages). isTeacherAdmin is keyed to THIS teacher — never a global is_admin.
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) notFound()
  if (!(await isTeacherAdmin(teacher.id))) redirect(`/t/${slug}/community`)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Admin</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Manage classroom content, members, events, and more.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map(({ to, label, description, icon: Icon }) => (
          <Link
            key={to}
            href={`/t/${slug}${to}`}
            className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 hover:bg-hover-subtle"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-fg-secondary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-medium text-fg">{label}</div>
              <p className="text-sm text-fg-muted">{description}</p>
            </div>
          </Link>
        ))}

        {/* Phase 2 — not yet built */}
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-line bg-surface p-4 opacity-60">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-fg-faint">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-fg-muted">User Roles</div>
            <p className="text-sm text-fg-faint">
              Promote or demote admins. Coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
