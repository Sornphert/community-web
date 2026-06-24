import { notFound, redirect } from 'next/navigation'
import { getPost } from '@/lib/posts'
import { getTeacherBySlug } from '@/lib/teachers'
import { SHOW_WEEKLY } from '@/lib/config'
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

  // Collision guard: a weekly post is canonical under /weekly. When the feature
  // is on, redirect; when off, 404 (no weekly post reachable via /community).
  if (post.channel?.section === 'weekly') {
    if (SHOW_WEEKLY) {
      redirect(`/t/${slug}/weekly/${post.channel.slug}/${post.id}`)
    }
    notFound()
  }

  return <PostDetail post={post} channelSlug={channel} basePath={basePath} />
}
