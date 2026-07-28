'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Film, GripVertical, Trash2 } from 'lucide-react'
import { useToast } from '@/app/_components/toast'
import { deleteContentItem, reorderContentItems } from '../../../actions'

type Item = { id: string; title: string; type: string }

// Existing lessons in a topic: drag to reorder, delete per item. New lessons are
// appended by the form below.
export function ContentList({
  teacherId,
  items,
}: {
  teacherId: string
  items: Item[]
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [order, setOrder] = useState<Item[]>(items)
  const [busyId, setBusyId] = useState<string | null>(null)
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    // Re-sync local drag order when the server sends a new set.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(items)
  }, [items])

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

  function onDrop(toIndex: number) {
    const from = dragIndex.current
    dragIndex.current = null
    setDragOver(null)
    if (from === null || from === toIndex) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(toIndex, 0, moved)
    setOrder(next)
    reorderContentItems({ teacherId, orderedIds: next.map((i) => i.id) }).then(
      (r) => {
        if (r.error) {
          showToast('Could not save order', 'error')
          router.refresh()
        }
      },
    )
  }

  if (order.length === 0) {
    return <p className="text-sm text-fg-muted">No lessons yet. Add one below.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {order.map((item, index) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => {
            dragIndex.current = index
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(index)
          }}
          onDrop={() => onDrop(index)}
          onDragEnd={() => {
            dragIndex.current = null
            setDragOver(null)
          }}
          className={`flex items-center gap-2 rounded-md border bg-surface px-3 py-2 ${
            dragOver === index ? 'border-inverse' : 'border-line'
          }`}
        >
          <span className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center text-fg-muted active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </span>
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
