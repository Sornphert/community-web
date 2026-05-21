import Link from 'next/link'

export default function MemberNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
      <p className="text-zinc-500">Member not found</p>
      <Link
        href="/members"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        Back to members
      </Link>
    </div>
  )
}
