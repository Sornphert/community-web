import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  getChannelBySlug,
  getPostsForChannel,
  getWeekGroup,
} from '@/lib/posts'
import { SHOW_WEEKLY } from '@/lib/config'
import { PostCard } from '../../community/_components/post-card'

export default async function WeekPage({
  params,
}: {
  params: Promise<{ week: string }>
}) {
  if (!SHOW_WEEKLY) {
    notFound()
  }

  const { week: slug } = await params
  const channel = await getChannelBySlug(slug)
  // The weekly view renders ONLY weekly channels (collision guard counterpart).
  if (!channel || channel.section !== 'weekly') {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user?.id ?? '')
    .maybeSingle()
  const isAdmin = profile?.is_admin === true

  // Posts newest-first. Per the weekly posting convention, post each week in
  // chronological order (Friday's question, then Monday's answer) — created_at
  // DESC then puts Monday on top. Do not backfill a week out of order.
  // The month is fetched in parallel for the click-in back-link.
  const [posts, group] = await Promise.all([
    getPostsForChannel(channel.id),
    channel.group_id ? getWeekGroup(channel.group_id) : Promise.resolve(null),
  ])

  // Back-link walks up to the week's month; fall back to the hub if (defensively)
  // the month is missing.
  const backHref = group ? `/weekly/m/${group.id}` : '/weekly'
  const backLabel = group ? group.name : 'Johnson Weekly 市场报告'

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg">{channel.name}</h1>
        {isAdmin && (
          <Link
            href={`/weekly/${channel.slug}/new`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-inverse px-3 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
          >
            <Plus className="h-4 w-4" />
            New Post
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No posts yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              channelSlug={channel.slug}
              basePath="/weekly"
            />
          ))}
        </div>
      )}
    </div>
  )
}
