'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import type { PendingMember } from '@/lib/types'
import { setPendingMembershipStatus } from '../actions'

// Inline Approve/Deny control for a pending join request. INTENTIONAL CONVENTION BREAK: the
// active roster is navigation-only (rows link to a detail page), but the pending queue is a
// fast-triage surface, so its actions live inline on the row — and getMemberProfile is
// status='active'-only, so a pending person has no working detail page to link to anyway.
// Presentation only: teacherId/profileId flow straight to the server action, which re-guards
// (requireTeacherAdmin) and calls the set_membership_status RPC — the RPC is THE authority.
// Revalidate-driven, not optimistic: both the success and the benign already-handled paths
// call router.refresh() so the resolved row drops on the next fetch without client desync.
export function PendingMemberRow({
  teacherId,
  member,
}: {
  teacherId: string
  member: PendingMember
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function resolve(newStatus: 'active' | 'revoked') {
    setError(null)
    setBusy(true)
    try {
      const result = await setPendingMembershipStatus({
        teacherId,
        profileId: member.id,
        newStatus,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      // Success OR benign concurrent-resolution race: drop the (now stale) row via refresh.
      setConfirming(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        <Avatar url={member.avatar_url} name={member.display_name} size="md" />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-fg">{member.display_name}</span>
          <p className="truncate text-xs text-fg-muted">
            requested {formatRelativeTime(member.created_at ?? '')}
            {/* Quiet, muted attribution — nearly always 'join_link' today; it only
                differentiates once other sources exist, so it stays a secondary detail. */}
            {member.source && (
              <span className="text-fg-muted"> · via {member.source}</span>
            )}
          </p>
        </div>

        {confirming ? (
          // Deny is destructive → explicit confirm, mirroring RoleToggle's demote-confirm.
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void resolve('revoked')}
              disabled={busy}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
            >
              {busy ? 'Denying…' : 'Confirm deny'}
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
        ) : (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void resolve('active')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-hover-subtle disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {busy ? 'Approving…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(true)
                setError(null)
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-hover-subtle disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Deny
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  )
}
