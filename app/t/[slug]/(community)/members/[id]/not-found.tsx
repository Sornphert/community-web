'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function MemberNotFound() {
  // [MT] not-found has no params prop — read the slug from the URL for the back link.
  const { slug } = useParams<{ slug: string }>()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
      <p className="text-fg-muted">Member not found</p>
      <Link
        href={`/t/${slug}/members`}
        className="text-sm text-fg-muted hover:text-fg"
      >
        Back to members
      </Link>
    </div>
  )
}
