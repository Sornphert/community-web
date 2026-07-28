'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Plus,
  PlayCircle,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import type { ClassroomRecording } from '@/lib/types'
import type { RecordingTreeNode } from '@/lib/recordings'
import {
  createFolder,
  createRecording,
  deleteFolder,
  deleteRecording,
  refreshRecordingStatus,
  updateFolder,
  updateRecording,
} from '../actions'
import { RecordingUpload } from './recording-upload'

const INDENT = ['', 'pl-4', 'pl-8', 'pl-12']

function indentClass(depth: number): string {
  return INDENT[Math.min(depth, INDENT.length - 1)]
}

function nextPosition(items: { position: number }[]): number {
  return items.length === 0
    ? 0
    : Math.max(...items.map((item) => item.position)) + 1
}

type ModalState =
  | { kind: 'folder-create'; parentId: string | null; parentLabel: string; position: number }
  | { kind: 'folder-edit'; id: string; name: string; parentLabel: string; position: number }
  | { kind: 'recording-create'; folderId: string; position: number }
  | { kind: 'recording-edit'; recording: ClassroomRecording }
  | { kind: 'delete'; target: 'folder' | 'recording'; id: string; name: string }
  | null

// ---------------------------------------------------------------------------
// Modal shell (overlay + card + Escape/click-outside close) — likers-modal style.
// ---------------------------------------------------------------------------

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-fg-faint hover:bg-muted hover:text-fg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50'
const labelClass = 'mb-1 block text-sm font-medium text-fg-secondary'
const primaryBtn =
  'rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50'
const secondaryBtn =
  'rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted disabled:opacity-50'

// ---------------------------------------------------------------------------
// Folder create/edit modal
// ---------------------------------------------------------------------------

function FolderModal({
  title,
  initialName,
  initialPosition,
  parentLabel,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string
  initialName: string
  initialPosition: number
  parentLabel: string
  submitLabel: string
  onSubmit: (values: { name: string; position: number }) => Promise<{ error?: string }>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsPending(true)
    setError(null)
    // Position is auto-assigned (append / keep existing); reorder by dragging.
    const result = await onSubmit({ name, position: initialPosition })
    if (result.error) {
      setError(result.error)
      setIsPending(false)
    } else {
      onClose()
    }
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            autoFocus
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Parent folder</label>
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-fg-soft">
            {parentLabel}
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={isPending} className={primaryBtn}>
            {isPending ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Recording create/edit modal
// ---------------------------------------------------------------------------

function RecordingModal({
  title,
  recording,
  initialPosition,
  teacherId,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string
  // Present in edit mode; absent in create mode (set once created below).
  recording?: ClassroomRecording
  // Auto-assigned position (append on create; existing on edit). No manual field.
  initialPosition: number
  teacherId: string
  submitLabel: string
  onSubmit: (values: {
    title: string
    description: string
    position: number
  }) => Promise<{ error?: string; recording?: ClassroomRecording }>
  onClose: () => void
}) {
  const [titleValue, setTitleValue] = useState(recording?.title ?? '')
  const [description, setDescription] = useState(recording?.description ?? '')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // In create mode, the row just created — switches the footer to the upload step.
  const [createdRecording, setCreatedRecording] =
    useState<ClassroomRecording | null>(null)

  // The recording whose video we upload: the edited one, or the just-created one.
  const uploadRecording = recording ?? createdRecording
  const justCreated = !recording && createdRecording !== null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsPending(true)
    setError(null)
    const result = await onSubmit({
      title: titleValue,
      description,
      position: recording?.position ?? initialPosition,
    })
    if (result.error) {
      setError(result.error)
      setIsPending(false)
      return
    }
    if (result.recording && !recording) {
      // Create flow: keep the modal open and reveal the upload area.
      setCreatedRecording(result.recording)
      setIsPending(false)
    } else {
      // Edit flow: metadata saved.
      onClose()
    }
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Title</label>
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            disabled={isPending || justCreated}
            autoFocus
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending || justCreated}
            rows={4}
            className={inputClass}
          />
        </div>
        {error && (
          <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        {uploadRecording ? (
          <div>
            <span className={labelClass}>Video</span>
            <RecordingUpload
              recording={uploadRecording}
              teacherId={teacherId}
              onUploaded={onClose}
            />
          </div>
        ) : (
          <p className="text-xs text-fg-faint">
            You can upload a video after creating the recording.
          </p>
        )}

        <div className="flex justify-end gap-2">
          {justCreated ? (
            <button type="button" onClick={onClose} className={primaryBtn}>
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className={secondaryBtn}>
                Cancel
              </button>
              <button type="submit" disabled={isPending} className={primaryBtn}>
                {isPending ? 'Saving…' : submitLabel}
              </button>
            </>
          )}
        </div>
      </form>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

function DeleteModal({
  target,
  name,
  onConfirm,
  onClose,
}: {
  target: 'folder' | 'recording'
  name: string
  onConfirm: () => Promise<{ error?: string }>
  onClose: () => void
}) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setIsPending(true)
    setError(null)
    const result = await onConfirm()
    if (result.error) {
      setError(result.error)
      setIsPending(false)
    } else {
      onClose()
    }
  }

  return (
    <ModalShell title="Delete" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-secondary">
          Delete <span className="font-medium text-fg">{name}</span>?
        </p>
        {target === 'folder' && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This also permanently deletes every subfolder and recording inside
            it.
          </p>
        )}

        {error && (
          <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Tree rows
// ---------------------------------------------------------------------------

const iconBtn = 'rounded p-1.5 text-fg-faint hover:bg-muted hover:text-fg-secondary'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'bg-green-50 text-green-700' },
  processing: { label: 'Processing', className: 'bg-amber-50 text-amber-700' },
  failed: { label: 'Failed', className: 'bg-danger-subtle text-danger-text' },
  pending: { label: 'No video', className: 'bg-muted text-fg-muted' },
}

function StatusBadge({ status }: { status: string | null }) {
  const badge = STATUS_BADGE[status ?? 'pending'] ?? STATUS_BADGE.pending
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}

function AdminRecordingRow({
  recording,
  teacherId,
  onEdit,
  onDelete,
}: {
  recording: ClassroomRecording
  teacherId: string
  onEdit: () => void
  onDelete: () => void
}) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    const result = await refreshRecordingStatus(teacherId, recording.id)
    setRefreshing(false)
    if (!result.error) {
      router.refresh()
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {recording.video_status === 'ready' && recording.video_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recording.video_thumbnail_url}
            alt={recording.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <PlayCircle className="h-5 w-5 text-fg-faint" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-medium text-fg">{recording.title}</p>
        <StatusBadge status={recording.video_status} />
      </div>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Refresh video status"
        title="Refresh video status"
        className={iconBtn}
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
      <button type="button" onClick={onEdit} aria-label="Edit recording" className={iconBtn}>
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete recording"
        className={iconBtn}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function AdminFolderNode({
  node,
  depth,
  parentLabel,
  teacherId,
  expanded,
  onToggle,
  onModal,
}: {
  node: RecordingTreeNode
  depth: number
  parentLabel: string
  teacherId: string
  expanded: Set<string>
  onToggle: (id: string) => void
  onModal: (state: ModalState) => void
}) {
  const isOpen = expanded.has(node.folder.id)
  const isEmpty = node.recordings.length === 0 && node.children.length === 0

  return (
    <div>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-2 pl-3">
        <button
          type="button"
          onClick={() => onToggle(node.folder.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
          )}
          <span className="truncate font-medium text-fg">
            {node.folder.name}
          </span>
        </button>

        <button
          type="button"
          aria-label="Add recording"
          title="Add recording"
          onClick={() =>
            onModal({
              kind: 'recording-create',
              folderId: node.folder.id,
              position: nextPosition(node.recordings),
            })
          }
          className={iconBtn}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Add subfolder"
          title="Add subfolder"
          onClick={() =>
            onModal({
              kind: 'folder-create',
              parentId: node.folder.id,
              parentLabel: node.folder.name,
              position: nextPosition(node.children.map((child) => child.folder)),
            })
          }
          className={iconBtn}
        >
          <FolderPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Edit folder"
          title="Edit folder"
          onClick={() =>
            onModal({
              kind: 'folder-edit',
              id: node.folder.id,
              name: node.folder.name,
              parentLabel,
              position: node.folder.position,
            })
          }
          className={iconBtn}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Delete folder"
          title="Delete folder"
          onClick={() =>
            onModal({
              kind: 'delete',
              target: 'folder',
              id: node.folder.id,
              name: node.folder.name,
            })
          }
          className={iconBtn}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isOpen && (
        <div
          className={`mt-2 flex flex-col gap-2 border-l border-line ${indentClass(
            depth + 1,
          )}`}
        >
          {isEmpty ? (
            <p className="px-3 py-2 text-sm italic text-fg-faint">
              No recordings in this folder yet
            </p>
          ) : (
            <>
              {node.children.map((child) => (
                <AdminFolderNode
                  key={child.folder.id}
                  node={child}
                  depth={depth + 1}
                  parentLabel={node.folder.name}
                  teacherId={teacherId}
                  expanded={expanded}
                  onToggle={onToggle}
                  onModal={onModal}
                />
              ))}
              {node.recordings.map((recording) => (
                <AdminRecordingRow
                  key={recording.id}
                  recording={recording}
                  teacherId={teacherId}
                  onEdit={() =>
                    onModal({ kind: 'recording-edit', recording })
                  }
                  onDelete={() =>
                    onModal({
                      kind: 'delete',
                      target: 'recording',
                      id: recording.id,
                      name: recording.title,
                    })
                  }
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root tree + modal orchestration
// ---------------------------------------------------------------------------

export function AdminRecordingsTree({
  tree,
  teacherId,
}: {
  tree: RecordingTreeNode[]
  teacherId: string
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState>(null)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function closeModal() {
    setModal(null)
    router.refresh()
  }

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setModal({
            kind: 'folder-create',
            parentId: null,
            parentLabel: 'Root',
            position: nextPosition(tree.map((node) => node.folder)),
          })
        }
        className="mb-4 inline-flex items-center gap-1 rounded-md bg-inverse px-3 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
      >
        <Plus className="h-4 w-4" />
        New Folder
      </button>

      {tree.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-fg-muted">
          No folders yet. Create one to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {tree.map((node) => (
            <AdminFolderNode
              key={node.folder.id}
              node={node}
              depth={0}
              parentLabel="Root"
              teacherId={teacherId}
              expanded={expanded}
              onToggle={toggle}
              onModal={setModal}
            />
          ))}
        </div>
      )}

      {modal?.kind === 'folder-create' && (
        <FolderModal
          title="New Folder"
          initialName=""
          initialPosition={modal.position}
          parentLabel={modal.parentLabel}
          submitLabel="Create"
          onClose={closeModal}
          onSubmit={({ name, position }) =>
            createFolder({
              teacherId,
              name,
              position,
              parentFolderId: modal.parentId,
            })
          }
        />
      )}

      {modal?.kind === 'folder-edit' && (
        <FolderModal
          title="Edit Folder"
          initialName={modal.name}
          initialPosition={modal.position}
          parentLabel={modal.parentLabel}
          submitLabel="Save"
          onClose={closeModal}
          onSubmit={({ name, position }) =>
            updateFolder({ teacherId, id: modal.id, name, position })
          }
        />
      )}

      {modal?.kind === 'recording-create' && (
        <RecordingModal
          title="Add Recording"
          teacherId={teacherId}
          initialPosition={modal.position}
          submitLabel="Create"
          onClose={closeModal}
          onSubmit={({ title, description, position }) =>
            createRecording({
              teacherId,
              folderId: modal.folderId,
              title,
              description,
              position,
            })
          }
        />
      )}

      {modal?.kind === 'recording-edit' && (
        <RecordingModal
          title="Edit Recording"
          recording={modal.recording}
          initialPosition={modal.recording.position}
          teacherId={teacherId}
          submitLabel="Save"
          onClose={closeModal}
          onSubmit={({ title, description, position }) =>
            updateRecording({
              teacherId,
              id: modal.recording.id,
              title,
              description,
              position,
            })
          }
        />
      )}

      {modal?.kind === 'delete' && (
        <DeleteModal
          target={modal.target}
          name={modal.name}
          onClose={closeModal}
          onConfirm={() =>
            modal.target === 'folder'
              ? deleteFolder({ teacherId, id: modal.id })
              : deleteRecording({ teacherId, id: modal.id })
          }
        />
      )}
    </div>
  )
}
