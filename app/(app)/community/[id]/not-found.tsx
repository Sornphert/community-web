import Link from 'next/link'

export default function PostNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-zinc-500">Post not found</p>
      <Link href="/community" className="text-sm text-zinc-900 hover:underline">
        Back to community
      </Link>
    </div>
  )
}
