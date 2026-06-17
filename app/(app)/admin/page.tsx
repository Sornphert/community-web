import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Film,
  FileText,
  Image as ImageIcon,
  Users,
  CalendarDays,
  ArrowRightLeft,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type AdminCard = {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

const cards: AdminCard[] = [
  {
    href: '/admin/classroom/recordings',
    label: 'Classroom Recordings',
    description: 'Create and manage recording folders and videos.',
    icon: Film,
  },
  {
    href: '/admin/classroom/documents',
    label: 'Classroom Documents',
    description: 'Upload PDF and image lessons into topics.',
    icon: FileText,
  },
  {
    href: '/admin/classroom/topics',
    label: 'Topic Covers',
    description: 'Set or change the cover image on classroom topics.',
    icon: ImageIcon,
  },
  {
    href: '/members',
    label: 'Members',
    description: 'Browse the member directory and profiles.',
    icon: Users,
  },
  {
    href: '/events',
    label: 'Events',
    description: 'Add, edit, and delete events on the calendar.',
    icon: CalendarDays,
  },
  {
    href: '/admin/migrate-posts',
    label: 'Migrate Posts',
    description: 'One-time tool: assign channels to unassigned posts.',
    icon: ArrowRightLeft,
  },
]

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/community')

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Admin</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Manage classroom content, members, events, and more.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
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
