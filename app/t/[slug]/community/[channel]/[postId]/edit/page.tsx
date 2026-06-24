import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPost } from '@/lib/posts'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getPlayerUrl, getThumbnailUrl } from '@/lib/bunny'
import { NewPostForm, type EditPost } from '../../../_components/new-post-form'

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ slug: string; channel: string; postId: string }>
}) {
  const { slug, channel, postId } = await params
  const basePath = `/t/${slug}/community`

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  const post = await getPost(postId, teacher.id)
  if (!post) {
    notFound()
  }

  // Author OR admin only. can_edit is computed by getPost from the viewer's
  // identity; the updatePost action re-checks server-side and RLS is the third
  // layer.
  if (!post.can_edit) {
    redirect(`${basePath}/${channel}/${postId}`)
  }

  // Video controls are admin-only (matches create). A non-admin author sees the
  // existing video read-only. [MT] admin is per-teacher via is_teacher_admin.
  const isAdmin = await isTeacherAdmin(teacher.id)

  const initialPost: EditPost = {
    id: post.id,
    title: post.title ?? '',
    body: post.body,
    images: post.images.map((img) => ({ id: img.id, url: img.url })),
    attachments: post.attachments.map((a) => ({
      id: a.id,
      url: a.url,
      file_name: a.file_name,
      file_size: a.file_size,
    })),
    video: post.video?.video_id
      ? {
          status: post.video.video_status,
          playerUrl: getPlayerUrl(post.video.video_id),
          posterUrl:
            post.video.video_thumbnail_url ??
            getThumbnailUrl(post.video.video_id),
        }
      : null,
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`${basePath}/${channel}/${postId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to post
      </Link>

      <h1 className="mb-4 text-xl font-semibold text-fg">Edit post</h1>

      <NewPostForm
        channelId={post.channel_id ?? ''}
        channelSlug={channel}
        teacherId={teacher.id}
        isAdmin={isAdmin}
        initialPost={initialPost}
        basePath={basePath}
      />
    </div>
  )
}
