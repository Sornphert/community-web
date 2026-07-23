import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PLATFORM_NAME } from '@/lib/config'

export const metadata = {
  title: `About · ${PLATFORM_NAME}`,
}

// PLACEHOLDER About page. Public (proxy.ts allows '/about'). Copy is a stub for Sorn
// to replace before launch — structure only.
export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/home"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-secondary transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to communities
      </Link>

      <h1 className="text-2xl font-semibold text-fg">About {PLATFORM_NAME}</h1>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-fg-secondary">
        <p>
          {/* TODO(Sorn): replace with real About copy before launch. */}
          {PLATFORM_NAME} is a home for private learning communities — each run by
          an independent teacher, with its own classroom, members, and feed.
        </p>
        <p>
          This is placeholder text. Tell me what you want here and I&rsquo;ll drop
          it in: your mission, who the platform is for, how to join a community, and
          any contact details.
        </p>
      </div>

      <p className="mt-8 text-sm text-fg-muted">
        Read our{' '}
        <Link
          href="/privacy"
          className="text-fg-secondary underline underline-offset-2 hover:text-fg"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  )
}
