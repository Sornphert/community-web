import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getAllMembers } from '@/lib/posts'

// [MT] Admin roster for tag assignment. Distinct from the member-visible /members
// directory: this lives UNDER /admin (guarded by admin/layout.tsx) and links to the
// per-member assign page. Defensive in-page isTeacherAdmin redirect on top of the layout
// guard (belt-and-suspenders; keyed to THIS teacher, never a global is_admin).
export default async function AdminMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  if (!(await isTeacherAdmin(teacher.id))) {
    redirect(`/t/${slug}/community`)
  }

  // Active members of THIS teacher (reused, unmodified) — the assignment target set.
  const members = await getAllMembers(teacher.id)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Member Tags</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Choose a member to assign or remove their tags.
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-fg-muted">No members yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/t/${slug}/admin/members/${member.id}`}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-hover-subtle"
            >
              <Avatar
                url={member.avatar_url}
                name={member.display_name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">
                    {member.display_name}
                  </span>
                  {member.role === 'admin' && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-fg-soft">
                      Admin
                    </span>
                  )}
                </div>
                {member.bio && (
                  <p className="truncate text-sm text-fg-muted">{member.bio}</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
