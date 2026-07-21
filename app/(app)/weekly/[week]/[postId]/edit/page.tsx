import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getChannelBySlug, getPost } from '@/lib/posts'
import { SHOW_WEEKLY } from '@/lib/config'
import { getPlayerUrl, getThumbnailUrl } from '@/lib/bunny'
import {
  NewPostForm,
  type EditPost,
} from '../../../../community/_components/new-post-form'

export default async function EditWeekPostPage({
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

  // Author OR admin only. can_edit is computed by getPost; updatePost re-checks
  // server-side and RLS is the third layer.
  if (!post.can_edit) {
    redirect(`/weekly/${week}/${postId}`)
  }

  // Video controls are admin-only (matches create).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user!.id)
    .maybeSingle()
  const isAdmin = profile?.is_admin === true

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
    videos: post.videos
      .filter((v) => v.video_id)
      .map((v) => ({
        id: v.id,
        status: v.video_status,
        playerUrl: getPlayerUrl(v.video_id!),
        posterUrl: v.video_thumbnail_url ?? getThumbnailUrl(v.video_id!),
      })),
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`/weekly/${week}/${postId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to post
      </Link>

      <h1 className="mb-4 text-xl font-semibold text-fg">Edit post</h1>

      <NewPostForm
        channelId={post.channel_id ?? ''}
        channelSlug={week}
        isAdmin={isAdmin}
        initialPost={initialPost}
        basePath="/weekly"
      />
    </div>
  )
}
