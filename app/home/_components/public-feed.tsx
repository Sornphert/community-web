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
  loggedOut = false,
}: {
  initial: PublicFeedPost[]
  initialHasMore: boolean
  categories: FeedCategory[]
  loggedOut?: boolean
}) {
  const [posts, setPosts] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore)
  // null = the "All" chip.
  const [active, setActive] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Distinct from isPending (which also covers "Load more"): true only while a chip
  // switch is refetching, so we show skeleton cards in place of the swapped-out list.
  const [switching, setSwitching] = useState(false)

  // Switch category: refetch page 0 with the server-side filter, replacing the list.
  function selectCategory(slug: string | null) {
    if (slug === active || isPending) return
    setActive(slug)
    setSwitching(true)
    startTransition(async () => {
      const next = await getPublicFeed(createClient(), 0, PUBLIC_FEED_PAGE_SIZE, {
        categorySlug: slug,
      })
      setPosts(next)
      setHasMore(next.length === PUBLIC_FEED_PAGE_SIZE)
      setSwitching(false)
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

      {switching ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : posts.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">
          Nothing here yet.
        </p>
      ) : (
        posts.map((post, i) => (
          <PublicFeedCard
            key={`${post.teacher_slug}-${post.created_at}-${i}`}
            post={post}
            loggedOut={loggedOut}
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
      className={`rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? 'border-inverse bg-inverse text-inverse-fg'
          : 'border-line text-fg-secondary hover:bg-muted'
      }`}
    >
      {label}
    </button>
  )
}

// Skeleton placeholder shown while a category switch is loading.
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

function PublicFeedCard({
  post,
  loggedOut,
}: {
  post: PublicFeedPost
  loggedOut: boolean
}) {
  return (
    // Stretched-link card: the overlay <Link> (z-10) makes the WHOLE card open the
    // post; the profile link is lifted above it (z-20) so it opens the profile instead.
    // Non-interactive content (body/image) sits below the overlay, so a click there
    // opens the post too.
    // `isolate` confines the stretched-link z-10/z-20 to THIS card, so they don't
    // leak up and paint over the sticky page header (which sits at z-10 above main).
    <article className="relative isolate rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <Link
        href={`/p/${post.post_id}`}
        aria-label={`Open post by ${post.display_name}`}
        className="absolute inset-0 z-10 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="mb-2 flex items-center gap-3">
        <Link
          href={`/u/${post.teacher_slug}/${post.author_id}`}
          className="relative z-20 flex min-w-0 items-center gap-3 rounded-md transition-opacity hover:opacity-80"
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

      <p
        className={`whitespace-pre-wrap break-words text-sm text-fg-secondary ${
          loggedOut ? 'line-clamp-3' : 'line-clamp-6'
        }`}
      >
        {post.body}
      </p>
      {loggedOut && (
        <span className="mt-1 inline-block text-sm font-semibold text-fg underline decoration-1 underline-offset-2">
          Read more →
        </span>
      )}

      {post.image_url && (
        <div className="relative mt-3 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image_url}
            alt=""
            className={`max-h-96 w-full object-cover ${
              loggedOut ? 'blur-md' : ''
            }`}
          />
          {loggedOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white">
                Log in to view
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 text-xs text-fg-muted">
        <Heart className="h-3.5 w-3.5" />
        {post.like_count}
      </div>
    </article>
  )
}
