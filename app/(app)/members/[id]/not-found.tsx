import Link from 'next/link'

export default function MemberNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
      <p className="text-fg-muted">Member not found</p>
      <Link
        href="/members"
        className="text-sm text-fg-muted hover:text-fg"
      >
        Back to members
      </Link>
    </div>
  )
}
