export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 h-6 w-56 animate-pulse rounded bg-strong" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <div className="h-6 w-6 shrink-0 animate-pulse rounded bg-strong" />
            <div className="flex-1">
              <div className="h-4 w-32 animate-pulse rounded bg-strong" />
              <div className="mt-2 h-3 w-16 animate-pulse rounded bg-strong" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
