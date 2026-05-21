export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="h-7 w-40 animate-pulse rounded bg-zinc-200" />

      <div className="mt-6 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-200" />
              <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-200" />
            </div>
            <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-zinc-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
