'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { deletePost } from '../_actions/posts'

// Edit + delete affordances for a post, shown only to the author or an admin.
// On the feed card these live inside the card <Link>, so every handler calls
// preventDefault() + stopPropagation() to avoid triggering card navigation.
// After delete: the card refreshes in place; the detail view returns to the feed.
export function PostActions({
  postId,
  channelSlug,
  variant,
}: {
  postId: string
  channelSlug: string
  variant: 'card' | 'detail'
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function stop(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleEdit(e: React.MouseEvent) {
    stop(e)
    router.push(`/community/${channelSlug}/${postId}/edit`)
  }

  function handleConfirm(e: React.MouseEvent) {
    stop(e)
    setError(null)
    startTransition(async () => {
      const result = await deletePost({ postId })
      if ('error' in result) {
        setError(result.error)
        setConfirming(false)
        return
      }
      if (variant === 'detail') {
        router.push(`/community/${channelSlug}`)
      } else {
        router.refresh()
      }
    })
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Delete?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? 'Deleting…' : 'Yes'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            setConfirming(false)
          }}
          disabled={isPending}
          className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
        >
          No
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleEdit}
        aria-label="Edit post"
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          stop(e)
          setConfirming(true)
        }}
        aria-label="Delete post"
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
