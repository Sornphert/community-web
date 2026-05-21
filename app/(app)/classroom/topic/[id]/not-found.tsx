import Link from 'next/link'

export default function TopicNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-zinc-500">Topic not found</p>
      <Link href="/classroom" className="text-sm text-zinc-900 hover:underline">
        Back to classroom
      </Link>
    </div>
  )
}
