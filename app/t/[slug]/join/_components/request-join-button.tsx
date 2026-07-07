'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestToJoin } from '../actions'

// The join CTA. Calls the requestToJoin server action; on success the action revalidates the
// join page and we router.refresh() so the server component re-reads membership status and
// flips to the "waiting for approval" state. Mirrors the login form's useTransition + inline
// error handling. Rendered only for the none/revoked states (the page owns that branching).
export function RequestJoinButton({
  slug,
  teacherId,
  teacherName,
}: {
  slug: string
  teacherId: string
  teacherName: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await requestToJoin({ slug, teacherId })
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
      >
        {isPending ? 'Sending request…' : `Request to join ${teacherName}`}
      </button>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
