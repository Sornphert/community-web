export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />

      <div className="mt-4">
        <div className="h-7 w-2/3 animate-pulse rounded bg-zinc-200" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-zinc-200" />
      </div>

      <div className="my-4 border-t border-zinc-200" />

      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3"
          >
            <div className="h-14 w-14 shrink-0 animate-pulse rounded bg-zinc-200" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200" />
              <div className="mt-2 h-3 w-16 animate-pulse rounded bg-zinc-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
