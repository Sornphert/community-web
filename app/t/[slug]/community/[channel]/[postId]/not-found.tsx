'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function PostNotFound() {
  // [MT] not-found has no params prop — read the slug from the URL for the back link.
  const { slug } = useParams<{ slug: string }>()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-fg-muted">Post not found</p>
      <Link href={`/t/${slug}/community`} className="text-sm text-fg hover:underline">
        Back to community
      </Link>
    </div>
  )
}
