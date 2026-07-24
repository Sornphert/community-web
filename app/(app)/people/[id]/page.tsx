import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPostsByAuthor } from '@/lib/posts'
import { getUserCard, getFollowState } from '@/lib/follows'
import { MemberProfileView } from '@/app/t/[slug]/(community)/_components/member-profile-view'

// The UNIVERSAL user profile — follow anyone from anywhere, regardless of shared
// community. Global identity (name/avatar/bio/socials) comes from the cross-tenant
// user_card RPC (0025); posts stay membership-gated, so you only see this person's
// posts in communities you both belong to. Follow-list rows everywhere point here.
export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const card = await getUserCard(id)
  if (!card) {
    notFound()
  }

  const [posts, follow] = await Promise.all([
    getPostsByAuthor(id),
    getFollowState(id, user.id),
  ])

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/home"
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <MemberProfileView
        targetId={card.id}
        displayName={card.display_name}
        avatarUrl={card.avatar_url}
        bio={card.bio}
        socialLinks={card.social_links}
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
