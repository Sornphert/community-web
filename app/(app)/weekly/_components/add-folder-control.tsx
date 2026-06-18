'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

// Shared admin "+ Add …" control for both months (hub) and weeks (month page).
// Collapsed = a button; expanded = a name input + Create/Cancel. `onCreate` is a
// server action passed by the page (addMonth, or addWeek.bind(null, groupId)).
// Manual naming; an empty name is allowed — the action applies its own fallback.
export function AddFolderControl({
  label,
  placeholder,
  onCreate,
}: {
  label: string
  placeholder: string
  onCreate: (name: string) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await onCreate(name)
      if (result.error) {
        setError(result.error)
        return
      }
      setName('')
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-inverse px-3 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
      >
        <Plus className="h-4 w-4" />
        {label}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={name}
          placeholder={placeholder}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') setOpen(false)
          }}
          className="w-44 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-strong"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          disabled={isPending}
          className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-strong disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
