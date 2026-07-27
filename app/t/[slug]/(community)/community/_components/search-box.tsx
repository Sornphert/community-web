'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

// Search box for the community. Submits to the /community/search results page
// (a static segment, so it wins over the [channel] dynamic route).
export function SearchBox({
  basePath,
  defaultValue = '',
}: {
  basePath: string
  defaultValue?: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = q.trim()
    if (t) router.push(`${basePath}/search?q=${encodeURIComponent(t)}`)
  }

  return (
    <form onSubmit={submit} className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search posts & members…"
        aria-label="Search posts and members"
        className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />
    </form>
  )
}
