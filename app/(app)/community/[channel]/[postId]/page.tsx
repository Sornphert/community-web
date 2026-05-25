import { notFound } from 'next/navigation'
import { getPost } from '@/lib/posts'
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

  return <PostDetail post={post} channelSlug={channel} />
}
