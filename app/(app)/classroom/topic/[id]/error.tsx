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
      <AlertTriangle className="mx-auto h-12 w-12 text-fg-faint" />
      <h1 className="mt-4 text-xl font-semibold text-fg">
        Couldn&apos;t load this topic
      </h1>
      <p className="mt-2 text-fg-soft">
        We couldn&apos;t load this topic. Please try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-md bg-inverse px-4 py-2 text-inverse-fg"
        >
          Try again
        </button>
        <Link
          href="/classroom"
          className="text-sm text-fg-muted hover:text-fg"
        >
          Back to classroom
        </Link>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-6 overflow-x-auto rounded-md bg-muted p-3 text-left text-xs text-fg-secondary">
          {error.message}
        </pre>
      )}
    </div>
  )
}
