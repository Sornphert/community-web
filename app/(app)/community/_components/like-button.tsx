'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { toggleLike } from '../_actions/likes'
import { LikersModal } from './likers-modal'

export function LikeButton({
  targetId,
  targetType,
  initialLikesCount,
  initialLikedByCurrentUser,
}: {
  targetId: string
  targetType: 'post' | 'comment'
  initialLikesCount: number
  initialLikedByCurrentUser: boolean
}) {
  const [liked, setLiked] = useState(initialLikedByCurrentUser)
  const [count, setCount] = useState(initialLikesCount)
  const [modalOpen, setModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleToggle(e: React.MouseEvent) {
    // The feed card wraps everything in a <Link>; stop the click from
    // navigating to the post.
    e.preventDefault()
    e.stopPropagation()
    if (isPending) return

    const nextLiked = !liked
    // Optimistic update.
    setLiked(nextLiked)
    setCount((c) => c + (nextLiked ? 1 : -1))

    startTransition(async () => {
      const result = await toggleLike({ targetType, targetId })
      if ('error' in result) {
        // Revert on failure.
        console.error('Failed to toggle like:', result.error)
        setLiked(!nextLiked)
        setCount((c) => c + (nextLiked ? -1 : 1))
      }
    })
  }

  function handleOpenModal(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setModalOpen(true)
  }

  function handleCloseModal() {
    setModalOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={liked}
        aria-label={liked ? 'Unlike' : 'Like'}
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50"
      >
        <Heart
          className={`h-4 w-4 ${liked ? 'fill-red-500 text-red-500' : ''}`}
        />
      </button>
      <button
        type="button"
        onClick={handleOpenModal}
        disabled={count === 0}
        className="min-w-4 text-left text-sm text-zinc-500 hover:underline disabled:cursor-default disabled:no-underline"
      >
        {count}
      </button>

      {modalOpen && (
        <LikersModal
          targetId={targetId}
          targetType={targetType}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
