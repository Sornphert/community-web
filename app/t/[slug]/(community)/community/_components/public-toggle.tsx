'use client'

import { useState, useTransition } from 'react'
import { EyeOff, Globe, Lock } from 'lucide-react'
import { setPostPublic } from '../_actions/posts'

// [Surface 2] Author-only public-consent control, rendered in the post header
// meta row on both the feed card and the detail page. Three states, hidden
// checked FIRST:
//   • hiddenFromPublic  -> inert "Hidden by admin" label (no handler). The admin
//     kill switch wins regardless of isPublic: set_post_public moves only
//     is_public and the public feed filters AND NOT hidden_from_public, so a live
//     control here would be a no-op. Author cannot toggle out of it.
//   • isPublic === false -> "Private", click makes public.
//   • isPublic === true  -> "Public",  click revokes.
export function PublicToggle({
  postId,
  isPublic,
  hiddenFromPublic,
}: {
  postId: string
  isPublic: boolean
  hiddenFromPublic: boolean
}) {
  const [pub, setPub] = useState(isPublic)
  const [failed, setFailed] = useState(false)
  const [isPending, startTransition] = useTransition()

  // is_public has a SECOND writer — the admin kill switch — so after a
  // revalidation the server prop is source of truth. Reconcile the mirrored
  // local state to it, or a concurrent admin action could leave the badge stale.
  // Done by adjusting state during render (store the previous prop) — React's
  // recommended pattern over a setState-in-effect, which this project's lint
  // forbids. (hiddenFromPublic reads straight from prop at render, so it
  // self-reconciles.)
  const [prevIsPublic, setPrevIsPublic] = useState(isPublic)
  if (isPublic !== prevIsPublic) {
    setPrevIsPublic(isPublic)
    setPub(isPublic)
  }

  // Kill switch: inert label, no onClick. Wins over is_public.
  if (hiddenFromPublic) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted">
        <EyeOff className="h-3 w-3" />
        Hidden by admin
      </span>
    )
  }

  function handleToggle(e: React.MouseEvent) {
    // Card root is a <Link>; stop the click from navigating to the post.
    e.preventDefault()
    e.stopPropagation()
    if (isPending) return

    const next = !pub
    setPub(next) // optimistic
    setFailed(false)

    startTransition(async () => {
      const result = await setPostPublic({ postId, isPublic: next })
      if ('error' in result) {
        // Revert — the badge snapping back is the primary feedback.
        setPub(!next)
        setFailed(true)
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={pub}
        aria-label={pub ? 'Make post private' : 'Make post public'}
        className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted transition-colors hover:bg-muted disabled:opacity-50"
      >
        {pub ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
        {pub ? 'Public' : 'Private'}
      </button>
      {failed && (
        <span className="text-xs text-danger">Couldn&apos;t update — try again</span>
      )}
    </span>
  )
}
