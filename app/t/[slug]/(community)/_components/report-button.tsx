'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X } from 'lucide-react'
import { useToast } from '@/app/_components/toast'
import { reportContent } from '../community/_actions/moderation'
import type { ReportTargetType } from '@/lib/types'

const LABELS: Record<ReportTargetType, string> = {
  post: 'this post',
  comment: 'this comment',
  user: 'this member',
}

// Reusable "Report" affordance for a post, comment, or member. Opens a small dialog with
// an optional reason and submits via the reportContent server action (RLS-gated). Success
// is intentionally quiet — the reporter just gets a toast; the report lands in the admin
// queue. Idempotent: re-reporting the same thing while a prior report is open is a no-op.
export function ReportButton({
  teacherId,
  targetType,
  targetId,
  compact = false,
}: {
  teacherId: string
  targetType: ReportTargetType
  targetId: string
  // compact = small icon-only trigger (comment rows); default = icon + "Report" text.
  compact?: boolean
}) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function submit() {
    if (busy) return
    setBusy(true)
    const result = await reportContent({
      teacherId,
      targetType,
      targetId,
      reason,
    })
    setBusy(false)
    if ('error' in result) {
      showToast(result.error, 'error')
      return
    }
    setOpen(false)
    setReason('')
    showToast('Reported. Thanks — an admin will review it.', 'success')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Report ${LABELS[targetType]}`}
        className={
          compact
            ? 'inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg'
            : 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-hover-subtle hover:text-fg'
        }
      >
        <Flag className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        {!compact && 'Report'}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-lg border border-line bg-surface p-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-fg">
                  Report {LABELS[targetType]}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover-subtle"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-sm text-fg-soft">
                This is sent privately to the community admins for review. Add a
                reason if you like (optional).
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={3}
                autoFocus
                placeholder="What's wrong with it?"
                className="mt-3 w-full rounded-md border border-line-strong bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-fg-muted focus:outline-none"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-hover-subtle disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg hover:bg-inverse-hover disabled:opacity-50"
                >
                  {busy ? 'Submitting…' : 'Submit report'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
