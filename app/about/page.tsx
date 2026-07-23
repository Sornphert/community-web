import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PLATFORM_NAME } from '@/lib/config'

export const metadata = {
  title: 'About',
}

// Public About page (proxy.ts allows '/about'). Draft copy — Sorn to adjust tone/
// specifics as the platform's positioning firms up.
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
          {PLATFORM_NAME} is a home for private learning communities. Each
          community is led by an independent teacher or coach — an investor, a
          parenting mentor, a property expert — who brings their students together
          in one place to learn, ask questions, and grow.
        </p>
        <p>
          Every community has its own classroom of lessons and recordings, a
          members-only feed for questions and wins, and a group of people all
          working toward the same goal. Instead of scattered chat groups and lost
          files, everything a teacher shares and everything their members discuss
          lives in one organised space.
        </p>
        <p>
          Communities are private. You join through the teacher who runs one —
          usually via their own program or website — and once you&rsquo;re a
          member, their classroom and community are waiting for you here.
        </p>
        <p>
          Browse the communities on the{' '}
          <Link
            href="/home"
            className="text-fg underline underline-offset-2 hover:text-fg-secondary"
          >
            homepage
          </Link>{' '}
          to see what&rsquo;s inside, or if you already belong to one, log in to
          jump straight back in.
        </p>
        <p className="text-fg-muted">
          {PLATFORM_NAME} is built by The Tree Solutions.
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
