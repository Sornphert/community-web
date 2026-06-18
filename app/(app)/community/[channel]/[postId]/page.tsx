import { notFound, redirect } from 'next/navigation'
import { getPost } from '@/lib/posts'
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

  // Collision guard: a weekly post is canonical under /weekly. When the feature
  // is on, redirect; when off, 404 (no weekly post reachable via /community).
  if (post.channel?.section === 'weekly') {
    if (SHOW_WEEKLY) {
      redirect(`/weekly/${post.channel.slug}/${post.id}`)
    }
    notFound()
  }

  return <PostDetail post={post} channelSlug={channel} />
}
