'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import type { TagWithUsage } from '@/lib/tags'
import { addTopicTag, removeTopicTag } from '../actions'

// Per-topic gating editor: the teacher's tags rendered as toggle chips. A chip that is
// "on" means this topic REQUIRES that tag (a member must hold it to enter). No selection =
// ungated/open — surfaced by the hint below. This is presentation only; the real gate is
// can_access_topic in SQL. teacherId/topicId/slug flow straight to the server actions,
// which re-guard (requireTeacherAdmin + RLS + composite FKs) — never trusted here.
export function TopicTagsEditor({
  teacherId,
  topicId,
  slug,
  tags,
  attachedTagIds,
}: {
  teacherId: string
  topicId: string
  slug: string
  tags: TagWithUsage[]
  attachedTagIds: Set<string>
}) {
  const router = useRouter()
  const [attached, setAttached] = useState<Set<string>>(
    () => new Set(attachedTagIds),
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(tagId: string) {
    const isOn = attached.has(tagId)
    setError(null)
    setBusyId(tagId)
    try {
      const result = isOn
        ? await removeTopicTag({ teacherId, topicId, tagId, slug })
        : await addTopicTag({ teacherId, topicId, tagId, slug })
      if (result.error) {
        setError(result.error)
        return
      }
      setAttached((prev) => {
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
        No tags yet. Create tags in the Tag Manager to gate this topic.
      </p>
    )
  }

  const gated = attached.size > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-secondary">Required tags</span>
        <span className="text-xs text-fg-muted">
          {gated ? 'Members need every tag on to enter' : 'Ungated — open to all members'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isOn = attached.has(tag.id)
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
