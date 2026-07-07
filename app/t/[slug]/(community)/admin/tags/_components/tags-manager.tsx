'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { TagWithUsage } from '@/lib/tags'
import { MAX_TAG_NAME_LEN } from '@/lib/tag-constants'
import { createTag, deleteTag, renameTag } from '../actions'

// Optional tag colors. Rendered as inline-style swatches (a hex, not a Tailwind class),
// so there is no template-built class name for the v4 compiler to miss. `null` = no color.
const PRESET_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const

export function TagsManager({
  teacherId,
  tags,
}: {
  teacherId: string
  tags: TagWithUsage[]
}) {
  const router = useRouter()

  // Create form
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Per-row interaction (one row at a time). busyId disables the row while a write runs.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(
    null,
  )

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      setCreateError('Enter a tag name.')
      return
    }
    setCreateError(null)
    setCreating(true)
    try {
      const result = await createTag({ teacherId, name: newName, color: newColor })
      if (result.error) {
        setCreateError(result.error)
        return
      }
      setNewName('')
      setNewColor(null)
      router.refresh()
    } finally {
      setCreating(false)
    }
  }

  function startEdit(tag: TagWithUsage) {
    setRowError(null)
    setConfirmingId(null)
    setEditingId(tag.id)
    setEditName(tag.name)
  }

  async function handleRename(tag: TagWithUsage) {
    if (!editName.trim()) {
      setRowError({ id: tag.id, text: 'Enter a tag name.' })
      return
    }
    setRowError(null)
    setBusyId(tag.id)
    try {
      const result = await renameTag({ teacherId, tagId: tag.id, name: editName })
      if (result.error) {
        setRowError({ id: tag.id, text: result.error })
        return
      }
      setEditingId(null)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(tag: TagWithUsage) {
    setRowError(null)
    setBusyId(tag.id)
    try {
      const result = await deleteTag({ teacherId, tagId: tag.id })
      if (result.error) {
        setRowError({ id: tag.id, text: result.error })
        return
      }
      setConfirmingId(null)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create */}
      <form
        onSubmit={handleCreate}
        className="rounded-lg border border-line bg-surface p-4"
      >
        <label className="mb-1 block text-sm font-medium text-fg">New tag</label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={MAX_TAG_NAME_LEN}
            placeholder="e.g. VIP"
            disabled={creating}
            className="flex-1 rounded-md border border-line-strong bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-fg-muted focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-inverse px-3 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Adding…' : 'Add tag'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-fg-muted">Color (optional):</span>
          <button
            type="button"
            onClick={() => setNewColor(null)}
            aria-label="No color"
            className={`flex h-6 w-6 items-center justify-center rounded-full border border-line-strong text-fg-muted ${
              newColor === null ? 'ring-2 ring-ring ring-offset-1 ring-offset-surface' : ''
            }`}
          >
            <X className="h-3 w-3" />
          </button>
          {PRESET_COLORS.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setNewColor(hex)}
              aria-label={`Color ${hex}`}
              style={{ backgroundColor: hex }}
              className={`h-6 w-6 rounded-full ${
                newColor === hex ? 'ring-2 ring-ring ring-offset-1 ring-offset-surface' : ''
              }`}
            />
          ))}
        </div>

        {createError && (
          <p className="mt-2 text-xs text-danger-text">{createError}</p>
        )}
      </form>

      {/* List */}
      {tags.length === 0 ? (
        <p className="text-sm text-fg-muted">No tags yet. Add one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((tag) => {
            const isEditing = editingId === tag.id
            const isConfirming = confirmingId === tag.id
            const isBusy = busyId === tag.id
            const err = rowError?.id === tag.id ? rowError.text : null

            return (
              <li
                key={tag.id}
                className="rounded-lg border border-line bg-surface p-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    style={{ backgroundColor: tag.color ?? undefined }}
                    className={`h-3 w-3 shrink-0 rounded-full ${
                      tag.color ? '' : 'border border-line-strong'
                    }`}
                  />

                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={MAX_TAG_NAME_LEN}
                      disabled={isBusy}
                      autoFocus
                      className="min-w-0 flex-1 rounded-md border border-line-strong bg-canvas px-2 py-1 text-sm text-fg focus:border-fg-muted focus:outline-none disabled:opacity-50"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-fg">{tag.name}</p>
                      <p className="text-xs text-fg-muted">
                        {tag.topicCount} {tag.topicCount === 1 ? 'topic' : 'topics'}
                        {' · '}
                        {tag.memberCount}{' '}
                        {tag.memberCount === 1 ? 'member' : 'members'}
                      </p>
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRename(tag)}
                          disabled={isBusy}
                          aria-label="Save name"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary hover:bg-hover-subtle disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={isBusy}
                          aria-label="Cancel"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover-subtle disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      !isConfirming && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(tag)}
                            aria-label="Rename tag"
                            className="flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary hover:bg-hover-subtle"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRowError(null)
                              setEditingId(null)
                              setConfirmingId(tag.id)
                            }}
                            aria-label="Delete tag"
                            className="flex h-8 w-8 items-center justify-center rounded-md text-danger-text hover:bg-hover-subtle"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>

                {isConfirming && (
                  <div className="mt-3 rounded-md border border-line bg-canvas p-3">
                    <p className="text-sm text-fg">
                      Delete <span className="font-medium">{tag.name}</span>? It is
                      required on{' '}
                      <span className="font-medium">
                        {tag.topicCount} {tag.topicCount === 1 ? 'topic' : 'topics'}
                      </span>{' '}
                      and held by{' '}
                      <span className="font-medium">
                        {tag.memberCount}{' '}
                        {tag.memberCount === 1 ? 'member' : 'members'}
                      </span>
                      . Those gates and assignments will be removed.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(tag)}
                        disabled={isBusy}
                        className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
                      >
                        {isBusy ? 'Deleting…' : 'Delete tag'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={isBusy}
                        className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-hover-subtle disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {err && <p className="mt-2 text-xs text-danger-text">{err}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
