'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function CompleteToggle({
  contentItemId,
  initiallyCompleted,
}: {
  contentItemId: string
  initiallyCompleted: boolean
}) {
  const [isCompleted, setIsCompleted] = useState(initiallyCompleted)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle() {
    setIsPending(true)
    setError(null)

    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be signed in.')
      }

      if (isCompleted) {
        const { error: deleteError } = await supabase
          .from('content_progress')
          .delete()
          .eq('user_id', user.id)
          .eq('content_item_id', contentItemId)
        if (deleteError) {
          throw deleteError
        }
      } else {
        const { error: insertError } = await supabase
          .from('content_progress')
          .insert({
            user_id: user.id,
            content_item_id: contentItemId,
            completed_at: new Date().toISOString(),
          })
        if (insertError) {
          throw insertError
        }
      }

      setIsCompleted(!isCompleted)
    } catch (err) {
      console.error('Failed to update completion:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={
          isCompleted
            ? 'self-start rounded-md bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50'
            : 'self-start rounded-md bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-800 disabled:opacity-50'
        }
      >
        {isCompleted ? 'Completed ✓' : 'Mark as complete'}
      </button>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
