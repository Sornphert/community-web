'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronDown, ChevronRight, PlayCircle } from 'lucide-react'
import type { ClassroomRecording } from '@/lib/types'
import type { RecordingTreeNode } from '@/lib/recordings'

// Visual indentation is capped at 3 levels so deep nesting stays usable on
// mobile (anything deeper renders at the same indent as level 3).
const INDENT = ['', 'pl-4', 'pl-8', 'pl-12']

function indentClass(depth: number): string {
  return INDENT[Math.min(depth, INDENT.length - 1)]
}

// Total recordings anywhere under this folder (recursive), shown as the count.
function countRecordings(node: RecordingTreeNode): number {
  return (
    node.recordings.length +
    node.children.reduce((sum, child) => sum + countRecordings(child), 0)
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Walk the tree to find the target folder, returning the ids of it and all its
// ancestors (so a #folder-{id} link can open the tree straight to that folder).
function idsToExpandFor(
  nodes: RecordingTreeNode[],
  targetId: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    const path = [...trail, node.folder.id]
    if (node.folder.id === targetId) return path
    const found = idsToExpandFor(node.children, targetId, path)
    if (found) return found
  }
  return null
}

function RecordingRow({
  recording,
  completed,
}: {
  recording: ClassroomRecording
  completed: boolean
}) {
  return (
    <Link
      href={`/classroom/recordings/${recording.id}`}
      className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 hover:bg-zinc-50"
    >
      <div className="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-100">
        {recording.video_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recording.video_thumbnail_url}
            alt={recording.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <PlayCircle className="h-6 w-6 text-zinc-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium text-zinc-900">
          {recording.title}
        </p>
        {recording.video_duration_seconds != null && (
          <p className="text-xs text-zinc-500">
            {formatDuration(recording.video_duration_seconds)}
          </p>
        )}
      </div>

      {completed && (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
      )}
    </Link>
  )
}

function FolderNode({
  node,
  depth,
  expanded,
  onToggle,
  completedIds,
}: {
  node: RecordingTreeNode
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  completedIds: Set<string>
}) {
  const isOpen = expanded.has(node.folder.id)
  const count = countRecordings(node)
  const isEmpty = node.recordings.length === 0 && node.children.length === 0

  return (
    <div id={`folder-${node.folder.id}`} className="scroll-mt-4">
      <button
        type="button"
        onClick={() => onToggle(node.folder.id)}
        className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
          {node.folder.name}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">
          {count} {count === 1 ? 'recording' : 'recordings'}
        </span>
      </button>

      {isOpen && (
        <div
          className={`mt-2 flex flex-col gap-2 border-l border-zinc-200 ${indentClass(
            depth + 1,
          )}`}
        >
          {isEmpty ? (
            <p className="px-3 py-2 text-sm italic text-zinc-400">
              No recordings in this folder yet
            </p>
          ) : (
            <>
              {node.children.map((child) => (
                <FolderNode
                  key={child.folder.id}
                  node={child}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  completedIds={completedIds}
                />
              ))}
              {node.recordings.map((recording) => (
                <RecordingRow
                  key={recording.id}
                  recording={recording}
                  completed={completedIds.has(recording.id)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function RecordingsTree({
  tree,
  completedIds,
}: {
  tree: RecordingTreeNode[]
  completedIds: Set<string>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Open the tree to a folder linked via /classroom/recordings#folder-{id}
  // (used by the recording-page breadcrumb). Deferred to a rAF callback so the
  // state update isn't synchronous in the effect body, and so the scroll lands
  // after paint.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#folder-')) return
    const targetId = hash.slice('#folder-'.length)
    const ids = idsToExpandFor(tree, targetId)
    if (!ids) return

    const raf = requestAnimationFrame(() => {
      setExpanded(new Set(ids))
      document
        .getElementById(`folder-${targetId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(raf)
  }, [tree])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {tree.map((node) => (
        <FolderNode
          key={node.folder.id}
          node={node}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          completedIds={completedIds}
        />
      ))}
    </div>
  )
}
