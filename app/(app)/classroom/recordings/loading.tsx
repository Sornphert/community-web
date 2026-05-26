export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
      <div className="mt-4 mb-6 h-7 w-40 animate-pulse rounded bg-zinc-200" />

      <div className="flex flex-col gap-2">
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-200" />
      </div>
    </div>
  )
}
