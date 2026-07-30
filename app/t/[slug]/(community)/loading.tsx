// [MT] Group-level fallback loading skeleton for the teacher shell. Routes with their
// own loading.tsx (community feed, classroom, events, member profile) override this;
// everything else gets this generic pulse instead of a blank frame during data fetch.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse">
      <div className="mb-4 h-7 w-48 rounded bg-strong" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-line bg-surface" />
        ))}
      </div>
    </div>
  )
}
