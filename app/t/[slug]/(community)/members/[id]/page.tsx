import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTeacherBySlug } from '@/lib/teachers'
import { getMemberProfile } from '@/lib/posts'
import { getFollowState } from '@/lib/follows'
import { createClient } from '@/lib/supabase/server'
import { MemberProfileView } from '../../_components/member-profile-view'
import { MessageMemberButton } from '../../messages/_components/message-member-button'

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  // [MT] Scoped to THIS teacher: returns null unless the target is an active member
  // here (members of other teachers / revoked / tombstoned are not viewable), and
  // their posts are scoped to teacher_id. Badge reads their role in this teacher.
  const member = await getMemberProfile(id, teacher.id)
  if (!member) {
    notFound()
  }

  // Platform-wide follow graph (0024): counts + lists + whether the viewer follows.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const follow = await getFollowState(id, user?.id ?? null)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-2">
        <Link
          href={`/t/${slug}/members`}
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to members
        </Link>
        {user && user.id !== member.id && (
          <MessageMemberButton
            slug={slug}
            teacherId={teacher.id}
            otherId={member.id}
          />
        )}
      </div>

      <MemberProfileView
        targetId={member.id}
        displayName={member.display_name}
        avatarUrl={member.avatar_url}
        bio={member.bio}
        socialLinks={member.social_links ?? {}}
        roleLabel={member.role === 'admin' ? 'Admin' : null}
        posts={member.posts.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          created_at: p.created_at,
          href: p.channel_slug
            ? `/t/${slug}/community/${p.channel_slug}/${p.id}`
            : null,
        }))}
        follow={follow}
        viewerId={user?.id ?? null}
      />
    </div>
  )
}
