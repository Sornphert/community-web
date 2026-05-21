'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto mt-12 w-full max-w-2xl text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-zinc-400" />
      <h1 className="mt-4 text-xl font-semibold text-zinc-900">
        Couldn&apos;t load this member
      </h1>
      <p className="mt-2 text-zinc-600">
        We couldn&apos;t load this member. Please try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white"
        >
          Try again
        </button>
        <Link
          href="/members"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Back to members
        </Link>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-6 overflow-x-auto rounded-md bg-zinc-100 p-3 text-left text-xs text-zinc-700">
          {error.message}
        </pre>
      )}
    </div>
  )
}
