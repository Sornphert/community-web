'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus } from 'lucide-react'
import { revokeMembership } from '../../actions'

// Revoke control on the member DETAIL page (never inline on the roster). Revoking removes a
// member's access to the whole community, so it ALWAYS requires an explicit confirm — there is
// no single-click path (unlike promotion in RoleToggle). Presentation only: teacherId/profileId
// flow straight to the server action, which re-guards (requireTeacherAdmin) and calls the
// revoke_membership RPC — the RPC is THE authority for the last-admin invariant, so there is NO
// client-side admin count here; we simply surface its `last_admin` verdict.
//
// CRITICAL divergence from RoleToggle: on success we router.push to the roster, NOT
// router.refresh(). After a revoke the member is no longer active, getMemberProfile returns
// null, and THIS detail page would 404 — so we navigate away instead of refreshing in place.
export function RevokeMember({
  slug,
  teacherId,
  profileId,
}: {
  slug: string
  teacherId: string
  profileId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    setError(null)
    setBusy(true)
    try {
      const result = await revokeMembership({ teacherId, profileId })
      if (result.error) {
        setError(result.error)
        return
      }
      // Member is no longer active → this page would 404. Navigate to the roster.
      router.push(`/t/${slug}/admin/members`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-fg-secondary">Membership access</span>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3">
          <p className="text-sm text-fg">
            Revoke this member&rsquo;s access? They lose access to this community until they
            re-request and are re-approved.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
            >
              {busy ? 'Revoking…' : 'Revoke access'}
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
          onClick={() => {
            setConfirming(true)
            setError(null)
          }}
          disabled={busy}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-hover-subtle disabled:opacity-50"
        >
          <UserMinus className="h-3.5 w-3.5" />
          Revoke access
        </button>
      )}

      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  )
}
