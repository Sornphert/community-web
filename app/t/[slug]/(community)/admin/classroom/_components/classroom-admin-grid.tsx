'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GripVertical, Lock, Plus, Trash2, Film } from 'lucide-react'
import { createTopic } from '../documents/actions'
import { deleteTopic, reorderTopics } from '../actions'
import { useToast } from '@/app/_components/toast'

type AdminTopic = {
  id: string
  name: string
  cover_image_url: string | null
  is_locked: boolean
  is_recordings: boolean
}

// Admin classroom hub grid: the same topic cards members see, plus an "Add topic"
// tile, per-topic delete, and drag-to-reorder (order persists via reorderTopics).
export function ClassroomAdminGrid({
  slug,
  teacherId,
  topics,
}: {
  slug: string
  teacherId: string
  topics: AdminTopic[]
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [order, setOrder] = useState<AdminTopic[]>(topics)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const base = `/t/${slug}/admin/classroom`

  // Re-sync when the server sends a new set (create/delete/refresh).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(topics)
  }, [topics])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    const result = await createTopic({ teacherId, name })
    setBusy(false)
    if (result.error || !result.topic) {
      showToast(result.error ?? 'Could not create topic.', 'error')
      return
    }
    setName('')
    setCreating(false)
    showToast('Topic created', 'success')
    router.push(`${base}/topic/${result.topic.id}`)
  }

  async function remove(topic: AdminTopic) {
    const warning = topic.is_recordings
      ? `Delete “${topic.name}”? This removes members’ access to its recordings. This can’t be undone.`
      : `Delete “${topic.name}”? Its lessons will be removed. This can’t be undone.`
    if (!window.confirm(warning)) return
    const result = await deleteTopic({ teacherId, topicId: topic.id })
    if (result.error) {
      showToast(result.error, 'error')
      return
    }
    showToast('Topic deleted', 'success')
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
    reorderTopics({ teacherId, orderedIds: next.map((t) => t.id) }).then((r) => {
      if (r.error) {
        showToast('Could not save order', 'error')
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {order.map((topic, index) => (
        <div
          key={topic.id}
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
          className={`group relative overflow-hidden rounded-lg border bg-surface transition-shadow hover:shadow-md ${
            dragOver === index ? 'border-inverse' : 'border-line'
          }`}
        >
          {/* Drag handle */}
          <span className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-grab items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </span>

          <Link href={`${base}/topic/${topic.id}`} className="block">
            {topic.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={topic.cover_image_url}
                alt={topic.name}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                <span className="px-2 text-center text-sm font-medium text-fg-muted">
                  {topic.name}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 p-3">
              <p className="line-clamp-2 min-w-0 flex-1 font-medium text-fg">
                {topic.name}
              </p>
              {topic.is_recordings && (
                <Film className="h-4 w-4 shrink-0 text-fg-muted" />
              )}
              {topic.is_locked && (
                <Lock className="h-4 w-4 shrink-0 text-fg-faint" />
              )}
            </div>
          </Link>

          <button
            type="button"
            onClick={() => remove(topic)}
            aria-label={`Delete ${topic.name}`}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Add topic tile */}
      {creating ? (
        <form
          onSubmit={add}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface p-4"
        >
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Topic name"
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg hover:bg-inverse-hover disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setName('')
              }}
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface text-fg-muted transition-colors hover:bg-hover-subtle hover:text-fg"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-medium">Add topic</span>
        </button>
      )}
    </div>
  )
}
