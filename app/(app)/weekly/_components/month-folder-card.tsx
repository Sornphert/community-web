import Link from 'next/link'
import { FolderClosed } from 'lucide-react'
import type { MonthFolder } from '@/lib/types'

// A clickable month folder on the /weekly hub. Links to /weekly/m/<id> (the
// prefixed month route — weeks stay flat at /weekly/week-N). Shows the manual
// month name + its week count.
export function MonthFolderCard({ month }: { month: MonthFolder }) {
  return (
    <Link
      href={`/weekly/m/${month.id}`}
      className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:bg-muted"
    >
      <FolderClosed className="h-6 w-6 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-fg">{month.name}</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          {month.week_count} {month.week_count === 1 ? 'week' : 'weeks'}
        </p>
      </div>
    </Link>
  )
}
