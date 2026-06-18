import Link from 'next/link'

export default function WeekNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-fg-muted">Week not found</p>
      <Link href="/weekly" className="text-sm text-fg hover:underline">
        Back to Weekly Report
      </Link>
    </div>
  )
}
