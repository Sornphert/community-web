'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Film, Trash2 } from 'lucide-react'
import { useToast } from '@/app/_components/toast'
import { deleteContentItem } from '../../../actions'

type Item = { id: string; title: string; type: string }

// Existing lessons in a topic with a delete control (admin). Additions happen via
// the DocumentLessonForm below it on the page.
export function ContentList({
  teacherId,
  items,
}: {
  teacherId: string
  items: Item[]
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function remove(item: Item) {
    if (!window.confirm(`Delete “${item.title}”?`)) return
    setBusyId(item.id)
    const result = await deleteContentItem({ teacherId, itemId: item.id })
    setBusyId(null)
    if (result.error) {
      showToast(result.error, 'error')
      return
    }
    showToast('Lesson deleted', 'success')
    router.refresh()
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-fg-muted">No lessons yet. Add one below.</p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2"
        >
          {item.type === 'video' ? (
            <Film className="h-4 w-4 shrink-0 text-fg-muted" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-fg-muted" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
            {item.title}
          </span>
          <button
            type="button"
            onClick={() => remove(item)}
            disabled={busyId === item.id}
            aria-label={`Delete ${item.title}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}
