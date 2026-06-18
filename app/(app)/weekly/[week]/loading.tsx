export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 h-6 w-40 animate-pulse rounded bg-strong" />
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-strong" />
              <div className="h-4 w-32 animate-pulse rounded bg-strong" />
            </div>
            <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-strong" />
            <div className="mt-2 h-4 w-full animate-pulse rounded bg-strong" />
          </div>
        ))}
      </div>
    </div>
  )
}
