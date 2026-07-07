import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getMemberProfile } from '@/lib/posts'
import { getTeacherTags, getMemberTagIds } from '@/lib/tags'
import { MemberTagsEditor } from '../_components/member-tags-editor'
import { RoleToggle } from './_components/role-toggle'

// [MT] The sensitive surface: manage an EXISTING member's ROLE (promote/demote) and their
// tags. Defensive in-page isTeacherAdmin guard on top of admin/layout.tsx. The target is
// confirmed an ACTIVE member of THIS teacher via getMemberProfile (reused, unmodified) — a
// null result (non-member / revoked / tombstoned / other teacher) is notFound(), so neither
// control renders for a non-member. The role flip goes through the set_membership_role RPC
// (the last-admin invariant is enforced there, transactionally); tags go through member_tags
// under admin RLS. No add/remove-member, no invite.
export default async function AdminMemberTagsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params

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

  const member = await getMemberProfile(id, teacher.id)
  if (!member) {
    notFound()
  }

  const [tags, heldTagIds] = await Promise.all([
    getTeacherTags(teacher.id),
    getMemberTagIds(id, teacher.id),
  ])

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`/t/${slug}/admin/members`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to members
      </Link>

      {/* Read-only identity header */}
      <section className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <Avatar url={member.avatar_url} name={member.display_name} size="lg" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-fg">
              {member.display_name}
            </h1>
            {member.role === 'admin' && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-fg-soft">
                Admin
              </span>
            )}
          </div>
          {member.bio && (
            <p className="truncate text-sm text-fg-muted">{member.bio}</p>
          )}
        </div>
      </section>

      <div className="mb-4 rounded-lg border border-line bg-surface p-4">
        <RoleToggle
          teacherId={teacher.id}
          profileId={member.id}
          currentRole={member.role}
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <MemberTagsEditor
          teacherId={teacher.id}
          profileId={member.id}
          tags={tags}
          heldTagIds={heldTagIds}
        />
      </div>
    </div>
  )
}
