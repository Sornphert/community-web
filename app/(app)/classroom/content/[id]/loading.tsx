export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />

      <div className="mt-4 aspect-video w-full animate-pulse rounded-lg bg-zinc-200" />

      <div className="mt-6">
        <div className="h-7 w-2/3 animate-pulse rounded bg-zinc-200" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-zinc-200" />
      </div>

      <div className="mt-6 h-10 w-40 animate-pulse rounded-md bg-zinc-200" />
    </div>
  )
}
