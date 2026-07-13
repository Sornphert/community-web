import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllMembers, getPost } from '@/lib/posts'
import { SHOW_WEEKLY } from '@/lib/config'
import { PostDetail } from '../../_components/post-detail'

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ channel: string; postId: string }>
}) {
  const { channel, postId } = await params
  const post = await getPost(postId)

  if (!post) {
    notFound()
  }

  // Mention-picker data: the roster (everyone can mention) + admin flag for @all.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const [members, { data: profile }] = await Promise.all([
    getAllMembers(),
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user?.id ?? '')
      .maybeSingle(),
  ])
  const canMentionAll = profile?.is_admin === true

  // Collision guard: a weekly post is canonical under /weekly. When the feature
  // is on, redirect; when off, 404 (no weekly post reachable via /community).
  if (post.channel?.section === 'weekly') {
    if (SHOW_WEEKLY) {
      redirect(`/weekly/${post.channel.slug}/${post.id}`)
    }
    notFound()
  }

  return (
    <PostDetail
      post={post}
      channelSlug={channel}
      members={members.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
      }))}
      canMentionAll={canMentionAll}
    />
  )
}
