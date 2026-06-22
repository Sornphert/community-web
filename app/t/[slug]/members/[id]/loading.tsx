export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 h-4 w-32 animate-pulse rounded bg-strong" />

      <div className="mt-4 flex flex-col items-center rounded-lg border border-line bg-surface p-6">
        <div className="h-14 w-14 animate-pulse rounded-full bg-strong" />
        <div className="mt-3 h-6 w-40 animate-pulse rounded bg-strong" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-strong" />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <div className="h-4 w-1/2 animate-pulse rounded bg-strong" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-strong" />
          </div>
        ))}
      </div>
    </div>
  )
}
