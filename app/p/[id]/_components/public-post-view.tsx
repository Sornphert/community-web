'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { ArrowLeft, Heart, Lock, MessageCircle, Star, X } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import type { PublicPost } from '@/lib/types'

// The public post detail rendered for the two NON-member audiences:
//   • 'teaser'      — anon: post text fades out, image is blurred, comments are a
//                     "log in to view N comments" wall, plus a sign-up CTA.
//   • 'member-gate' — logged-in NON-member: full post + image (it's public), but the
//                     comments are members-only, shown as a "join to view" prompt.
// (Members never reach this component — the page redirects them to the real in-app
// post with full comments + commenting.)
export function PublicPostView({
  post,
  mode,
}: {
  post: PublicPost
  mode: 'teaser' | 'member-gate'
}) {
  const teaser = mode === 'teaser'
  const [lightbox, setLightbox] = useState(false)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/home"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-secondary transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to communities
      </Link>

      <article className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-3">
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
                {post.teacher_name} · {formatRelativeTime(post.created_at)}
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

        {post.title && (
          <h1 className="mb-2 text-lg font-semibold text-fg">{post.title}</h1>
        )}

        {/* Body. Anon → clamp + fade out the tail as a paywall tease. */}
        <div className="relative">
          <p
            className={`whitespace-pre-wrap break-words text-sm text-fg-secondary ${
              teaser ? 'line-clamp-[8]' : ''
            }`}
          >
            {post.body}
          </p>
          {teaser && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
          )}
        </div>

        {post.image_url && (
          <div className="relative mt-4 overflow-hidden rounded-lg">
            {teaser ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.image_url}
                  alt=""
                  className="max-h-[28rem] w-full object-cover blur-lg"
                />
                <Link
                  href="/login"
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium text-white">
                    <Lock className="h-3.5 w-3.5" />
                    Log in to view
                  </span>
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setLightbox(true)}
                className="block w-full"
                aria-label="Open image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.image_url}
                  alt=""
                  className="max-h-[28rem] w-full cursor-zoom-in object-cover"
                />
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {post.like_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {post.comment_count}
          </span>
        </div>
      </article>

      {/* Comments — members-only. Anon gets a sign-up wall; logged-in non-member gets
          a join prompt. Neither receives any real comment text. */}
      <div className="mt-4 rounded-xl border border-line bg-surface p-5 text-center">
        <MessageCircle className="mx-auto h-6 w-6 text-fg-muted" />
        {teaser ? (
          <>
            <p className="mt-2 text-sm font-medium text-fg">
              Log in to read the full post and join the discussion
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Link
                href="/login"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
              >
                Log in
              </Link>
              <Link
                href="/login?mode=signup"
                className="rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
              >
                Sign up
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium text-fg">
              Comments are for members
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Join {post.teacher_name} to see the discussion.
            </p>
            <Link
              href="/home"
              className="mt-4 inline-block rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
            >
              Explore communities
            </Link>
          </>
        )}
      </div>

      {lightbox &&
        post.image_url &&
        createPortal(
          <ImageLightbox src={post.image_url} onClose={() => setLightbox(false)} />,
          document.body,
        )}
    </div>
  )
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  )
}
