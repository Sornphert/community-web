import { notFound } from 'next/navigation'
import { getChannelBySlug, getPost } from '@/lib/posts'
import { SHOW_WEEKLY } from '@/lib/config'
import { PostDetail } from '../../../community/_components/post-detail'

export default async function WeekPostDetailPage({
  params,
}: {
  params: Promise<{ week: string; postId: string }>
}) {
  if (!SHOW_WEEKLY) {
    notFound()
  }

  const { week, postId } = await params
  const [channel, post] = await Promise.all([
    getChannelBySlug(week),
    getPost(postId),
  ])

  if (!channel || channel.section !== 'weekly' || !post) {
    notFound()
  }

  return (
    <PostDetail
      post={post}
      channelSlug={week}
      basePath="/weekly"
      backLabel={`Back to ${channel.name}`}
    />
  )
}
