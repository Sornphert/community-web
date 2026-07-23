// Skeleton shown while /u/[teacher]/[id] resolves (server-fetched).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 h-4 w-32 animate-pulse rounded bg-muted" />

      <div className="mt-4 flex flex-col items-center rounded-lg border border-line bg-surface p-6">
        <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
        <div className="mt-3 h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="my-4 h-px w-full bg-line" />
        <div className="h-3 w-24 self-start animate-pulse rounded bg-muted" />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-4">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
