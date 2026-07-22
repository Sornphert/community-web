'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Heart, Star } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import { getPublicFeed, PUBLIC_FEED_PAGE_SIZE } from '@/lib/public-feed'
import { createClient } from '@/lib/supabase/client'
import type { PublicFeedPost } from '@/lib/types'

// [Surface 4] Homepage public feed (anon + authed). Server renders page 0; this
// component owns "Load more", paging via the same getPublicFeed against the browser
// client (the RPC is anon-granted, so this works logged-out too). Cards are NON-
// clickable by design — the feed RPC returns no post id, and post detail is auth-gated.
export function PublicFeed({
  initial,
  initialHasMore,
}: {
  initial: PublicFeedPost[]
  initialHasMore: boolean
}) {
  const [posts, setPosts] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function loadMore() {
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const next = await getPublicFeed(createClient(), posts.length)
      if (next.length === 0) {
        // Either genuinely exhausted or a transient RPC error (getPublicFeed
        // swallows errors → []). Stop offering more; a reload retries page 0.
        setHasMore(false)
        return
      }
      setPosts((prev) => [...prev, ...next])
      setHasMore(next.length === PUBLIC_FEED_PAGE_SIZE)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post, i) => (
        <PublicFeedCard key={`${post.teacher_slug}-${post.created_at}-${i}`} post={post} />
      ))}

      {hasMore && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isPending ? 'Loading…' : 'Load more'}
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </div>
  )
}

function PublicFeedCard({ post }: { post: PublicFeedPost }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-3">
        {/* Author → public profile (/u/[teacher]/[id]). The card body stays
            non-clickable (post detail is auth-gated); only the author links out. */}
        <Link
          href={`/u/${post.teacher_slug}/${post.author_id}`}
          className="flex min-w-0 items-center gap-3 rounded-md transition-opacity hover:opacity-80"
        >
          <Avatar url={post.avatar_url} name={post.display_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">
              {post.display_name}
            </p>
            <p className="truncate text-xs text-fg-muted">
              {formatRelativeTime(post.created_at)}
            </p>
          </div>
        </Link>
        {post.featured && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-fg-secondary">
            <Star className="h-3 w-3 fill-current" />
            Featured
          </span>
        )}
      </div>

      <p className="whitespace-pre-wrap break-words text-sm text-fg-secondary line-clamp-6">
        {post.body}
      </p>

      {post.image_url && (
        // Remote Supabase Storage image — plain <img> per project convention
        // (next/image `fill` needs an explicit sized box; a feed image's aspect
        // ratio is unknown, so we cap height and object-cover instead).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image_url}
          alt=""
          className="mt-3 max-h-96 w-full rounded-lg object-cover"
        />
      )}

      <div className="mt-3 flex items-center gap-1 text-xs text-fg-muted">
        <Heart className="h-3.5 w-3.5" />
        {post.like_count}
      </div>
    </article>
  )
}
