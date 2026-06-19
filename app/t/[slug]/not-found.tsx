import Link from 'next/link'

// not-found boundary for the teacher shell. Because it lives UNDER /t/[slug]/layout,
// a notFound() (or a not-yet-built child route, e.g. Community before Step 2) renders
// here WITH the sidebar/shell intact, rather than bubbling to a bare root 404. Mirrors
// the per-route boundaries the (app) tree ships (CLAUDE.md convention).
export default function TeacherNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-fg-muted">Page not found</p>
      <Link href="/home" className="text-sm text-fg hover:underline">
        Back to your communities
      </Link>
    </div>
  )
}
