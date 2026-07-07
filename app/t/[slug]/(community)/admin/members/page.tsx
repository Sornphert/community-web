import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getAllMembers, getPendingMembers } from '@/lib/posts'
import { PendingMemberRow } from './_components/pending-member-row'

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
  // Pending join-requests are a separate queue rendered above the roster.
  const [members, pending] = await Promise.all([
    getAllMembers(teacher.id),
    getPendingMembers(teacher.id),
  ])

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Member Roles & Tags</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Choose a member to change their role or assign tags.
      </p>

      {/* Pending-join queue. Rendered ONLY when non-empty — an empty queue shows nothing,
          keeping the roster uncluttered. Each row triages inline (Approve/Deny), breaking
          the roster's navigation-only convention on purpose (see PendingMemberRow). */}
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold text-fg">
            Pending requests
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-fg-soft">
              {pending.length}
            </span>
          </h2>
          <p className="mb-3 text-xs text-fg-muted">
            Approve to grant access, or deny to reject the request.
          </p>
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <PendingMemberRow key={p.id} teacherId={teacher.id} member={p} />
            ))}
          </div>
        </section>
      )}

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
