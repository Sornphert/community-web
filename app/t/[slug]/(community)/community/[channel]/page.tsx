import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { MessageSquare, Plus } from 'lucide-react'
import { ScrollToTop } from '@/app/_components/scroll-to-top'
import {
  getAllMembers,
  getChannelBySlug,
  getChannels,
  getPost,
  getPostsForChannel,
  CHANNEL_PAGE_SIZE,
} from '@/lib/posts'
import { getTeacherBySlug } from '@/lib/teachers'
import { getUnreadChannelIds } from '@/lib/reads'
import { isTeacherAdmin } from '@/lib/auth'
import { PostCard } from '../_components/post-card'
import { PostDetail } from '../_components/post-detail'
import { ChannelTabs } from '../_components/channel-tabs'
import { MarkChannelRead } from '../_components/mark-channel-read'
import { SearchBox } from '../_components/search-box'
import { HERO_URL, SHOW_HERO } from '@/lib/config'

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; channel: string }>
  searchParams: Promise<{ limit?: string }>
}) {
  const { slug, channel: channelSlug } = await params
  const { limit: limitParam } = await searchParams
  // cache()-deduped with the layout's resolution. Defensive 404 if it's gone.
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }
  const basePath = `/t/${slug}/community`

  const channel = await getChannelBySlug(channelSlug, teacher.id)

  // Not a channel slug → treat the value as a legacy post id (old /community/[id]
  // links). Redirect to the nested URL if it has a channel, else render as-is.
  if (!channel) {
    const post = await getPost(channelSlug, teacher.id)
    if (!post) {
      notFound()
    }
    if (post.channel) {
      redirect(`${basePath}/${post.channel.slug}/${post.id}`)
    }
    const [members, canMentionAll] = await Promise.all([
      getAllMembers(teacher.id),
      isTeacherAdmin(teacher.id),
    ])
    return (
      <PostDetail
        post={post}
        channelSlug="announcements"
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

  // Leak-guard (intentional — do not remove): the Weekly vertical (its routes and
  // fetchers) was removed, but the channels.section column persists. A stray row
  // with section='weekly' must never render inside /community, so 404 it.
  if (channel.section === 'weekly') {
    notFound()
  }

  const isAdmin = await isTeacherAdmin(teacher.id)

  // Paginated feed: ?limit grows on each "Load more" (default one page). Fetch one
  // extra row to know whether another page exists, then trim.
  const limit = Math.max(
    CHANNEL_PAGE_SIZE,
    Math.min(500, Number(limitParam) || CHANNEL_PAGE_SIZE),
  )
  const [channels, page, unreadChannelIds] = await Promise.all([
    getChannels(teacher.id),
    getPostsForChannel(channel.id, teacher.id, { limit: limit + 1 }),
    getUnreadChannelIds(teacher.id),
  ])
  const hasMore = page.length > limit
  const posts = hasMore ? page.slice(0, limit) : page

  const canPost = channel.post_permission === 'all' || isAdmin

  return (
    <>
      {/* Mark this channel read (clears its unread dot) on view. */}
      <MarkChannelRead channelId={channel.id} />
      <ChannelTabs
        channels={channels}
        basePath={basePath}
        unread={unreadChannelIds.filter((id) => id !== channel.id)}
      />

      {/* [0021] Per-teacher banner. HERO_URL is a single GLOBAL env var, so before
          this every MT tenant rendered the same image. teacher.hero_url wins; the env
          var remains the fallback so single-tenant deployments are unchanged. */}
      {channel.slug === 'announcements' && SHOW_HERO && (
        <div className="relative -mx-4 mb-6 aspect-video w-screen overflow-hidden md:mx-auto md:w-full md:max-w-3xl md:rounded-lg">
          <Image
            src={teacher.hero_url ?? HERO_URL}
            alt={teacher.name}
            fill
            className="object-cover object-[center_70%]"
            sizes="(min-width: 768px) 768px, 100vw"
            priority
          />
        </div>
      )}

      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4">
          <SearchBox basePath={basePath} />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-fg">
              {channel.name}
            </h1>
            {channel.description && (
              <p className="mt-0.5 text-sm text-fg-muted">
                {channel.description}
              </p>
            )}
          </div>
          {canPost && (
            <Link
              href={`${basePath}/${channel.slug}/new`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-inverse px-3 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
            >
              <Plus className="h-4 w-4" />
              New Post
            </Link>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-fg-muted" />
            <p className="mt-3 text-sm font-medium text-fg">No posts yet</p>
            <p className="mt-1 text-sm text-fg-muted">
              {canPost
                ? 'Be the first to post in this channel.'
                : 'Check back soon — new posts will show up here.'}
            </p>
            {canPost && (
              <Link
                href={`${basePath}/${channel.slug}/new`}
                className="mt-4 inline-flex items-center gap-1 rounded-md bg-inverse px-3 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
              >
                <Plus className="h-4 w-4" />
                Create the first post
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                channelSlug={channel.slug}
                basePath={basePath}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-6 flex justify-center">
            <Link
              href={`${basePath}/${channel.slug}?limit=${limit + CHANNEL_PAGE_SIZE}`}
              scroll={false}
              className="rounded-full border border-line px-4 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-muted"
            >
              Load more
            </Link>
          </div>
        )}
      </div>

      {/* Lifted above the mobile tab bar; back to bottom-6 on desktop. */}
      <ScrollToTop bottomClassName="bottom-24 md:bottom-6" />
    </>
  )
}
