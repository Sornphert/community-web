import Link from 'next/link'

export default function RecordingNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
      <p className="text-zinc-500">Recording not found</p>
      <Link
        href="/classroom/recordings"
        className="text-sm text-zinc-900 hover:underline"
      >
        Back to recordings
      </Link>
    </div>
  )
}
