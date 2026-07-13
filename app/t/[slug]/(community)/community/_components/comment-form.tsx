'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MentionTextarea,
  type MentionMember,
} from '@/app/(app)/_components/mention-textarea'

export function CommentForm({
  postId,
  members,
  canMentionAll,
}: {
  postId: string
  members: MentionMember[]
  canMentionAll: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!body.trim()) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be signed in to comment.')
      }

      const { error: insertError } = await supabase.from('comments').insert({
        post_id: postId,
        author_id: user.id,
        body: body.trim(),
      })
      if (insertError) {
        throw insertError
      }

      setBody('')
      router.refresh()
    } catch (err) {
      console.error('Failed to post comment:', err)
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <MentionTextarea
        value={body}
        onChange={setBody}
        members={members}
        canMentionAll={canMentionAll}
        required
        rows={3}
        placeholder="Write a comment… use @ to mention"
        className="w-full rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />

      {error && (
        <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || !body.trim()}
          className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
        >
          {isSubmitting ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </form>
  )
}
