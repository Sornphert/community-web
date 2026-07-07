'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ShieldMinus } from 'lucide-react'
import type { MembershipRole } from '@/lib/types'
import { setMembershipRole } from '../../actions'

// Promote/demote control on the member DETAIL page (never inline on the roster) — a role
// flip can lock a teacher out of its own community, so it deserves an explicit intention +
// a confirm on demotion. Presentation only: teacherId/profileId flow straight to the server
// action, which re-guards (requireTeacherAdmin) and calls the set_membership_role RPC — the
// RPC is THE authority for the last-admin invariant, so there is NO client-side admin count
// here (a client count would be race-prone); we simply surface its `last_admin` verdict.
export function RoleToggle({
  teacherId,
  profileId,
  currentRole,
}: {
  teacherId: string
  profileId: string
  currentRole: MembershipRole
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = currentRole === 'admin'
  const nextRole: MembershipRole = isAdmin ? 'member' : 'admin'

  async function apply() {
    setError(null)
    setBusy(true)
    try {
      const result = await setMembershipRole({ teacherId, profileId, newRole: nextRole })
      if (result.error) {
        setError(result.error)
        return
      }
      setConfirming(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // Promotion is a single click; demotion requires an explicit confirm.
  function onClick() {
    if (isAdmin) {
      setConfirming(true)
      setError(null)
    } else {
      void apply()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-fg-secondary">Role</span>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3">
          <p className="text-sm text-fg">
            Demote this admin to member? They will lose admin access to this community.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
            >
              {busy ? 'Demoting…' : 'Demote to member'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-hover-subtle disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-hover-subtle disabled:opacity-50"
        >
          {isAdmin ? (
            <>
              <ShieldMinus className="h-3.5 w-3.5" />
              {busy ? 'Working…' : 'Demote to member'}
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5" />
              {busy ? 'Promoting…' : 'Promote to admin'}
            </>
          )}
        </button>
      )}

      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  )
}
