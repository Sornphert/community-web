import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { getMemberProfile } from '@/lib/posts'
import { getFollowState } from '@/lib/follows'
import { MemberProfileView } from '../_components/member-profile-view'

// [MT] Your OWN profile tab — the SAME member view anyone else sees (your posts,
// followers, following), NOT the edit form. The settings gear (top-right) leads to
// /t/[slug]/profile/edit, which hosts the profile form + account settings.
export default async function TeacherProfilePage({
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

  // The viewer is an active member of this teacher (the shell gates that), so their
  // own member profile resolves. If it somehow doesn't, fall back to the edit form.
  const member = await getMemberProfile(user.id, teacher.id)
  if (!member) {
    redirect(`/t/${slug}/profile/edit`)
  }

  const follow = await getFollowState(user.id, user.id)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-fg-muted">Your profile</span>
        <Link
          href={`/t/${slug}/profile/edit`}
          aria-label="Edit profile and settings"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
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
        viewerId={user.id}
        memberBasePath={`/t/${slug}`}
      />
    </div>
  )
}
