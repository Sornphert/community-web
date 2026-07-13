'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Star } from 'lucide-react'
import { setPostFeatured, setPostHidden } from '../_actions/posts'

// [Surface 3] Admin-only moderation controls, gated at the call site on post.viewerIsAdmin
// (per-viewer-per-teacher, from lib/posts.ts). Renders beside PostActions on both the feed
// card and the detail page. Two independent flags, each with a SECOND writer (the author's
// PublicToggle flips is_public; these flip hidden_from_public / featured), so both mirror
// the server prop via the store-previous-prop pattern (public-toggle.tsx) rather than
// setState-in-effect, which this project's lint forbids.
//   • Hide    -> set_post_hidden(postId, bool). Both directions always available.
//   • Feature -> set_post_featured(postId, bool). Featuring is only valid while the post is
//     currently public AND not hidden (mirrors the RPC's not_public rejection); otherwise
//     the Feature button is disabled + tooltip. Unfeature is always allowed.
// featured + hidden is a valid DORMANT state (hide does NOT auto-unfeature) — warn only.
export function AdminPostControls({
  postId,
  isPublic,
  hiddenFromPublic,
  featured,
}: {
  postId: string
  isPublic: boolean
  hiddenFromPublic: boolean
  featured: boolean
}) {
  const [hidden, setHidden] = useState(hiddenFromPublic)
  const [feat, setFeat] = useState(featured)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reconcile mirrored local state to the server prop after a revalidation — each flag has
  // a second writer, so the prop is source of truth. Store-previous-prop (adjust during
  // render) is the project's approved alternative to setState-in-effect.
  const [prevHidden, setPrevHidden] = useState(hiddenFromPublic)
  if (hiddenFromPublic !== prevHidden) {
    setPrevHidden(hiddenFromPublic)
    setHidden(hiddenFromPublic)
  }
  const [prevFeatured, setPrevFeatured] = useState(featured)
  if (featured !== prevFeatured) {
    setPrevFeatured(featured)
    setFeat(featured)
  }

  // Card root is a <Link>; stop the click from navigating to the post.
  function stop(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  // Featuring is only valid while the post is publicly visible — mirror the RPC predicate
  // (is_public AND NOT hidden_from_public) so we never offer an action it would reject.
  // Uses the optimistic `hidden` so hiding immediately locks the Feature affordance.
  const canFeature = isPublic && !hidden

  function handleHide(e: React.MouseEvent) {
    stop(e)
    if (isPending) return
    const next = !hidden
    setHidden(next) // optimistic
    setError(null)
    startTransition(async () => {
      const result = await setPostHidden({ postId, hidden: next })
      if ('error' in result) {
        setHidden(!next)
        setError('Couldn’t update — try again')
      }
    })
  }

  function handleFeature(e: React.MouseEvent) {
    stop(e)
    if (isPending) return
    const next = !feat
    setFeat(next) // optimistic
    setError(null)
    startTransition(async () => {
      const result = await setPostFeatured({ postId, featured: next })
      if ('error' in result) {
        setFeat(!next)
        setError(
          result.error === 'not_public'
            ? 'This post is no longer public — refresh.'
            : 'Couldn’t update — try again',
        )
      }
    })
  }

  // Unfeature (feat === true) is always enabled; featuring is gated on canFeature.
  const featureDisabled = isPending || (!feat && !canFeature)

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleHide}
        disabled={isPending}
        aria-pressed={hidden}
        aria-label={hidden ? 'Unhide post' : 'Hide post from public'}
        className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted transition-colors hover:bg-muted disabled:opacity-50"
      >
        {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {hidden ? 'Unhide' : 'Hide'}
      </button>

      <button
        type="button"
        onClick={handleFeature}
        disabled={featureDisabled}
        aria-pressed={feat}
        aria-label={feat ? 'Unfeature post' : 'Feature post'}
        title={
          !feat && !canFeature
            ? 'Only public, non-hidden posts can be featured'
            : undefined
        }
        className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted transition-colors hover:bg-muted disabled:opacity-50"
      >
        <Star className={feat ? 'h-3 w-3 fill-current' : 'h-3 w-3'} />
        {feat ? 'Unfeature' : 'Feature'}
      </button>

      {feat && hidden && (
        <span className="text-xs text-fg-muted">
          Featured — hidden from public feed
        </span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
