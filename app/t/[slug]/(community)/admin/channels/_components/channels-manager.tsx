'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Channel } from '@/lib/types'
import { MAX_CHANNEL_NAME_LEN } from '@/lib/channel-constants'
import {
  createChannel,
  deleteChannel,
  renameChannel,
  reorderChannels,
} from '../actions'

type Permission = 'all' | 'admin_only'

// Small two-button segmented control for the post-permission choice. Literal class
// strings only (Tailwind v4 can't see template-built names).
function PermissionToggle({
  value,
  onChange,
  disabled,
}: {
  value: Permission
  onChange: (v: Permission) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line-strong">
      <button
        type="button"
        onClick={() => onChange('all')}
        disabled={disabled}
        className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          value === 'all'
            ? 'bg-inverse text-inverse-fg'
            : 'bg-canvas text-fg-secondary hover:bg-hover-subtle'
        }`}
      >
        All members
      </button>
      <button
        type="button"
        onClick={() => onChange('admin_only')}
        disabled={disabled}
        className={`border-l border-line-strong px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          value === 'admin_only'
            ? 'bg-inverse text-inverse-fg'
            : 'bg-canvas text-fg-secondary hover:bg-hover-subtle'
        }`}
      >
        Admins only
      </button>
    </div>
  )
}

export function ChannelsManager({
  teacherId,
  channels,
  postCounts,
}: {
  teacherId: string
  channels: Channel[]
  postCounts: Record<string, number>
}) {
  const router = useRouter()

  // Create form
  const [newName, setNewName] = useState('')
  const [newPermission, setNewPermission] = useState<Permission>('all')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Per-row interaction (one row at a time). busyId disables the row while a write runs.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPermission, setEditPermission] = useState<Permission>('all')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(
    null,
  )

  // Reorder is a whole-list operation, so its busy flag + error live outside the rows.
  const [reordering, setReordering] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)

  // Drag-to-reorder: a local optimistic copy of the list so the drop feels instant,
  // re-synced from the server whenever the prop changes (create/rename/delete refresh).
  const [order, setOrder] = useState<Channel[]>(channels)
  const dragIndex = useRef<number | null>(null)
  // Insertion point (0..length): where the dragged row will land, drawn as a bar in
  // the gap between rows so it feels like dropping BETWEEN channels.
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(channels)
  }, [channels])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      setCreateError('Enter a channel name.')
      return
    }
    setCreateError(null)
    setCreating(true)
    try {
      const result = await createChannel({
        teacherId,
        name: newName,
        postPermission: newPermission,
      })
      if (result.error) {
        setCreateError(result.error)
        return
      }
      setNewName('')
      setNewPermission('all')
      router.refresh()
    } finally {
      setCreating(false)
    }
  }

  function startEdit(channel: Channel) {
    setRowError(null)
    setConfirmingId(null)
    setEditingId(channel.id)
    setEditName(channel.name)
    setEditPermission(channel.post_permission)
  }

  async function handleRename(channel: Channel) {
    if (!editName.trim()) {
      setRowError({ id: channel.id, text: 'Enter a channel name.' })
      return
    }
    setRowError(null)
    setBusyId(channel.id)
    try {
      const result = await renameChannel({
        teacherId,
        channelId: channel.id,
        name: editName,
        postPermission: editPermission,
      })
      if (result.error) {
        setRowError({ id: channel.id, text: result.error })
        return
      }
      setEditingId(null)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(channel: Channel) {
    setRowError(null)
    setBusyId(channel.id)
    try {
      const result = await deleteChannel({ teacherId, channelId: channel.id })
      if (result.error) {
        setRowError({ id: channel.id, text: result.error })
        return
      }
      setConfirmingId(null)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  // Cursor's top/bottom half of a row decides insert-before vs insert-after.
  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    setDropIndex(after ? index + 1 : index)
  }

  // Persist the drop by rebuilding the id order and rewriting all positions server-side.
  // Optimistic: reorder locally first so it feels instant. On error we refresh to real DB
  // state (always valid — positions have no constraint) and surface retry copy.
  function commitDrop() {
    const from = dragIndex.current
    const to = dropIndex
    dragIndex.current = null
    setDropIndex(null)
    setDraggingIndex(null)
    if (from === null || to === null) return
    // Removing `from` shifts later indices left by one.
    const target = from < to ? to - 1 : to
    if (target === from) return

    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(target, 0, moved)
    setOrder(next)

    setReorderError(null)
    setReordering(true)
    reorderChannels({ teacherId, orderedIds: next.map((c) => c.id) })
      .then((result) => {
        if (result.error) {
          setReorderError(result.error)
          router.refresh()
        }
      })
      .finally(() => setReordering(false))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create */}
      <form
        onSubmit={handleCreate}
        className="rounded-lg border border-line bg-surface p-4"
      >
        <label className="mb-1 block text-sm font-medium text-fg">
          New channel
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={MAX_CHANNEL_NAME_LEN}
            placeholder="e.g. Announcements"
            disabled={creating}
            className="flex-1 rounded-md border border-line-strong bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-fg-muted focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-inverse px-3 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Adding…' : 'Add channel'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-fg-muted">Who can post:</span>
          <PermissionToggle
            value={newPermission}
            onChange={setNewPermission}
            disabled={creating}
          />
        </div>

        {createError && (
          <p className="mt-2 text-xs text-danger-text">{createError}</p>
        )}
      </form>

      {reorderError && (
        <p className="text-xs text-danger-text">{reorderError}</p>
      )}

      {/* List */}
      {order.length === 0 ? (
        <p className="text-sm text-fg-muted">No channels yet. Add one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {order.map((channel, index) => {
            const isEditing = editingId === channel.id
            const isConfirming = confirmingId === channel.id
            const isBusy = busyId === channel.id
            const err = rowError?.id === channel.id ? rowError.text : null
            const postCount = postCounts[channel.id] ?? 0
            const hasPosts = postCount > 0
            // A row being edited or confirming deletion must not be draggable — that
            // would fight text selection and the confirm dialog. Also frozen while a
            // previous reorder is still saving, to avoid overlapping writes.
            const draggable = !isEditing && !isConfirming && !reordering

            return (
              <li
                key={channel.id}
                draggable={draggable}
                onDragStart={() => {
                  if (!draggable) return
                  dragIndex.current = index
                  setDraggingIndex(index)
                }}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={commitDrop}
                onDragEnd={() => {
                  dragIndex.current = null
                  setDropIndex(null)
                  setDraggingIndex(null)
                }}
                className={`relative rounded-lg border border-line bg-surface p-3 transition-shadow ${
                  draggingIndex === index ? 'opacity-40' : ''
                }`}
              >
                {/* Insertion indicators — a thin bar in the gap showing where it lands. */}
                {dropIndex === index && (
                  <span className="pointer-events-none absolute inset-x-1 top-0 z-30 h-1.5 -translate-y-1/2 rounded-full bg-inverse" />
                )}
                {dropIndex === order.length && index === order.length - 1 && (
                  <span className="pointer-events-none absolute inset-x-1 bottom-0 z-30 h-1.5 translate-y-1/2 rounded-full bg-inverse" />
                )}

                <div className="flex items-center gap-3">
                  {/* Drag handle (whole row is draggable; this is the affordance) */}
                  <span
                    aria-hidden
                    className={`flex h-8 w-6 shrink-0 items-center justify-center text-fg-faint ${
                      draggable
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'opacity-30'
                    }`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>

                  {isEditing ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={MAX_CHANNEL_NAME_LEN}
                        disabled={isBusy}
                        autoFocus
                        className="min-w-0 rounded-md border border-line-strong bg-canvas px-2 py-1 text-sm text-fg focus:border-fg-muted focus:outline-none disabled:opacity-50"
                      />
                      <PermissionToggle
                        value={editPermission}
                        onChange={setEditPermission}
                        disabled={isBusy}
                      />
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-fg">
                          {channel.name}
                        </p>
                        {channel.post_permission === 'admin_only' && (
                          <span className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-fg-muted">
                            Admins only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-fg-muted">
                        /{channel.slug} · {postCount}{' '}
                        {postCount === 1 ? 'post' : 'posts'}
                      </p>
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRename(channel)}
                          disabled={isBusy}
                          aria-label="Save channel"
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
                            onClick={() => startEdit(channel)}
                            aria-label="Rename channel"
                            className="flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary hover:bg-hover-subtle"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (hasPosts) return
                              setRowError(null)
                              setEditingId(null)
                              setConfirmingId(channel.id)
                            }}
                            disabled={hasPosts}
                            aria-label="Delete channel"
                            title={
                              hasPosts
                                ? `Has ${postCount} ${
                                    postCount === 1 ? 'post' : 'posts'
                                  } — move or delete them first`
                                : undefined
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-md text-danger-text hover:bg-hover-subtle disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>

                {/* Non-empty channels can't be deleted (RESTRICT). Explain inline. */}
                {!isEditing && !isConfirming && hasPosts && (
                  <p className="mt-2 text-xs text-fg-faint">
                    Has {postCount} {postCount === 1 ? 'post' : 'posts'} — move or
                    delete them before this channel can be deleted.
                  </p>
                )}

                {isConfirming && (
                  <div className="mt-3 rounded-md border border-line bg-canvas p-3">
                    <p className="text-sm text-fg">
                      Delete{' '}
                      <span className="font-medium">{channel.name}</span>? This
                      can’t be undone.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(channel)}
                        disabled={isBusy}
                        className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
                      >
                        {isBusy ? 'Deleting…' : 'Delete channel'}
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
