'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// "Message" button on a member's profile: opens (or creates) the 1:1 thread with
// them in this community and navigates to it. Same-community only — the RPC enforces
// co-membership, so this is safe to render for any member the viewer can see.
export function MessageMemberButton({
  slug,
  teacherId,
  otherId,
}: {
  slug: string
  teacherId: string
  otherId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function open() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc(
        'get_or_create_dm_thread',
        { p_other: otherId, p_teacher: teacherId },
      )
      if (rpcError) throw rpcError
      router.push(`/t/${slug}/messages/${data as string}`)
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted disabled:opacity-50"
      >
        <Mail className="h-4 w-4" />
        Message
      </button>
      {error && <span className="text-xs text-danger-text">Couldn’t open chat</span>}
    </div>
  )
}
