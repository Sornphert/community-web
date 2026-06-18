import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getChannelBySlug } from '@/lib/posts'
import { SHOW_WEEKLY } from '@/lib/config'
import { NewPostForm } from '../../../community/_components/new-post-form'

export default async function NewWeekPostPage({
  params,
}: {
  params: Promise<{ week: string }>
}) {
  if (!SHOW_WEEKLY) {
    notFound()
  }

  const { week: slug } = await params
  const channel = await getChannelBySlug(slug)
  if (!channel || channel.section !== 'weekly') {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = profile?.is_admin === true

  // Weekly channels are always admin_only — non-admins go back to the week feed.
  // RLS (posts_insert_channel_permitted) is the real enforcement.
  if (!isAdmin) {
    redirect(`/weekly/${channel.slug}`)
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`/weekly/${channel.slug}`}
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
        isAdmin={isAdmin}
        basePath="/weekly"
      />
    </div>
  )
}
