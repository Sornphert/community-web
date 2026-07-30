import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  GraduationCap,
  Users,
  CalendarDays,
  Palette,
  Tags,
  Hash,
  UserCog,
  Flag,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getOpenReportCount } from '@/lib/moderation'

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
    to: '/admin/classroom',
    label: 'Classroom settings',
    description:
      'Add topics and manage covers, access, lessons, and recordings.',
    icon: GraduationCap,
  },
  {
    to: '/admin/tags',
    label: 'Tags',
    description: 'Create tier tags that gate classroom topics and mark members.',
    icon: Tags,
  },
  {
    to: '/admin/members',
    label: 'Member Roles & Tags',
    description: 'Promote or demote admins and assign tags to members.',
    icon: UserCog,
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
  {
    to: '/admin/channels',
    label: 'Channels',
    description: 'Create, rename, reorder, and delete community channels.',
    icon: Hash,
  },
  {
    to: '/admin/branding',
    label: 'Branding',
    description: 'Set the cover, logo, and description for your community card.',
    icon: Palette,
  },
  {
    to: '/admin/reports',
    label: 'Reports',
    description: 'Review posts, comments, and members your community flagged.',
    icon: Flag,
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

  // Open-report count drives the badge on the Reports card (draws attention when there's
  // a moderation backlog). Cheap head count; 0 → no badge.
  const openReports = await getOpenReportCount(teacher.id)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Admin</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Manage classroom content, members, events, and more.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map(({ to, label, description, icon: Icon }) => {
          const badge =
            to === '/admin/reports' && openReports > 0 ? openReports : null
          return (
            <Link
              key={to}
              href={`/t/${slug}${to}`}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 hover:bg-hover-subtle"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-fg-secondary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">{label}</span>
                  {badge !== null && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-fg-muted">{description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
