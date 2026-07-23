'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Heart, Star } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import {
  getPublicFeed,
  PUBLIC_FEED_PAGE_SIZE,
  type FeedCategory,
} from '@/lib/public-feed'
import { createClient } from '@/lib/supabase/client'
import type { PublicFeedPost } from '@/lib/types'

// [Surface 4] Homepage public feed (anon + authed). Server renders page 0 of the "All"
// feed; this component owns the CATEGORY CHIPS + "Load more", paging via getPublicFeed
// against the browser client (the RPC is anon-granted, so this works logged-out too).
// Selecting a chip refetches page 0 filtered by category server-side, so paging stays
// correct within a tab. Cards are NON-clickable by design (only the author links out).
export function PublicFeed({
  initial,
  initialHasMore,
  categories,
}: {
  initial: PublicFeedPost[]
  initialHasMore: boolean
  categories: FeedCategory[]
}) {
  const [posts, setPosts] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore)
  // null = the "All" chip.
  const [active, setActive] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Switch category: refetch page 0 with the server-side filter, replacing the list.
  function selectCategory(slug: string | null) {
    if (slug === active || isPending) return
    setActive(slug)
    startTransition(async () => {
      const next = await getPublicFeed(createClient(), 0, PUBLIC_FEED_PAGE_SIZE, {
        categorySlug: slug,
      })
      setPosts(next)
      setHasMore(next.length === PUBLIC_FEED_PAGE_SIZE)
    })
  }

  function loadMore() {
    if (isPending) return
    startTransition(async () => {
      const next = await getPublicFeed(
        createClient(),
        posts.length,
        PUBLIC_FEED_PAGE_SIZE,
        { categorySlug: active },
      )
      if (next.length === 0) {
        setHasMore(false)
        return
      }
      setPosts((prev) => [...prev, ...next])
      setHasMore(next.length === PUBLIC_FEED_PAGE_SIZE)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {categories.length > 0 && (
        <div className="-mx-1 flex flex-wrap gap-2">
          <Chip label="All" active={active === null} onClick={() => selectCategory(null)} />
          {categories.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              active={active === c.slug}
              onClick={() => selectCategory(c.slug)}
            />
          ))}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">
          {isPending ? 'Loading…' : 'Nothing here yet.'}
        </p>
      ) : (
        posts.map((post, i) => (
          <PublicFeedCard
            key={`${post.teacher_slug}-${post.created_at}-${i}`}
            post={post}
          />
        ))
      )}

      {hasMore && posts.length > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isPending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? 'border-inverse bg-inverse text-inverse-fg'
          : 'border-line text-fg-secondary hover:bg-muted'
      }`}
    >
      {label}
    </button>
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
