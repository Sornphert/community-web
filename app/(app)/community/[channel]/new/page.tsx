import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getChannelBySlug } from '@/lib/posts'
import { NewPostForm } from '../../_components/new-post-form'

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ channel: string }>
}) {
  const { channel: slug } = await params
  const channel = await getChannelBySlug(slug)
  if (!channel) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Server-side guard for admin-only channels (RLS is the real enforcement, but
  // this stops a non-admin from ever reaching the form). Mirrors the hidden
  // "New Post" button on the channel feed.
  if (channel.post_permission === 'admin_only') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.is_admin) {
      redirect(`/community/${channel.slug}`)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`/community/${channel.slug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {channel.name}
      </Link>

      <h1 className="mb-4 text-xl font-semibold text-zinc-900">
        New Post in {channel.name}
      </h1>

      <NewPostForm channelId={channel.id} channelSlug={channel.slug} />
    </div>
  )
}
