'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'
import { useToast } from '@/app/_components/toast'
import { renameTopic } from '../../../actions'

// Inline-editable topic title (admin). Shows the name with a pencil; editing swaps
// in an input with save/cancel.
export function TopicNameEditor({
  teacherId,
  topicId,
  initialName,
}: {
  teacherId: string
  topicId: string
  initialName: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === initialName) {
      setEditing(false)
      setName(initialName)
      return
    }
    setBusy(true)
    const result = await renameTopic({ teacherId, topicId, name: trimmed })
    setBusy(false)
    if (result.error) {
      showToast(result.error, 'error')
      return
    }
    setEditing(false)
    showToast('Topic renamed', 'success')
    router.refresh()
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-fg">{initialName}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename topic"
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setEditing(false)
            setName(initialName)
          }
        }}
        className="rounded-md border border-line-strong px-3 py-1.5 text-lg font-semibold text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        aria-label="Save"
        className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg disabled:opacity-50"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setName(initialName)
        }}
        aria-label="Cancel"
        className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
