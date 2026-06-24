'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // [MT] Boundary components don't receive route params as props — read the slug
  // from the URL to build the teacher-scoped back link.
  const { slug } = useParams<{ slug: string }>()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto mt-12 w-full max-w-3xl text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-fg-faint" />
      <h1 className="mt-4 text-xl font-semibold text-fg">
        Couldn&apos;t load recordings
      </h1>
      <p className="mt-2 text-fg-soft">
        We couldn&apos;t load the recordings. Please try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-md bg-inverse px-4 py-2 text-inverse-fg"
        >
          Try again
        </button>
        <Link
          href={`/t/${slug}/classroom`}
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
