'use client'

import { useState, useTransition } from 'react'
import { markRecordingComplete, unmarkRecordingComplete } from '../../actions'

export function CompleteToggle({
  recordingId,
  initiallyCompleted,
}: {
  recordingId: string
  initiallyCompleted: boolean
}) {
  const [completed, setCompleted] = useState(initiallyCompleted)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !completed
    setCompleted(next) // optimistic flip
    setError(null)

    startTransition(async () => {
      const result = next
        ? await markRecordingComplete(recordingId)
        : await unmarkRecordingComplete(recordingId)
      if (result.error) {
        setCompleted(!next) // revert on error
        setError(result.error)
        console.error('Failed to update completion:', result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={
          completed
            ? 'self-start rounded-md bg-success px-4 py-2 text-white transition-colors hover:bg-success-hover disabled:opacity-50'
            : 'self-start rounded-md bg-inverse px-4 py-2 text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50'
        }
      >
        {completed ? 'Completed ✓' : 'Mark as complete'}
      </button>

      {error && (
        <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
