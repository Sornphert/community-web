import Link from 'next/link'

export default function ContentNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-fg-muted">Content not found</p>
      <Link href="/classroom" className="text-sm text-fg hover:underline">
        Back to classroom
      </Link>
    </div>
  )
}
