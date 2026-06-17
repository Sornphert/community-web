'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getLikers } from '../_actions/likes'
import type { Liker } from '@/lib/types'

// Mounted only while open (see LikeButton), so loading starts true and the
// effect just fills in the data — no synchronous setState in the effect body.
export function LikersModal({
  targetId,
  targetType,
  onClose,
}: {
  targetId: string
  targetType: 'post' | 'comment'
  onClose: () => void
}) {
  const [likers, setLikers] = useState<Liker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    getLikers({ targetType, targetId })
      .then((rows) => {
        if (active) setLikers(rows)
      })
      .catch((err) => {
        console.error('Failed to load likers:', err)
        if (active) setLikers([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [targetType, targetId])

  // Close on Escape.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-lg bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Likes</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-fg-faint hover:bg-muted hover:text-fg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-4 text-center text-sm text-fg-muted">Loading…</p>
          ) : likers.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">
              No likes yet
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {likers.map((liker) => (
                <li key={liker.user_id} className="flex items-center gap-3">
                  <Avatar
                    url={liker.avatar_url}
                    name={liker.display_name}
                    size="sm"
                  />
                  <span className="text-sm font-medium text-fg">
                    {liker.display_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
