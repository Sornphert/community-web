export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:order-2 lg:flex-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-7 w-40 rounded bg-zinc-200" />
            <div className="h-8 w-28 rounded bg-zinc-200" />
          </div>
          <div className="h-[560px] rounded-lg border border-zinc-200 bg-white" />
        </div>
        <aside className="lg:order-1 lg:w-[300px] lg:shrink-0">
          <div className="mb-2 h-5 w-32 rounded bg-zinc-200" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-zinc-200" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
