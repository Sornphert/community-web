// Skeleton shown while /p/[id] resolves (server-fetched), so navigation feels instant.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 h-4 w-36 animate-pulse rounded bg-muted" />

      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-4 h-56 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}
