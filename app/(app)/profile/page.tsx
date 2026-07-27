import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPostsByAuthor } from '@/lib/posts'
import { getFollowState } from '@/lib/follows'
import { MemberProfileView } from '@/app/t/[slug]/(community)/_components/member-profile-view'
import type { SocialLinks } from '@/lib/types'

// The GLOBAL profile (reached from the /home avatar). Teacher-agnostic, so it shows
// the member view with your posts across ALL your communities (each row links into
// its own teacher) and your platform-wide follows. The settings gear leads to
// /profile/edit (the profile form + account settings). Follow-list rows are NOT
// linked here — there's no single teacher context to resolve a member page from.
export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const [posts, follow] = await Promise.all([
    getPostsByAuthor(user.id),
    getFollowState(user.id, user.id),
  ])

  const displayName = profile?.display_name ?? user.email ?? ''
  const socialLinks = (profile?.social_links ?? {}) as SocialLinks

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          Communities
        </Link>
        <Link
          href="/profile/edit"
          aria-label="Edit profile and settings"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>

      <MemberProfileView
        targetId={user.id}
        displayName={displayName}
        avatarUrl={profile?.avatar_url ?? null}
        bio={profile?.bio ?? null}
        socialLinks={socialLinks}
        roleLabel={null}
        posts={posts.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          created_at: p.created_at,
          href: p.channel_slug
            ? `/t/${p.teacher_slug}/community/${p.channel_slug}/${p.id}`
            : null,
        }))}
        follow={follow}
        viewerId={user.id}
      />
    </div>
  )
}
