import { notFound } from 'next/navigation'
import { getAllMembers, getPost } from '@/lib/posts'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
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

  // Mention picker data: the teacher's roster + whether the viewer may @all.
  const [members, canMentionAll] = await Promise.all([
    getAllMembers(teacher.id),
    isTeacherAdmin(teacher.id),
  ])

  // Leak-guard (intentional — do not remove): the Weekly vertical was removed, but
  // the channels.section column persists. A post whose channel is a stray
  // section='weekly' row must not render under /community, so 404 it.
  if (post.channel?.section === 'weekly') {
    notFound()
  }

  return (
    <PostDetail
      post={post}
      channelSlug={channel}
      slug={slug}
      teacherId={teacher.id}
      members={members.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
      }))}
      canMentionAll={canMentionAll}
      basePath={basePath}
    />
  )
}
