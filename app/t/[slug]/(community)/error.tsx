'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

// [MT] Group-level catch-all error boundary for the whole teacher shell. Routes with
// their own error.tsx (e.g. community/[channel], classroom/*) override this; everything
// else — admin pages, events, members, messages, saved, profile, the landings — falls
// back here instead of Next's default error screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Boundary components don't receive route params as props — read the slug from the
  // URL to build the teacher-scoped back link.
  const { slug } = useParams<{ slug: string }>()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto mt-12 w-full max-w-2xl text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-fg-faint" />
      <h1 className="mt-4 text-xl font-semibold text-fg">
        Something went wrong
      </h1>
      <p className="mt-2 text-fg-soft">
        We couldn&apos;t load this page. Please try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-md bg-inverse px-4 py-2 text-inverse-fg"
        >
          Try again
        </button>
        {slug && (
          <Link
            href={`/t/${slug}/community`}
            className="text-sm text-fg-muted hover:text-fg"
          >
            Back to community
          </Link>
        )}
      </div>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-6 overflow-x-auto rounded-md bg-muted p-3 text-left text-xs text-fg-secondary">
          {error.message}
        </pre>
      )}
    </div>
  )
}
