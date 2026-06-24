'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function ContentNotFound() {
  // [MT] not-found has no params prop — read the slug from the URL for the back link.
  const { slug } = useParams<{ slug: string }>()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-fg-muted">Content not found</p>
      <Link href={`/t/${slug}/classroom`} className="text-sm text-fg hover:underline">
        Back to classroom
      </Link>
    </div>
  )
}
