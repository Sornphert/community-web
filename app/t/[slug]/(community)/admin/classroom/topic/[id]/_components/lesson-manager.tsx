'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Film,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useToast } from '@/app/_components/toast'
import type { ContentItem, LessonFolder, Topic } from '@/lib/types'
import {
  createLessonFolder,
  deleteContentItem,
  deleteLessonFolder,
  renameLessonFolder,
} from '../../../actions'
import { AddLesson } from './add-lesson'

// Serializable tree (mirrors lib/lessons LessonTree/LessonTreeNode).
type Node = {
  folder: LessonFolder
  children: Node[]
  lessons: Pick<ContentItem, 'id' | 'title' | 'type'>[]
}
type Tree = {
  rootLessons: Pick<ContentItem, 'id' | 'title' | 'type'>[]
  folders: Node[]
}

const MAX_DEPTH = 3

export function LessonManager({
  teacherId,
  uid,
  topic,
  tree,
}: {
  teacherId: string
  uid: string
  topic: Topic
  tree: Tree
}) {
  return (
    <div className="flex flex-col gap-2">
      {tree.folders.map((node) => (
        <FolderNode
          key={node.folder.id}
          node={node}
          depth={1}
          teacherId={teacherId}
          uid={uid}
          topic={topic}
        />
      ))}

      {tree.rootLessons.map((lesson) => (
        <LessonRow key={lesson.id} lesson={lesson} teacherId={teacherId} />
      ))}

      <RootActions teacherId={teacherId} uid={uid} topic={topic} />
    </div>
  )
}

// Root-level "add folder" + "add lesson".
function RootActions({
  teacherId,
  uid,
  topic,
}: {
  teacherId: string
  uid: string
  topic: Topic
}) {
  const [mode, setMode] = useState<null | 'folder' | 'lesson'>(null)
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === 'folder' ? null : 'folder')}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-muted"
        >
          <FolderPlus className="h-4 w-4" />
          Add folder
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'lesson' ? null : 'lesson')}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-muted"
        >
          <FilePlus2 className="h-4 w-4" />
          Add lesson
        </button>
      </div>
      {mode === 'folder' && (
        <AddFolderForm
          teacherId={teacherId}
          topicId={topic.id}
          parentFolderId={null}
          onDone={() => setMode(null)}
        />
      )}
      {mode === 'lesson' && (
        <AddLesson teacherId={teacherId} uid={uid} topic={topic} folderId={null} />
      )}
    </div>
  )
}

function FolderNode({
  node,
  depth,
  teacherId,
  uid,
  topic,
}: {
  node: Node
  depth: number
  teacherId: string
  uid: string
  topic: Topic
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.folder.name)
  const [adding, setAdding] = useState<null | 'folder' | 'lesson'>(null)

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === node.folder.name) {
      setRenaming(false)
      setName(node.folder.name)
      return
    }
    const r = await renameLessonFolder({
      teacherId,
      folderId: node.folder.id,
      name: trimmed,
    })
    if (r.error) return showToast(r.error, 'error')
    setRenaming(false)
    router.refresh()
  }

  async function del() {
    if (
      !window.confirm(
        `Delete folder “${node.folder.name}”? Sub-folders are removed; its lessons move to the top level.`,
      )
    )
      return
    const r = await deleteLessonFolder({ teacherId, folderId: node.folder.id })
    if (r.error) return showToast(r.error, 'error')
    showToast('Folder deleted', 'success')
    router.refresh()
  }

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-6 w-6 items-center justify-center text-fg-muted"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') {
                setRenaming(false)
                setName(node.folder.name)
              }
            }}
            onBlur={saveName}
            className="flex-1 rounded-md border border-line-strong px-2 py-1 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-fg">
            {node.folder.name}
          </span>
        )}

        <div className="flex items-center gap-0.5">
          {depth < MAX_DEPTH && (
            <button
              type="button"
              onClick={() => setAdding(adding === 'folder' ? null : 'folder')}
              aria-label="Add sub-folder"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding(adding === 'lesson' ? null : 'lesson')}
            aria-label="Add lesson"
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            aria-label="Rename folder"
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={del}
            aria-label="Delete folder"
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-2 border-t border-line py-2 pl-6 pr-2">
          {node.children.map((child) => (
            <FolderNode
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              teacherId={teacherId}
              uid={uid}
              topic={topic}
            />
          ))}
          {node.lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} teacherId={teacherId} />
          ))}
          {node.children.length === 0 && node.lessons.length === 0 && (
            <p className="px-1 text-xs text-fg-muted">Empty folder.</p>
          )}

          {adding === 'folder' && (
            <AddFolderForm
              teacherId={teacherId}
              topicId={topic.id}
              parentFolderId={node.folder.id}
              onDone={() => setAdding(null)}
            />
          )}
          {adding === 'lesson' && (
            <AddLesson
              teacherId={teacherId}
              uid={uid}
              topic={topic}
              folderId={node.folder.id}
            />
          )}
        </div>
      )}
    </div>
  )
}

function LessonRow({
  lesson,
  teacherId,
}: {
  lesson: Pick<ContentItem, 'id' | 'title' | 'type'>
  teacherId: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  async function del() {
    if (!window.confirm(`Delete “${lesson.title}”?`)) return
    setBusy(true)
    const r = await deleteContentItem({ teacherId, itemId: lesson.id })
    setBusy(false)
    if (r.error) return showToast(r.error, 'error')
    showToast('Lesson deleted', 'success')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2">
      {lesson.type === 'video' ? (
        <Film className="h-4 w-4 shrink-0 text-fg-muted" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-fg-muted" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-fg">
        {lesson.title}
      </span>
      <button
        type="button"
        onClick={del}
        disabled={busy}
        aria-label={`Delete ${lesson.title}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function AddFolderForm({
  teacherId,
  topicId,
  parentFolderId,
  onDone,
}: {
  teacherId: string
  topicId: string
  parentFolderId: string | null
  onDone: () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    const r = await createLessonFolder({
      teacherId,
      topicId,
      parentFolderId,
      name,
    })
    setBusy(false)
    if (r.error) return showToast(r.error, 'error')
    setName('')
    onDone()
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Folder name"
        className="flex-1 rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg hover:bg-inverse-hover disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}
