import Link from 'next/link'
import { FolderClosed } from 'lucide-react'
import type { WeekFolder } from '@/lib/types'

// A clickable week folder on a month page (/weekly/m/[month]). Links to the
// week's FLAT canonical URL /weekly/<slug>. Shows the week name + its post count.
// Date-range subtitle is phase-2 (needs a posts time aggregate).
export function WeekFolderCard({ week }: { week: WeekFolder }) {
  return (
    <Link
      href={`/weekly/${week.slug}`}
      className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:bg-muted"
    >
      <FolderClosed className="h-6 w-6 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-fg">{week.name}</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          {week.post_count} {week.post_count === 1 ? 'post' : 'posts'}
        </p>
      </div>
    </Link>
  )
}
