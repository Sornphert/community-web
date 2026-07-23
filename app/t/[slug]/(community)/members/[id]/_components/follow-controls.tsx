'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { UserPlus, UserCheck, X } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { createClient } from '@/lib/supabase/client'
import type { FollowUser } from '@/lib/types'

// Follow/unfollow button + follower/following counts (each opens a list modal), for
// the in-app member profile. Platform-wide follows (0024). Optimistic button + count,
// then router.refresh() to resync the lists from the server. The button is hidden on
// your OWN profile; counts always show.
//
// List rows are intentionally NOT links: a follower/followee may not be a member of
// THIS teacher, so there's no safe in-teacher profile URL for them. Phase 1 shows
// identity only.
export function FollowControls({
  targetId,
  isOwnProfile,
  initialIsFollowing,
  initialFollowers,
  initialFollowing,
  followersList,
  followingList,
}: {
  targetId: string
  isOwnProfile: boolean
  initialIsFollowing: boolean
  initialFollowers: number
  initialFollowing: number
  followersList: FollowUser[]
  followingList: FollowUser[]
}) {
  const router = useRouter()
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [followers, setFollowers] = useState(initialFollowers)
  const [pending, setPending] = useState(false)
  const [modal, setModal] = useState<null | 'followers' | 'following'>(null)

  async function toggle() {
    if (pending) return
    const next = !isFollowing
    // Optimistic: flip the button and nudge the follower count.
    setIsFollowing(next)
    setFollowers((n) => Math.max(0, n + (next ? 1 : -1)))
    setPending(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      if (next) {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetId })
        // 23505 = already following (composite PK) — idempotent success.
        if (error && error.code !== '23505') throw error
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetId)
        if (error) throw error
      }
      // Resync the lists (and true counts) from the server.
      router.refresh()
    } catch {
      // Revert on failure.
      setIsFollowing(!next)
      setFollowers((n) => Math.max(0, n + (next ? -1 : 1)))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {!isOwnProfile && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={isFollowing}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
            isFollowing
              ? 'border border-line text-fg-secondary hover:bg-muted'
              : 'bg-inverse text-inverse-fg hover:bg-inverse-hover'
          }`}
        >
          {isFollowing ? (
            <>
              <UserCheck className="h-4 w-4" />
              Following
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              Follow
            </>
          )}
        </button>
      )}

      <div className="mt-3 flex items-center gap-5 text-sm">
        <button
          type="button"
          onClick={() => setModal('followers')}
          className="rounded transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-semibold text-fg">{followers}</span>{' '}
          <span className="text-fg-muted">
            {followers === 1 ? 'follower' : 'followers'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setModal('following')}
          className="rounded transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-semibold text-fg">{initialFollowing}</span>{' '}
          <span className="text-fg-muted">following</span>
        </button>
      </div>

      {modal && (
        <FollowListModal
          title={modal === 'followers' ? 'Followers' : 'Following'}
          users={modal === 'followers' ? followersList : followingList}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

function FollowListModal({
  title,
  users,
  onClose,
}: {
  title: string
  users: FollowUser[]
  onClose: () => void
}) {
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[70vh] w-full max-w-sm flex-col rounded-2xl border border-line bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-fg-muted transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {users.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              No one yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {users.map((u) => (
                <li
                  key={u.user_id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <Avatar url={u.avatar_url} name={u.display_name} size="sm" />
                  <span className="truncate text-sm font-medium text-fg">
                    {u.display_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
