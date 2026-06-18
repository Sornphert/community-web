import Link from 'next/link'

export default function MonthNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-fg-muted">Month not found</p>
      <Link href="/weekly" className="text-sm text-fg hover:underline">
        Back to Weekly Report
      </Link>
    </div>
  )
}
