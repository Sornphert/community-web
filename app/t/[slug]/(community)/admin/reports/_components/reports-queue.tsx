'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Flag, ExternalLink } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import { useToast } from '@/app/_components/toast'
import type { ContentReportWithContext, ReportStatus } from '@/lib/types'
import { resolveReport } from '../actions'

const TABS: { key: ReportStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'actioned', label: 'Actioned' },
  { key: 'dismissed', label: 'Dismissed' },
]

const TARGET_LABEL: Record<string, string> = {
  post: 'Post',
  comment: 'Comment',
  user: 'Member',
}

export function ReportsQueue({
  teacherId,
  slug,
  status,
  reports,
}: {
  teacherId: string
  slug: string
  status: ReportStatus
  reports: ContentReportWithContext[]
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const base = `/t/${slug}/admin/reports`

  async function resolve(
    reportId: string,
    next: 'actioned' | 'dismissed',
  ) {
    if (busyId) return
    setBusyId(reportId)
    const result = await resolveReport({ teacherId, reportId, status: next })
    setBusyId(null)
    if ('error' in result) {
      showToast(result.error, 'error')
      return
    }
    showToast(next === 'actioned' ? 'Marked as actioned' : 'Dismissed', 'success')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-line">
        {TABS.map((tab) => {
          const active = tab.key === status
          return (
            <Link
              key={tab.key}
              href={`${base}?status=${tab.key}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-inverse text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-12 text-center">
          <Flag className="h-8 w-8 text-fg-muted" />
          <p className="mt-3 text-sm font-medium text-fg">
            {status === 'open' ? 'No open reports' : `No ${status} reports`}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {status === 'open'
              ? 'When someone reports a post, comment, or member, it shows up here.'
              : 'Nothing in this tab yet.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-line bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  url={r.reporter.avatar_url}
                  name={r.reporter.display_name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-fg">
                      {r.reporter.display_name}
                    </span>
                    <span className="text-xs text-fg-muted">
                      reported a{' '}
                      {TARGET_LABEL[r.target_type]?.toLowerCase() ??
                        r.target_type}
                    </span>
                    <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-fg-muted">
                      {TARGET_LABEL[r.target_type] ?? r.target_type}
                    </span>
                    <span className="text-xs text-fg-faint">
                      · {formatRelativeTime(r.created_at)}
                    </span>
                  </div>

                  {/* Target preview / link */}
                  {r.targetMissing ? (
                    <p className="mt-2 text-sm italic text-fg-faint">
                      The reported content has been deleted.
                    </p>
                  ) : (
                    <div className="mt-2">
                      {r.targetPreview && (
                        <p className="line-clamp-3 rounded-md bg-muted px-3 py-2 text-sm text-fg-secondary">
                          {r.targetPreview}
                        </p>
                      )}
                      {r.targetHref && (
                        <Link
                          href={r.targetHref}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View {TARGET_LABEL[r.target_type]?.toLowerCase()}
                        </Link>
                      )}
                    </div>
                  )}

                  {r.reason && (
                    <p className="mt-2 text-sm text-fg-soft">
                      <span className="text-fg-muted">Reason: </span>
                      {r.reason}
                    </p>
                  )}
                </div>
              </div>

              {status === 'open' && (
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => resolve(r.id, 'dismissed')}
                    disabled={busyId === r.id}
                    className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-hover-subtle disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => resolve(r.id, 'actioned')}
                    disabled={busyId === r.id}
                    className="rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg hover:bg-inverse-hover disabled:opacity-50"
                  >
                    {busyId === r.id ? 'Saving…' : 'Mark actioned'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
