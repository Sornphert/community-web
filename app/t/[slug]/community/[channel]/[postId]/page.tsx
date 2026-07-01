import { notFound } from 'next/navigation'
import { getPost } from '@/lib/posts'
import { getTeacherBySlug } from '@/lib/teachers'
import { PostDetail } from '../../_components/post-detail'

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string; channel: string; postId: string }>
}) {
  const { slug, channel, postId } = await params
  const basePath = `/t/${slug}/community`
  // cache()-deduped with the layout's resolution. Defensive 404 if it's gone.
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }
  const post = await getPost(postId, teacher.id)

  if (!post) {
    notFound()
  }

  // Collision guard: weekly posts are not reachable via /community — 404.
  if (post.channel?.section === 'weekly') {
    notFound()
  }

  return <PostDetail post={post} channelSlug={channel} basePath={basePath} />
}
