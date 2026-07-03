'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import type { TagWithUsage } from '@/lib/tags'
import { assignMemberTag, removeMemberTag } from '../actions'

// Assign-to-member editor: the teacher's tags rendered as toggle chips. A chip that is
// "on" means this member HOLDS that tag (which, combined with per-topic gating, unlocks
// tag-gated topics). Presentation only; the real assignment lives in member_tags under
// admin RLS. teacherId/profileId flow straight to the server actions, which re-guard
// (requireTeacherAdmin + RLS + composite FKs) — never trusted here.
export function MemberTagsEditor({
  teacherId,
  profileId,
  tags,
  heldTagIds,
}: {
  teacherId: string
  profileId: string
  tags: TagWithUsage[]
  heldTagIds: Set<string>
}) {
  const router = useRouter()
  const [held, setHeld] = useState<Set<string>>(() => new Set(heldTagIds))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(tagId: string) {
    const isOn = held.has(tagId)
    setError(null)
    setBusyId(tagId)
    try {
      const result = isOn
        ? await removeMemberTag({ teacherId, profileId, tagId })
        : await assignMemberTag({ teacherId, profileId, tagId })
      if (result.error) {
        setError(result.error)
        return
      }
      setHeld((prev) => {
        const next = new Set(prev)
        if (isOn) next.delete(tagId)
        else next.add(tagId)
        return next
      })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (tags.length === 0) {
    return (
      <p className="text-xs text-fg-muted">
        No tags yet. Create tags in the Tag Manager to assign them to members.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-fg-secondary">Assigned tags</span>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isOn = held.has(tag.id)
          const isBusy = busyId === tag.id
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              disabled={isBusy}
              aria-pressed={isOn}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                isOn
                  ? 'border-inverse bg-inverse text-inverse-fg'
                  : 'border-line-strong bg-canvas text-fg-secondary hover:bg-hover-subtle'
              }`}
            >
              <span
                aria-hidden
                style={{ backgroundColor: tag.color ?? undefined }}
                className={`h-2 w-2 shrink-0 rounded-full ${
                  tag.color ? '' : 'border border-line-strong'
                }`}
              />
              {tag.name}
              {isOn && <Check className="h-3 w-3" />}
            </button>
          )
        })}
      </div>

      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  )
}
