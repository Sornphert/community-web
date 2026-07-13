import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getAllMembers, getChannelBySlug } from '@/lib/posts'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { NewPostForm } from '../../_components/new-post-form'

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ slug: string; channel: string }>
}) {
  const { slug, channel: channelSlug } = await params
  const basePath = `/t/${slug}/community`

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  const channel = await getChannelBySlug(channelSlug, teacher.id)
  if (!channel) {
    notFound()
  }

  // Leak-guard (intentional — do not remove): the Weekly vertical was removed, but
  // the channels.section column persists. Composing a post under a stray
  // section='weekly' channel must not be possible via /community, so 404 it.
  if (channel.section === 'weekly') {
    notFound()
  }

  // Admin status for THIS teacher: both guards admin-only channels (below) and
  // gates the optional video upload in the composer (admin-only, regardless of
  // the channel's post_permission). RLS is the real enforcement in both cases.
  const isAdmin = await isTeacherAdmin(teacher.id)

  // Server-side guard for admin-only channels (mirrors the hidden "New Post"
  // button on the channel feed).
  if (channel.post_permission === 'admin_only' && !isAdmin) {
    redirect(`${basePath}/${channel.slug}`)
  }

  const members = await getAllMembers(teacher.id)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`${basePath}/${channel.slug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {channel.name}
      </Link>

      <h1 className="mb-4 text-xl font-semibold text-fg">
        New Post in {channel.name}
      </h1>

      <NewPostForm
        channelId={channel.id}
        channelSlug={channel.slug}
        teacherId={teacher.id}
        teacherName={teacher.name}
        isAdmin={isAdmin}
        members={members.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          avatar_url: m.avatar_url,
        }))}
        canMentionAll={isAdmin}
        basePath={basePath}
      />
    </div>
  )
}
