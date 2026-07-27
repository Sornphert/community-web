'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenSquare, Search, X } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { createClient } from '@/lib/supabase/client'

type PickMember = {
  id: string
  display_name: string
  avatar_url: string | null
}

// "New message" entry point: a button that opens a member picker; choosing someone
// opens (or creates) the 1:1 thread with them in this community and navigates to it.
export function NewDm({
  slug,
  teacherId,
  members,
}: {
  slug: string
  teacherId: string
  members: PickMember[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = members.filter((m) =>
    m.display_name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  async function start(other: PickMember) {
    if (busyId) return
    setBusyId(other.id)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc(
        'get_or_create_dm_thread',
        { p_other: other.id, p_teacher: teacherId },
      )
      if (rpcError) throw rpcError
      router.push(`/t/${slug}/messages/${data as string}`)
    } catch {
      setError('Could not open that conversation.')
      setBusyId(null)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
      >
        <PenSquare className="h-4 w-4" />
        New message
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-line-strong px-2.5 py-1.5">
          <Search className="h-4 w-4 text-fg-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            className="flex-1 bg-transparent text-sm text-fg outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-danger-text">{error}</p>}

      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">No members found</p>
        ) : (
          filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => start(m)}
              disabled={busyId !== null}
              className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted disabled:opacity-50"
            >
              <Avatar url={m.avatar_url} name={m.display_name} size="sm" />
              <span className="font-medium text-fg">{m.display_name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
