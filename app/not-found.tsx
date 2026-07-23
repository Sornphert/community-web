import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PLATFORM_NAME } from '@/lib/config'

export const metadata = {
  title: 'Page not found',
}

// Global 404 — catches unmatched URLs and any notFound() that has no closer
// boundary (e.g. a bad /u/[teacher]/[id]). Branded, theme-aware, and points back to
// the public directory. No auth needed.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 text-center">
      <p className="text-sm font-medium text-fg-muted">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-fg">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-secondary">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
      <Link
        href="/home"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-inverse px-4 py-2.5 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {PLATFORM_NAME}
      </Link>
    </div>
  )
}
