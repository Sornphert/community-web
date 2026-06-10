import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  getChannelBySlug,
  getChannels,
  getPost,
  getPostsForChannel,
} from '@/lib/posts'
import { PostCard } from '../_components/post-card'
import { PostDetail } from '../_components/post-detail'
import { ChannelTabs } from '../_components/channel-tabs'
import { APP_NAME, HERO_URL, SHOW_HERO } from '@/lib/config'

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>
}) {
  const { channel: slug } = await params
  const channel = await getChannelBySlug(slug)

  // Not a channel slug → treat the value as a legacy post id (old /community/[id]
  // links). Redirect to the nested URL if it has a channel, else render as-is.
  if (!channel) {
    const post = await getPost(slug)
    if (!post) {
      notFound()
    }
    if (post.channel) {
      redirect(`/community/${post.channel.slug}/${post.id}`)
    }
    return <PostDetail post={post} channelSlug="announcements" />
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

  const [channels, posts] = await Promise.all([
    getChannels(),
    getPostsForChannel(channel.id),
  ])

  const canPost = channel.post_permission === 'all' || isAdmin

  return (
    <>
      <ChannelTabs channels={channels} />

      {channel.slug === 'announcements' && SHOW_HERO && (
        <div className="relative -mx-4 mb-6 aspect-video w-screen overflow-hidden md:mx-auto md:w-full md:max-w-3xl md:rounded-lg">
          <Image
            src={HERO_URL}
            alt={APP_NAME}
            fill
            className="object-cover object-[center_70%]"
            sizes="(min-width: 768px) 768px, 100vw"
            priority
          />
        </div>
      )}

      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {channel.name}
            </h1>
            {channel.description && (
              <p className="mt-0.5 text-sm text-zinc-500">
                {channel.description}
              </p>
            )}
          </div>
          {canPost && (
            <Link
              href={`/community/${channel.slug}/new`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              <Plus className="h-4 w-4" />
              New Post
            </Link>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <p className="text-zinc-500">No posts yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} channelSlug={channel.slug} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
