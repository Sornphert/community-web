'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { ImageLightbox } from '@/app/(app)/_components/image-lightbox'
import { MentionText } from '@/app/(app)/_components/mention-text'
import {
  MentionTextarea,
  type MentionMember,
} from '@/app/(app)/_components/mention-textarea'
import { formatRelativeTime } from '@/lib/format'
import type { CommentWithRelations } from '@/lib/types'
import { updateComment, deleteComment } from '../_actions/comments'
import { LikeButton } from './like-button'

// One comment row (MT). Body or inline editor, images, like button, and — for the
// author or an admin OF THIS TEACHER (comment.can_edit) — edit + delete. Edit is
// author-only (the server action re-checks); delete is author-or-admin.
export function CommentItem({
  comment,
  slug,
  members = [],
  canMentionAll = false,
}: {
  comment: CommentWithRelations
  slug: string
  members?: MentionMember[]
  canMentionAll?: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveEdit() {
    if (!draft.trim() || isPending) return
    setError(null)
    startTransition(async () => {
      const result = await updateComment({ commentId: comment.id, body: draft })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function confirmDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteComment({ commentId: comment.id })
      if ('error' in result) {
        setError(result.error)
        setConfirming(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex gap-3">
      <Avatar
        url={comment.author.avatar_url}
        name={comment.author.display_name}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">
            {comment.author.display_name}
          </span>
          <span className="text-sm text-fg-muted">
            {formatRelativeTime(comment.created_at)}
          </span>
          {comment.edited_at && (
            <span className="text-xs text-fg-faint">(edited)</span>
          )}
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              members={members}
              canMentionAll={canMentionAll}
              rows={3}
              className="w-full rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending || !draft.trim()}
                className="rounded-md bg-inverse px-3 py-1.5 text-xs font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft(comment.body)
                  setError(null)
                }}
                disabled={isPending}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-strong disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {comment.body && (
              <MentionText
                body={comment.body}
                slug={slug}
                className="block whitespace-pre-wrap text-sm text-fg-secondary"
              />
            )}
            {comment.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {comment.images.map((img) => (
                  <ImageLightbox
                    key={img.id}
                    src={img.url}
                    className="max-h-60 rounded-md border border-line object-cover"
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-1 flex items-center gap-3">
          <LikeButton
            targetType="comment"
            targetId={comment.id}
            initialLikesCount={comment.likes_count}
            initialLikedByCurrentUser={comment.liked_by_current_user}
          />

          {comment.can_edit && !editing && !confirming && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit comment"
                className="flex h-7 w-7 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-muted hover:text-fg-secondary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label="Delete comment"
                className="flex h-7 w-7 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-danger-subtle hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {confirming && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-fg-muted">Delete?</span>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending}
                className="rounded-md bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-danger-hover disabled:opacity-50"
              >
                {isPending ? 'Deleting…' : 'Yes'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-fg-secondary hover:bg-strong disabled:opacity-50"
              >
                No
              </button>
            </div>
          )}
        </div>

        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
