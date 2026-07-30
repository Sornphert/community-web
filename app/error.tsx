'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

// Root-level catch-all boundary — the ultimate safety net for anything not caught by a
// closer boundary: the /home directory, the /t/[slug] layout's teacher fetch, and the
// pre-auth/public pages. Nested group and per-route error.tsx files still override this
// where they exist. (Root-layout failures would need global-error.tsx; the root layout
// only renders html/body/fonts, so that's intentionally omitted.)
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
    <div className="mx-auto mt-12 w-full max-w-2xl px-4 text-center">
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
        <Link href="/home" className="text-sm text-fg-muted hover:text-fg">
          Home
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
